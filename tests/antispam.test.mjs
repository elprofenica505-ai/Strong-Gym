import test from 'node:test';
import assert from 'node:assert/strict';
import { allowRequest, clientIp, isHoneypotFilled } from '../src/lib/antispam.ts';

test('permite hasta el límite y luego bloquea dentro de la ventana', () => {
  const rule = { limit: 3, windowMs: 1000 };
  const ip = 'test-ip-1';
  assert.equal(allowRequest('t1', ip, rule, 0), true);
  assert.equal(allowRequest('t1', ip, rule, 10), true);
  assert.equal(allowRequest('t1', ip, rule, 20), true);
  assert.equal(allowRequest('t1', ip, rule, 30), false);
});

test('la ventana se reinicia cuando vence', () => {
  const rule = { limit: 1, windowMs: 1000 };
  assert.equal(allowRequest('t2', 'ip', rule, 0), true);
  assert.equal(allowRequest('t2', 'ip', rule, 500), false);
  assert.equal(allowRequest('t2', 'ip', rule, 1001), true);
});

test('los contadores son independientes por IP y por formulario', () => {
  const rule = { limit: 1, windowMs: 1000 };
  assert.equal(allowRequest('t3', 'a', rule, 0), true);
  assert.equal(allowRequest('t3', 'b', rule, 0), true);
  assert.equal(allowRequest('t4', 'a', rule, 0), true);
});

test('campo trampa: sólo cuenta texto no vacío', () => {
  assert.equal(isHoneypotFilled('algo'), true);
  assert.equal(isHoneypotFilled('  '), false);
  assert.equal(isHoneypotFilled(''), false);
  assert.equal(isHoneypotFilled(undefined), false);
  assert.equal(isHoneypotFilled(null), false);
});

test('clientIp toma la primera IP de x-forwarded-for', () => {
  const req = new Request('https://x.test', { headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' } });
  assert.equal(clientIp(req), '1.2.3.4');
  assert.equal(clientIp(new Request('https://x.test')), 'unknown');
});
