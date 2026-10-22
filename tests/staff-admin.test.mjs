import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPTY_STAFF_VALUES,
  STAFF_ERROR_MESSAGES,
  staffAuditFieldsText,
  staffErrorMessage,
  validateStaffValues,
} from "../src/lib/admin/staff.ts";

const TODAY = "2026-10-21";
const valid = {
  ...EMPTY_STAFF_VALUES,
  fullName: "JUAN EJEMPLO",
  nationalId: "001-010190-1000A",
  birthDate: "1990-01-01",
  phone: "8888-1111",
  address: "Barrio Ejemplo 1",
  emergencyName: "MARIA EJEMPLO",
  emergencyPhone: "8888-2222",
  positionTitle: "Entrenador de fuerza",
  hiredOn: "2026-01-10",
};

test("una ficha completa y válida no tiene errores", () => {
  assert.deepEqual(validateStaffValues(valid, TODAY), {});
});

test("los campos obligatorios vacíos se marcan; las notas son opcionales", () => {
  const errors = validateStaffValues({ ...EMPTY_STAFF_VALUES }, TODAY);
  for (const key of ["fullName", "nationalId", "birthDate", "phone", "address", "emergencyName", "emergencyPhone", "positionTitle", "hiredOn"]) {
    assert.equal(errors[key], "Este dato es obligatorio.", key);
  }
  assert.equal(errors.responsibilities, undefined);
  assert.equal(errors.internalNotes, undefined);
});

test("la cédula debe tener el formato nicaragüense", () => {
  assert.match(validateStaffValues({ ...valid, nationalId: "001010190" }, TODAY).nationalId, /formato/);
  assert.equal(validateStaffValues({ ...valid, nationalId: "001-010190-1000A" }, TODAY).nationalId, undefined);
});

test("el personal debe tener 18 años o más (y el límite exacto cuenta)", () => {
  assert.match(validateStaffValues({ ...valid, birthDate: "2012-05-01" }, TODAY).birthDate, /18 años/);
  assert.equal(validateStaffValues({ ...valid, birthDate: "2008-10-21" }, TODAY).birthDate, undefined);
  assert.match(validateStaffValues({ ...valid, birthDate: "2008-10-22" }, TODAY).birthDate, /18 años/);
});

test("la fecha de ingreso no puede ser futura", () => {
  assert.match(validateStaffValues({ ...valid, hiredOn: "2026-10-22" }, TODAY).hiredOn, /futura/);
  assert.equal(validateStaffValues({ ...valid, hiredOn: "2026-10-21" }, TODAY).hiredOn, undefined);
});

test("los teléfonos tienen entre 8 y 20 caracteres", () => {
  assert.match(validateStaffValues({ ...valid, phone: "123" }, TODAY).phone, /entre 8 y 20/);
  assert.match(validateStaffValues({ ...valid, emergencyPhone: "1".repeat(21) }, TODAY).emergencyPhone, /20 caracteres/);
});

test("cada código de la base tiene mensaje en español y los desconocidos tienen respaldo", () => {
  assert.match(staffErrorMessage("AUTH"), /administrador/);
  assert.match(staffErrorMessage("SELF_STAFF_CHANGE"), /propia ficha/);
  assert.match(staffErrorMessage("REASON_REQUIRED"), /motivo/);
  assert.equal(staffErrorMessage("ALGO_RARO"), "No se pudo guardar. No se modificó ninguna ficha.");
  assert.equal(staffErrorMessage(undefined), "No se pudo guardar. No se modificó ninguna ficha.");
  for (const code of Object.keys(STAFF_ERROR_MESSAGES)) assert.ok(STAFF_ERROR_MESSAGES[code].length > 10, code);
});

test("la bitácora muestra nombres de campos, no valores", () => {
  assert.equal(staffAuditFieldsText(["phone", "nationalId"]), "teléfono, cédula");
  assert.equal(staffAuditFieldsText([]), "sin campos");
  assert.equal(staffAuditFieldsText(["campo_nuevo"]), "campo_nuevo");
});

import { staffPersonState, staffAuditItems, STAFF_STATE_LABEL } from "../src/lib/admin/staff.ts";

test("el estado de la persona: sin ficha, completa o inactiva", () => {
  assert.equal(staffPersonState(false), "pendiente");
  assert.equal(staffPersonState(true, "activo"), "completa");
  assert.equal(staffPersonState(true, "inactivo"), "inactiva");
  assert.equal(STAFF_STATE_LABEL.pendiente, "Falta ficha");
});

test("la bitácora de personal dice qué cambió sin mostrar valores", () => {
  const names = new Map([["p1", "ANA EJEMPLO"], ["a1", "ADMIN EJEMPLO"]]);
  const items = staffAuditItems(
    [
      { id: 1, profileId: "p1", action: "edicion", changedFields: ["phone"], changedBy: "a1", changedAt: "2026-10-22T02:00:00Z" },
      { id: 2, profileId: "p1", action: "baja", changedFields: ["status"], changedBy: null, changedAt: "2026-10-22T03:00:00Z" },
    ],
    names,
    (iso) => `F(${iso})`,
  );
  assert.deepEqual(items[0], { id: 1, person: "ANA EJEMPLO", action: "Edición", detail: "Cambió: teléfono", by: "ADMIN EJEMPLO", at: "F(2026-10-22T02:00:00Z)" });
  assert.equal(items[1].detail, "Acceso bloqueado");
  assert.equal(items[1].by, "Sistema");
  assert.ok(!JSON.stringify(items).includes("8888"));
});
