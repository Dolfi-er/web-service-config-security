// src/server.js
import http from 'node:http';
import { URL } from 'node:url';
import {
  resolveConfigFromThreeSources,
  defaultConfigPath,
  validateConfig,
  getMode,
  getPort,
  getTrustedOrigins,
  getRateLimits
} from './config.js';
import {
  applySecurityHeaders,
  applyCors,
  createRateLimiter
} from './security.js';
import { createItemsRepo } from './items.js';

// 1. Загрузка конфигурации
const configPath = defaultConfigPath();
let cfg;
try {
  cfg = resolveConfigFromThreeSources({
    configPath,
    env: process.env,
    argv: process.argv.slice(2)
  });
} catch (err) {
  console.error('Ошибка загрузки конфигурации:', err.message);
  process.exit(1);
}

// 2. Валидация
const errors = validateConfig(cfg);
if (errors.length > 0) {
  console.error('Некорректные настройки. Запуск остановлен.');
  errors.forEach(e => console.error(' -', e));
  process.exit(1);
}

// 3. Получение значений
const mode = getMode(cfg);
const port = getPort(cfg);
const trustedOrigins = getTrustedOrigins(cfg);
const limits = getRateLimits(cfg); // { list, get, create }

// 4. Инициализация компонентов
const repo = createItemsRepo();
const limiter = createRateLimiter(limits);

// 5. HTTP сервер
const server = http.createServer(async (req, res) => {
  // Защитные заголовки для всех ответов
  applySecurityHeaders(res);
  // CORS (включая предварительные запросы)
  applyCors(req, res, trustedOrigins);

  // Обработка предварительных запросов CORS
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Проверка лимита запросов
  if (!limiter.allow(req)) {
    const retryAfter = limiter.getRetryAfterSeconds(req) ?? 60;
    res.statusCode = 429;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Retry-After', String(retryAfter));
    res.end('Слишком много запросов. Попробуйте позже.');
    return;
  }

  // Обработка маршрутов
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // GET /api/items - список элементов
    if (req.method === 'GET' && pathname === '/api/items') {
      const items = repo.list();
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(items));
      return;
    }

    // GET /api/items/by-id/:id - получить элемент по ID
    if (req.method === 'GET' && pathname.startsWith('/api/items/by-id/')) {
      const id = pathname.split('/').pop();
      if (!id) {
        throw new Error('Не указан идентификатор элемента');
      }
      const item = repo.get(id);
      if (!item) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Элемент не найден');
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(item));
      return;
    }

    // POST /api/items - создание нового элемента
    if (req.method === 'POST' && pathname === '/api/items') {
      const body = await readRequestBody(req);
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        throw new Error('Тело запроса не является корректным JSON');
      }

      const name = data.name;
      const price = data.price;
      const created = repo.create(name, price);

      res.statusCode = 201;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Location', `/api/items/by-id/${created.id}`);
      res.end(JSON.stringify(created));
      return;
    }

    // GET /api/mode - текущий режим работы
    if (req.method === 'GET' && pathname === '/api/mode') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ mode }));
      return;
    }

    // Остальные маршруты - 404
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Маршрут не найден');
  } catch (err) {
    // Обработка ошибок в зависимости от режима
    res.statusCode = err.statusCode || 400;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');

    const message = mode === 'учебный'
      ? err.message || 'Неизвестная ошибка'
      : 'Ошибка обработки запроса';

    res.end(message);
  }
});

// Запуск сервера
server.listen(port, () => {
  console.log(`Сервер запущен на порту ${port} в режиме "${mode}"`);
  console.log(`Доверенные источники: ${trustedOrigins.join(', ')}`);
  console.log(`Лимиты: list=${limits.list}/мин, get=${limits.get}/мин, create=${limits.create}/мин`);
});

// Вспомогательная функция для чтения тела запроса
function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}