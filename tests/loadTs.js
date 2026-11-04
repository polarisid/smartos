// Carrega um módulo TypeScript puro (sem imports de runtime do app) para os testes, sem precisar de bundler.
// Imports relativos entre módulos .ts (ex.: "./partUsage") também são carregados.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function loadTs(relativePath) {
    const file = path.join(__dirname, "..", relativePath);
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    const localRequire = spec => {
        if (!spec.startsWith(".")) return require(spec);
        const sibling = path.join(path.dirname(relativePath), spec).split(path.sep).join("/") + ".ts";
        return loadTs(sibling);
    };
    new Function("module", "exports", "require", js)(mod, mod.exports, localRequire);
    return mod.exports;
}

module.exports = { loadTs };
