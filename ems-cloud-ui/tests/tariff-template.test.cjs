const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
function model() {
  const source = fs.readFileSync(`${__dirname}/../src/components/tariff/model.ts`, 'utf8')
  const exports = {}
  new Function('exports', ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(exports)
  return exports
}
test('tariff periods require contiguous full day coverage but support negative electricity prices', () => {
  const { validatePeriods } = model()
  assert.equal(validatePeriods([{ start:'00:00',end:'24:00',band:'flat',price:'-0.10' }]), '')
  assert.match(validatePeriods([{start:'00:00',end:'08:00',band:'valley',price:'0.3'},{start:'09:00',end:'24:00',band:'peak',price:'1'}]), /衔接/)
  assert.match(validatePeriods([{start:'00:00',end:'25:00',band:'flat',price:'1'}]), /时间/)
  assert.match(validatePeriods([{start:'00:00',end:'24:00',band:'flat',price:''}]), /电价/)
})
test('calendar uses Monday origin and leap-year date coverage', () => {
  const { calendarDays } = model()
  const days = calendarDays(2028,1)
  assert.equal(days.length % 7,0)
  assert.equal(days[0].date,'2028-01-31')
  assert.equal(days.filter(d=>d.current).length,29)
})
test('a purchase template can preserve unknown selling prices without inventing zero',()=>{
  const {newTemplate,validateTemplate}=model()
  const template=newTemplate()
  template.name='购电配置'
  template.buy[0].price='0.6'
  assert.equal(validateTemplate(template),'')
  assert.equal(template.sell[0].price,'')
})
