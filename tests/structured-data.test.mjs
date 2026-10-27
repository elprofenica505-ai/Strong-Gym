import test from "node:test";
import assert from "node:assert/strict";
import { createLoader } from "./helpers/react-loader.mjs";

const { serializeJsonLd } = await createLoader({
  "@/config/site":
    "export const SCHEMA_DAYS=[];export const fullAddress=()=>'';export const getSiteUrl=()=>'';export const mapsLink=()=>'';export const siteConfig={};",
})("lib/structured-data.ts");

test("JSON-LD: un texto no puede cerrar la etiqueta script ni alterar el JSON", () => {
  const value = {
    name: `Boxeo </script><script>alert(1)</script> & pesas > máquinas${String.fromCharCode(0x2028)}${String.fromCharCode(0x2029)}`,
  };
  const serialized = serializeJsonLd(value);

  assert.doesNotMatch(serialized, /[<>&]/);
  assert.doesNotMatch(serialized, new RegExp(String.fromCharCode(0x2028, 0x2029)));
  assert.match(serialized, /\\u003c\/script\\u003e/);
  assert.deepEqual(JSON.parse(serialized), value);
  assert.equal(serializeJsonLd(undefined), "null");
});
