const { test } = require("node:test")
const assert = require("node:assert/strict")
const ts = require("typescript"),
  fs = require("node:fs")
const output = ts.transpileModule(
  fs.readFileSync("src/tenant/permissionTree.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText
const mod = { exports: {} }
new Function("module", "exports", output)(mod, mod.exports)
const { descendantPermissions, selectionState, menuRoutes } = mod.exports
test("parent selection is client-specific and ignores unavailable nodes", () => {
  const rows = [
    { id: 1, parent_id: null, client: "web" },
    {
      id: 2,
      parent_id: 1,
      client: "web",
      permission_code: "asset.read",
      configurable: true,
    },
    {
      id: 3,
      parent_id: 1,
      client: "web",
      permission_code: "asset.edit",
      configurable: false,
    },
    { id: 4, parent_id: null, client: "app", permission_code: "asset.read" },
  ]
  assert.deepEqual(descendantPermissions(rows, 1, "web"), [
    { code: "asset.read", client: "web" },
  ])
  assert.equal(
    selectionState(
      [{ code: "asset.read", client: "app" }],
      descendantPermissions(rows, 1, "web"),
    ),
    "none",
  )
  assert.equal(
    selectionState(
      [{ code: "asset.read", client: "web" }],
      descendantPermissions(rows, 1, "web"),
    ),
    "all",
  )
})
test("route visibility derives from server menus and never from role names", () =>
  assert.deepEqual(
    menuRoutes([{ path: null, children: [{ path: "assets", children: [] }] }]),
    ["assets"],
  ))
