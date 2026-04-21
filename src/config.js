import fs from "node:fs";
import path from "node:path";

// Парсинг аргументов командной строки вида --key=value
export function parseArgs(argv) {
    const result = {};
    for (const arg of argv) {
        if (!arg.startsWith("--")) continue;
        const eqIndex = arg.indexOf('=');
        if (eqIndex === -1) continue;
        const key = arg.slice(2, eqIndex);
        const value = arg.slice(eqIndex + 1);
        result[key] = value;
    }
    return result;
}

// Чтение и парсинг JSON-файла конфигурации
export function readFileConfig(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
}

// Сбор итоговой конфигурации с учетом приоритета:
export function buildConfig({ fileCfg, env, args }) {
    const config = structuredClone(fileCfg ?? {});
    config.app = config.app ?? {};

    // Применяем переменные окружения (приоритет 2)
    applyEnvOverrides(config.app, env);

    // Применяем аргументы командной строки (приоритет 1)
    applyArgsOverrides(config.app, args);

    return config;
}

function applyEnvOverrides(app, env) {
    if (env.APP_MODE) app.mode = env.APP_MODE;
    if (env.APP_PORT) app.port = Number(env.APP_PORT);
    if (env.APP_TRUSTED_ORIGINS) {
        app.trustedOrigins = env.APP_TRUSTED_ORIGINS.split(',')
            .map(s => s.trim())
            .filter(Boolean);
    }

    // Лимиты
    if (env.APP_RATE_LIMIT_LIST) setRateLimit(app, 'list', Number(env.APP_RATE_LIMIT_LIST));
    if (env.APP_RATE_LIMIT_GET) setRateLimit(app, 'get', Number(env.APP_RATE_LIMIT_GET));
    if (env.APP_RATE_LIMIT_CREATE) setRateLimit(app, 'create', Number(env.APP_RATE_LIMIT_CREATE)); // исправлено CFREATE → CREATE
}

function applyArgsOverrides(app, args) {
    if (args.mode) app.mode = args.mode;
    if (args.port) app.port = Number(args.port);
    if (args.trustedOrigins) {
        app.trustedOrigins = args.trustedOrigins.split(',')
            .map(s => s.trim())
            .filter(Boolean);
    }

    // Лимиты
    if (args.rateLimitList) setRateLimit(app, 'list', Number(args.rateLimitList));      // исправлено rateLimnitList → rateLimitList
    if (args.rateLimitGet) setRateLimit(app, 'get', Number(args.rateLimitGet));         // исправлено rateLimnitGet → rateLimitGet
    if (args.rateLimitCreate) setRateLimit(app, 'create', Number(args.rateLimitCreate));// исправлено rateLimnitCreate → rateLimitCreate
}

function setRateLimit(app, key, value) {
    app.rateLimits = app.rateLimits ?? {};
    app.rateLimits[key] = value;
}

// Проверка корректности конфигурации
export function validateConfig(cfg){
    const errors = [];
    const app = cfg.app ?? {};

    // Проверка режима
    const mode = String(app.mode ?? '').toLowerCase();
    if (mode !== 'учебный' && mode !== 'боевой'){
        errors.push('Режим работы задан неверно, допустимы учебный и боевой'); // изменено под тест
    } 

    // Порт
    const port = Number(app.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        errors.push('Порт задан неверно, значение должно быть целым числом от 1 до 65535'); // изменено под тест
    }

    // Доверенные источники
    const origins = Array.isArray(app.trustedOrigins) ? app.trustedOrigins : [];
    if (origins.length === 0) {
        errors.push('Список доверенных источников пуст, служба не может быть открыта без ограничений'); // изменено под тест
    } else {
        for (const origin of origins) {
            try {
                const url = new URL(origin);
                if (!['http:', 'https:'].includes(url.protocol)) {
                    errors.push(`app.trustedOrigins: "${origin}" – протокол должен быть http или https`);
                }

                // Проверка, что передан именно origin (без пути, кроме '/')
                if (url.pathname !== '/' && url.pathname !== '') {
                    errors.push(`app.trustedOrigins: "${origin}" – должен быть origin без пути (например, http://localhost:5173)`);
                }
            } catch {
                errors.push(`app.trustedOrigins: "${origin}" – некорректный URL`);
            }
        }
    }

    // Лимиты
    const limits = app.rateLimits ?? {};
    const list = limits.list;
    const get = limits.get;
    const create = limits.create;

    if (list !== undefined && (!Number.isInteger(list) || list <= 0)) {
        errors.push('app.rateLimits.list: положительное целое число');
    }
    if (get !== undefined && (!Number.isInteger(get) || get <= 0)) {
        errors.push('app.rateLimits.get: положительное целое число');
    }
    if (create !== undefined && (!Number.isInteger(create) || create <= 0)) {
        errors.push('app.rateLimits.create: положительное целое число');
    }

    // Дополнительная логика: лимит создания не может быть выше лимита чтения списка
    if (list !== undefined && create !== undefined && create > list) {
        errors.push('app.rateLimits: лимит создания (create) не должен превышать лимит списка (list)');
    }

    return errors;
}

// Геттеры
export function getMode(cfg) {
    return String(cfg.app?.mode ?? 'учебный').toLowerCase();
}

export function getPort(cfg) {
    return Number(cfg.app?.port ?? 3000);
}

export function getTrustedOrigins(cfg) {
    return (cfg.app?.trustedOrigins ?? []).map(String);
}

export function getRateLimits(cfg) {
  const defaults = { list: 60, get: 120, create: 20 };
  const fromCfg = cfg.app?.rateLimits ?? {};
  return { ...defaults, ...fromCfg };
}

// Основная функция получения конфигурации
export function resolveConfigFromThreeSources({ configPath, env, argv }) {
  const fileCfg = readFileConfig(configPath);
  const args = parseArgs(argv);
  return buildConfig({ fileCfg, env, args });
}

export function defaultConfigPath() {
  return path.resolve(process.cwd(), 'config', 'appsettings.json');
}