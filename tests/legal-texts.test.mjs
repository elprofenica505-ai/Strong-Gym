import { test } from "node:test";
import assert from "node:assert/strict";
import { PRIVACY, TERMS, COOKIES, LEGAL_VERSION } from "../src/lib/legal/texts.ts";

const docs = { privacidad: PRIVACY, terminos: TERMS, cookies: COOKIES };

test("cada documento legal existe en español e inglés", () => {
  for (const [name, set] of Object.entries(docs)) {
    for (const locale of ["es", "en"]) {
      assert.ok(set[locale], `${name} ${locale}`);
      assert.ok(set[locale].title.length > 3, `${name} ${locale} título`);
    }
  }
});

test("cada documento tiene secciones con texto y numeradas", () => {
  for (const [name, set] of Object.entries(docs)) {
    for (const locale of ["es", "en"]) {
      const sections = set[locale].sections;
      assert.ok(sections.length >= 3, `${name} ${locale} tiene secciones`);
      for (const s of sections) {
        assert.ok(s.paragraphs.length + (s.items?.length ?? 0) > 0, `${name} ${locale} "${s.title}" sin texto`);
        assert.match(s.title, /^\d+\./, `${name} ${locale} "${s.title}" sin número`);
      }
    }
  }
});

test("la política de privacidad cubre menores, salud y derechos", () => {
  const text = JSON.stringify(PRIVACY.es);
  assert.match(text, /18 años/);
  assert.match(text, /consentimiento expreso/);
  assert.match(text, /acceso, corrección, cancelación u oposición/);
});

test("los términos dejan claro que la calculadora no es consejo médico", () => {
  assert.match(JSON.stringify(TERMS.es), /no son consejo médico/);
});

test("los textos pendientes de abogado están marcados entre corchetes", () => {
  assert.match(JSON.stringify(PRIVACY.es), /\[plazo a confirmar/);
  assert.match(JSON.stringify(TERMS.es), /\[Cláusula a revisar/);
});

test("la versión legal tiene formato con fecha y borrador", () => {
  assert.match(LEGAL_VERSION, /^\d{4}-\d{2}-\d{2}-/);
});
