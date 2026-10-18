import test from 'node:test';
import assert from 'node:assert/strict';
import { inactivityLimitMs, isInactive, STAFF_INACTIVITY_MS } from '../src/lib/auth/session-policy.ts';

test('administrador y personal tienen 2 horas de inactividad', () => {
  assert.equal(inactivityLimitMs('admin'), 2 * 60 * 60 * 1000);
  assert.equal(inactivityLimitMs('staff'), STAFF_INACTIVITY_MS);
});

test('clientes y visitantes no tienen cierre automático', () => {
  assert.equal(inactivityLimitMs('member'), null);
  assert.equal(inactivityLimitMs(null), null);
  assert.equal(inactivityLimitMs(undefined), null);
  assert.equal(isInactive(0, 10 ** 12, null), false);
});

test('se considera inactivo al llegar exactamente al límite', () => {
  const limit = STAFF_INACTIVITY_MS;
  assert.equal(isInactive(1000, 1000 + limit - 1, limit), false);
  assert.equal(isInactive(1000, 1000 + limit, limit), true);
});
