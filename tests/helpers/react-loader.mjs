import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
const root = fileURLToPath(new URL("../../src/", import.meta.url));
const dataUrl = (code) =>
  `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;

// Compila los componentes reales; sólo sustituye fronteras externas de Next/datos/contexto.
// No requiere claves, navegador ni servidor de producción.
export function createLoader(overrides = {}) {
  const modules = new Map();
  function load(path) {
    if (modules.has(path)) return modules.get(path);
    const compiled = ts
      .transpileModule(readFileSync(path, "utf8"), {
        fileName: path,
        compilerOptions: {
          target: ts.ScriptTarget.ES2022,
          module: ts.ModuleKind.ESNext,
          jsx: ts.JsxEmit.ReactJSX,
        },
      })
      .outputText.replace(/from "([^"]+)"/g, (_, name) => {
        if (name in overrides)
          return `from ${JSON.stringify(dataUrl(overrides[name]))}`;
        if (name.startsWith("@/") || name.startsWith(".")) {
          const base = name.startsWith("@/")
            ? resolve(root, name.slice(2))
            : resolve(dirname(path), name);
          const file = [base + ".ts", base + ".tsx", base + "/index.ts"].find(
            existsSync,
          );
          if (!file) throw new Error(`No se pudo resolver ${name}`);
          return `from ${JSON.stringify(load(file))}`;
        }
        return `from ${JSON.stringify(import.meta.resolve(name.startsWith("next/") ? name + ".js" : name))}`;
      });
    const url = dataUrl(compiled);
    modules.set(path, url);
    return url;
  }
  return async (path) => import(load(resolve(root, path)));
}
