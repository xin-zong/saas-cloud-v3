const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../src/components');
test('station detail styles cannot resize or restyle the shared navigation at any breakpoint',()=>{
 const css=fs.readFileSync(path.join(root,'reference-station/station-shell-parity.css'),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
 const overrides=[];
 for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)){
  const selector=match[1].trim();
  if(/\.reference-(navigation|brand|menu(?:-item)?|company|rail)(?![\w-])/.test(selector))overrides.push(selector);
 }
 assert.deepEqual(overrides,[], 'drilling into a station must leave the shared sidebar geometry and typography unchanged');
});
