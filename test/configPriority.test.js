import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConfig,
  validateConfig,
  parseArgs,
  getRateLimits
} from '../src/config.js';

test('parseArgs разбирает аргументы вида --key=value', () => {
  const argv = ['--mode=боевой', '--port=5000', '--trustedOrigins=http://a.com,https://b.org'];
  const result = parseArgs(argv);
  assert.deepEqual(result, {
    mode: 'боевой',
    port: '5000',
    trustedOrigins: 'http://a.com,https://b.org'
  });
});

test('buildConfig: приоритет аргументы > переменные окружения > файл', () => {
  const fileCfg = {
    app: {
      mode: 'учебный',
      port: 3000,
      trustedOrigins: ['http://localhost:5173'],
      rateLimits: { list: 60, get: 120, create: 20 }
    }
  };
  const env = {
    APP_MODE: 'боевой',
    APP_PORT: '4000',
    APP_RATE_LIMIT_LIST: '100'
  };
  const args = {
    port: '5000',
    rateLimitCreate: '30'
  };

  const cfg = buildConfig({ fileCfg, env, args });
  assert.equal(cfg.app.mode, 'боевой');               // из env
  assert.equal(cfg.app.port, 5000);                   // из args (приоритет)
  assert.equal(cfg.app.rateLimits.list, 100);         // из env
  assert.equal(cfg.app.rateLimits.create, 30);        // из args
  assert.deepEqual(cfg.app.trustedOrigins, ['http://localhost:5173']); // из файла
});

test('validateConfig: корректная конфигурация не даёт ошибок', () => {
  const cfg = {
    app: {
      mode: 'учебный',
      port: 3000,
      trustedOrigins: ['http://localhost:5173'],
      rateLimits: { list: 60, get: 120, create: 20 }
    }
  };
  const errors = validateConfig(cfg);
  assert.equal(errors.length, 0);
});

test('validateConfig: некорректный режим', () => {
  const cfg = { app: { mode: 'production', port: 3000, trustedOrigins: ['http://localhost'], rateLimits: { list: 10, get: 10, create: 5 } } };
  const errors = validateConfig(cfg);
  assert.ok(errors.some(e => e.includes('режим')));
});

test('validateConfig: порт вне диапазона', () => {
  const cfg = { app: { mode: 'учебный', port: 70000, trustedOrigins: ['http://localhost'], rateLimits: { list: 10, get: 10, create: 5 } } };
  const errors = validateConfig(cfg);
  assert.ok(errors.some(e => e.includes('Порт')));
});

test('validateConfig: пустой список доверенных источников', () => {
  const cfg = { app: { mode: 'учебный', port: 3000, trustedOrigins: [], rateLimits: { list: 10, get: 10, create: 5 } } };
  const errors = validateConfig(cfg);
  assert.ok(errors.some(e => e.includes('доверенных источников пуст')));
});

test('validateConfig: некорректный URL в trustedOrigins', () => {
  const cfg = { app: { mode: 'учебный', port: 3000, trustedOrigins: ['ftp://example.com'], rateLimits: { list: 10, get: 10, create: 5 } } };
  const errors = validateConfig(cfg);
  assert.ok(errors.some(e => e.includes('протокол должен быть http или https')));
});

test('validateConfig: trustedOrigins с путём (должно быть только origin)', () => {
  const cfg = { app: { mode: 'учебный', port: 3000, trustedOrigins: ['http://localhost:5173/app'], rateLimits: { list: 10, get: 10, create: 5 } } };
  const errors = validateConfig(cfg);
  assert.ok(errors.some(e => e.includes('без пути')));
});

test('validateConfig: лимит create > list', () => {
  const cfg = { app: { mode: 'учебный', port: 3000, trustedOrigins: ['http://localhost'], rateLimits: { list: 10, get: 20, create: 15 } } };
  const errors = validateConfig(cfg);
  assert.ok(errors.some(e => e.includes('лимит создания (create) не должен превышать лимит списка (list)')));
});

test('getRateLimits возвращает значения по умолчанию, если не заданы', () => {
  const cfg = { app: { mode: 'учебный', port: 3000, trustedOrigins: ['http://localhost'] } };
  const limits = getRateLimits(cfg);
  assert.deepEqual(limits, { list: 60, get: 120, create: 20 });
});