import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const projectRoot = process.cwd();
const localRequire = createRequire(import.meta.url);

export function loadTypeScriptModule(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const loaded = { exports: {} };
  const execute = new Function("exports", "module", "require", output);
  execute(loaded.exports, loaded, localRequire);
  return loaded.exports;
}
