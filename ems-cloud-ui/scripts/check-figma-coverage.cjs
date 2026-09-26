const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

// Audit business frames at page/section boundaries, not nested UI components.
const root = path.resolve(__dirname, '../..')
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/superpowers/specs/2026-09-26-all-modules-figma-inventory.json'), 'utf8'))
const expected = [3, 102, 21, 14, 41, 7, 68, 6]
function frames(nodes) {
  return nodes.flatMap(node => node.type === 'SECTION' ? frames(node.children || []) : ['FRAME', 'INSTANCE'].includes(node.type) ? [node] : [])
}
const modules = inventory.map((page, index) => {
  const document = `docs/superpowers/verification/2026-09-26-figma-module-${page.module}.md`
  const rows = fs.readFileSync(path.join(root, document), 'utf8').split(/\r?\n/).filter(line => line.startsWith('|')).map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
  const nodes = frames(page.children)
  assert.equal(nodes.length, expected[index], `Module ${page.module} inventory count`)
  const mappings = nodes.map(node => {
    const pattern = new RegExp(`(?<![\\d:])${node.id}(?![\\d:])`)
    const matching = rows.filter(row => pattern.test(row[0]))
    assert.equal(matching.length, 1, `${page.module}/${node.id}: exactly one first-cell mapping required`)
    const cells = matching[0]
    const decisions = cells.slice(1).join(' | ').match(/\b(selected|composed|superseded|connector)\b/g)
    assert.ok(decisions?.length, `${node.id}: explicit decision required`)
    assert.ok(cells.at(-1).length > 8, `${node.id}: concrete route or replacement required`)
    return { node: node.id, name: node.name, decisions: [...new Set(decisions)], mapping: cells.slice(1).join(' | ') }
  })
  return { module: page.module, page: page.id, document, count: nodes.length, mappings }
})
assert.equal(modules.reduce((sum, module) => sum + module.count, 0), 262)
const result = { fileKey: 'Y0KMYFvalDXgSPnVZ5zG39', total: 262, modules }
if (process.argv.includes('--write')) {
  fs.writeFileSync(path.join(root, 'docs/superpowers/verification/2026-09-26-all-modules-coverage.json'), `${JSON.stringify(result, null, 2)}\n`)
}
console.log(JSON.stringify({ total: result.total, modules: modules.map(({module, count}) => ({module, count})), invalid: [] }, null, 2))
