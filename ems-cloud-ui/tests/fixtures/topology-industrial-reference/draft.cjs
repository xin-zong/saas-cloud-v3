// Test-only adapter: restore the supplied reference through the existing draft boundary.
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript');
const cache = {};
function load(name) {
 const file = path.resolve(__dirname, '../../../src/components/station-provision', name + '.ts');
 if (cache[file]) return cache[file].exports;
 const mod = { exports: {} }; cache[file] = mod;
 const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
 new Function('require', 'module', 'exports', source)(name => name.startsWith('.') ? (name.endsWith('.json') ? JSON.parse(fs.readFileSync(path.resolve(path.dirname(file), name), 'utf8')) : load(path.basename(name))) : require(name), mod, mod.exports);
 return mod.exports;
}
exports.seedReferenceDraft = async page => {
 const draft = load('topologyReference').createIndustrialReference();
 const key = load('model').provisionDraftKey('7', false);
 await page.addInitScript(({ key, draft }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(draft)); }, { key, draft });
};
