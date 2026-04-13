import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCors, createRateLimiter, applySecurityHeaders } from '../src/security.js';

test('applySecurityHeaders устанавливает необходимые заголовки', (t) => {
  const headers = {};
  const res = {
    setHeader: (name, value) => { headers[name] = value; }
  };
  applySecurityHeaders(res);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.equal(headers['Cache-Control'], 'no-store, max-age=0');
  assert.equal(headers['Pragma'], 'no-cache');
});

test('applyCors: доверенный origin получает заголовки', (t) => {
  const headers = {};
  const res = {
    setHeader: (name, value) => { headers[name] = value; }
  };
  const req = { headers: { origin: 'http://localhost:5173' } };
  const trusted = ['http://localhost:5173', 'https://example.edu'];

  applyCors(req, res, trusted);
  assert.equal(headers['Access-Control-Allow-Origin'], 'http://localhost:5173');
  assert.equal(headers['Access-Control-Allow-Methods'], 'GET, POST, OPTIONS');
  assert.equal(headers['Access-Control-Allow-Credentials'], 'true');
});

test('applyCors: недоверенный origin не получает CORS-заголовки', (t) => {
  const headers = {};
  const res = {
    setHeader: (name, value) => { headers[name] = value; }
  };
  const req = { headers: { origin: 'http://evil.com' } };
  const trusted = ['http://localhost:5173'];

  applyCors(req, res, trusted);
  assert.equal(headers['Access-Control-Allow-Origin'], undefined);
});

test('createRateLimiter: разрешает запросы в пределах лимита', (t) => {
  const limiter = createRateLimiter({ list: 2, get: 3, create: 1 });
  const req = (method, url, ip = '127.0.0.1') => ({
    method,
    url,
    socket: { remoteAddress: ip }
  });

  // list
  assert.equal(limiter.allow(req('GET', '/api/items')), true);
  assert.equal(limiter.allow(req('GET', '/api/items')), true);
  assert.equal(limiter.allow(req('GET', '/api/items')), false); // превышен

  // get (другой маршрут, свой лимит)
  assert.equal(limiter.allow(req('GET', '/api/items/by-id/123')), true);
  assert.equal(limiter.allow(req('GET', '/api/items/by-id/456')), true);
  assert.equal(limiter.allow(req('GET', '/api/items/by-id/789')), true);
  assert.equal(limiter.allow(req('GET', '/api/items/by-id/000')), false);

  // create
  assert.equal(limiter.allow(req('POST', '/api/items')), true);
  assert.equal(limiter.allow(req('POST', '/api/items')), false);
});

test('createRateLimiter: разные IP изолированы', (t) => {
  const limiter = createRateLimiter({ list: 1, get: 1, create: 1 });
  const req = (method, url, ip) => ({ method, url, socket: { remoteAddress: ip } });

  assert.equal(limiter.allow(req('GET', '/api/items', '1.1.1.1')), true);
  assert.equal(limiter.allow(req('GET', '/api/items', '1.1.1.1')), false);
  assert.equal(limiter.allow(req('GET', '/api/items', '2.2.2.2')), true); // другой IP
});

test('createRateLimiter: нелимитируемые маршруты всегда разрешены', (t) => {
  const limiter = createRateLimiter({ list: 1, get: 1, create: 1 });
  const req = (method, url) => ({ method, url, socket: { remoteAddress: '127.0.0.1' } });

  // исчерпаем лимит list
  limiter.allow(req('GET', '/api/items'));
  // другие запросы не лимитируются
  assert.equal(limiter.allow(req('GET', '/api/mode')), true);
  assert.equal(limiter.allow(req('POST', '/other')), true);
});

test('createRateLimiter: getRetryAfterSeconds возвращает примерное время ожидания', (t) => {
  const limiter = createRateLimiter({ list: 1, get: 1, create: 1 });
  const req = (method, url) => ({ method, url, socket: { remoteAddress: '127.0.0.1' } });

  limiter.allow(req('GET', '/api/items')); // первый запрос
  limiter.allow(req('GET', '/api/items')); // второй — отклонён
  const retry = limiter.getRetryAfterSeconds(req('GET', '/api/items'));
  assert.ok(retry > 0 && retry <= 60);
});