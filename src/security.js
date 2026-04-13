//Применяет защитные HTTP-заголовки.
export function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
}

//Устанавливает CORS-заголовки для доверенных источников.
export function applyCors(req, res, trustedOrigins) {
  const origin = req.headers.origin;
  if (!origin) return;

  if (trustedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Request-Id');
    // Опционально: поддержка credentials (если будут запросы с куками)
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
}

// Ограничитель частоты на основе скользящего окна с хранением меток времени.
export function createRateLimiter({ list, get, create }) {
  const store = new Map(); // ключ: IP, значение: { list: [], get: [], create: [] }
  const WINDOW_MS = 60_000;

  function getClientKey(req) {
    return req.socket.remoteAddress ?? 'unknown';
  }

  function getRequestType(req) {
    const method = req.method;
    const url = req.url ?? '/';
    if (method === 'GET' && url === '/api/items') return 'list';
    if (method === 'GET' && url.startsWith('/api/items/by-id/')) return 'get';
    if (method === 'POST' && url === '/api/items') return 'create';
    return null;
  }

  return {
    //Проверяет, разрешён ли запрос. Если нет – возвращает false.
    allow(req) {
      const type = getRequestType(req);
      if (!type) return true;

      const limit = type === 'list' ? list : type === 'get' ? get : create;
      const key = getClientKey(req);
      const now = Date.now();

      if (!store.has(key)) {
        store.set(key, { list: [], get: [], create: [] });
      }
      const buckets = store.get(key);
      const timestamps = buckets[type];

      // Удаляем устаревшие метки (старше 60 сек)
      const windowStart = now - WINDOW_MS;
      while (timestamps.length > 0 && timestamps[0] < windowStart) {
        timestamps.shift();
      }

      if (timestamps.length >= limit) {
        return false;
      }

      timestamps.push(now);
      return true;
    },

    //Возвращает количество секунд до сброса лимита для заданного запроса. Используется для заголовка Retry-After.
    getRetryAfterSeconds(req) {
      const type = getRequestType(req);
      if (!type) return null;

      const key = getClientKey(req);
      const buckets = store.get(key);
      if (!buckets) return null;

      const timestamps = buckets[type];
      if (timestamps.length === 0) return null;

      const now = Date.now();
      const oldest = timestamps[0];
      const expiresAt = oldest + WINDOW_MS;
      const seconds = Math.ceil((expiresAt - now) / 1000);
      return seconds > 0 ? seconds : 1;
    },

    // Для тестирования
    _reset() {
      store.clear();
    }
  };
}