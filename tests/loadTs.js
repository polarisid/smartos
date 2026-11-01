// Carrega um módulo TypeScript puro (sem imports de runtime do app) para os testes, sem precisar de bundler.
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

function loadTs(relativePath) {
    const file = path.join(__dirname, "..", relativePath);
    const js = ts.transpileModule(fs.readFileSync(file, "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const mod = { exports: {} };
    new Function("module", "exports", js)(mod, mod.exports);
    return mod.exports;
}

module.exports = { loadTs };
