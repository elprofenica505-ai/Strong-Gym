import test from 'node:test';
import assert from 'node:assert/strict';
import { inactivityLimitMs, isInactive, ADMIN_CASHIER_INACTIVITY_MS } from '../src/lib/auth/session-policy.ts';

test('administración y caja tienen 15 minutos de inactividad', () => {
  assert.equal(ADMIN_CASHIER_INACTIVITY_MS, 15 * 60 * 1000);
  assert.equal(inactivityLimitMs('admin'), ADMIN_CASHIER_INACTIVITY_MS);
  assert.equal(inactivityLimitMs('cashier'), ADMIN_CASHIER_INACTIVITY_MS);
});

test('entrenador, clientes y visitantes no tienen cierre automático', () => {
  assert.equal(inactivityLimitMs('trainer'), null);
  assert.equal(inactivityLimitMs('member'), null);
  assert.equal(inactivityLimitMs(null), null);
  assert.equal(inactivityLimitMs(undefined), null);
  assert.equal(isInactive(0, 10 ** 12, null), false);
});

test('se considera inactivo al llegar exactamente a los 15 minutos', () => {
  const limit = ADMIN_CASHIER_INACTIVITY_MS;
  assert.equal(isInactive(1000, 1000 + limit - 1, limit), false);
  assert.equal(isInactive(1000, 1000 + limit, limit), true);
});
