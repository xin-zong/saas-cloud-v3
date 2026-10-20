const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript")
const cache = {}
function load(name) {
  if (name.endsWith(".json"))
    return {
      default: JSON.parse(
        fs.readFileSync(
          path.resolve(__dirname, "../src/components/station-provision", name),
          "utf8",
        ),
      ),
    }
  const f = path.resolve(
    __dirname,
    "../src/components/station-provision",
    name + ".ts",
  )
  if (cache[f]) return cache[f].exports
  const m = { exports: {} }
  cache[f] = m
  new Function(
    "require",
    "module",
    "exports",
    ts.transpileModule(fs.readFileSync(f, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
  )(
    (n) => (n.startsWith(".") ? load(path.basename(n)) : require(n)),
    m,
    m.exports,
  )
  return m.exports
}
const { createDevice, emptyProvision, templates } = load("model"),
  { arrangeNodes, buildSiteTemplate, nodePosition, cloneNode } =
    load("topologyModel")
const arrange = (d) => ({ ...d, ...arrangeNodes(d) })
const rect = (d, n) => {
  const p = nodePosition(d, n, d.devices.indexOf(n)),
    w =
      n.width ??
      (n.type === "标准柜"
        ? 340
        : n.type.includes("母线")
          ? n.cabinetId
            ? 300
            : 720
          : n.type === "ATS"
            ? 342
            : 138),
    h =
      n.height ?? (n.type === "标准柜" ? 270 : n.type.includes("母线") ? 4 : 58)
  return {
    left: p.x * 10 - w / 2,
    right: p.x * 10 + w / 2,
    top: p.y * 7.4 - (n.type === "标准柜" ? 65 : h / 2),
    bottom: p.y * 7.4 - (n.type === "标准柜" ? 65 : h / 2) + h,
  }
}
function checkGeometry(d) {
  for (const n of d.devices) {
    const r = rect(d, n)
    assert.ok(Object.values(r).every(Number.isFinite))
    assert.ok(
      r.left >= 0 && r.top >= 0,
      n.type + " inside positive canvas bounds",
    )
    if (n.cabinetId) {
      const cr = rect(
        d,
        d.devices.find((c) => c.id === n.cabinetId),
      )
      assert.ok(
        r.left >= cr.left + 10 &&
          r.right <= cr.right - 10 &&
          r.top >= cr.top + 30 &&
          r.bottom <= cr.bottom - 10,
        n.type + " contained by cabinet",
      )
    }
  }
  for (let i = 0; i < d.devices.length; i++)
    for (let j = i + 1; j < d.devices.length; j++) {
      const a = d.devices[i],
        b = d.devices[j]
      if (a.cabinetId === b.id || b.cabinetId === a.id) continue
      const ar = rect(d, a),
        br = rect(d, b)
      assert.ok(
        ar.right <= br.left ||
          ar.left >= br.right ||
          ar.bottom <= br.top ||
          ar.top >= br.bottom,
        `${a.type} must not overlap ${b.type}`,
      )
    }
}
for (const template of templates)
  test(
    "auto arrange creates electrical layers and contained cabinet: " + template,
    () => {
      const d = { ...emptyProvision(), ...buildSiteTemplate(template) }
      for (const n of d.devices) {
        n.x = 5
        n.y = 5
      }
      const before = structuredClone(d),
        a = arrange(d)
      checkGeometry(a)
      const grid = a.devices.find((n) => n.type === "电网"),
        bus = a.devices.find((n) => n.type === "交流母线"),
        cab = a.devices.find((n) => n.type === "标准柜")
      if (grid) assert.ok(grid.y < bus.y && bus.y < cab.y)
      assert.deepEqual(arrange(a), a, "idempotent")
      assert.deepEqual(d, before, "immutable")
      assert.deepEqual(a.connections, d.connections)
    },
  )
test("arrange repairs explicit reference member offsets and preserves exported XML", () => {
  const { createIndustrialReference } = load("topologyReference"),
    { exportTopologyByEms } = load("topologyExport"),
    d = createIndustrialReference(),
    before = exportTopologyByEms(d).files.map((f) => f.xml)
  d.devices.find((n) => n.type === "PCS").x = 95
  d.devices.find((n) => n.type === "PCS").y = 3
  const a = arrange(d)
  checkGeometry(a)
  assert.deepEqual(
    exportTopologyByEms(a).files.map((f) => f.xml),
    before,
  )
})
test("several cabinets, free devices, disconnected cycles remain finite and do not overlap", () => {
  let d = { ...emptyProvision(), ...buildSiteTemplate("光储协同") }
  const cab = d.devices.find((n) => n.type === "标准柜")
  for (let i = 0; i < 3; i++) d = { ...d, ...cloneNode(d, cab.id) }
  const a = createDevice("PCS", 20),
    b = createDevice("PCS", 21),
    grid = createDevice("电网", 2),
    ats = createDevice("ATS", 1),
    gen = createDevice("柴油发电机", 1),
    bus = d.devices.find((n) => n.type === "交流母线")
  d.devices.push(a, b, grid, ats, gen)
  d.connections.push(
    { id: "cycle-a", from: a.id, to: b.id, kind: "DC" },
    { id: "cycle-b", from: b.id, to: a.id, kind: "AC" },
    {
      id: "ats-a",
      from: grid.id,
      to: ats.id,
      fromPort: "ac",
      toPort: "sourceA",
      kind: "AC",
    },
    {
      id: "ats-b",
      from: gen.id,
      to: ats.id,
      fromPort: "ac",
      toPort: "sourceB",
      kind: "AC",
    },
    {
      id: "ats-common",
      from: ats.id,
      to: bus.id,
      fromPort: "common",
      toPort: "bus",
      kind: "AC",
    },
  )
  const result = arrange(d)
  checkGeometry(result)
  assert.deepEqual(arrange(result), result)
  const g = result.devices.find((n) => n.id === grid.id),
    at = result.devices.find((n) => n.id === ats.id)
  assert.equal(
    g.x * 10,
    at.x * 10 - (at.width ?? 342) / 4,
    "source aligned to ATS input",
  )
})

test("electrical wires meet exact terminals and bus taps without crossing cards", () => {
  const { electricalWirePoints } = load("topologyCanvasModel")
  assert.equal(
    typeof electricalWirePoints,
    "function",
    "electrical orthogonal router is available",
  )
  const d = arrange({ ...emptyProvision(), ...buildSiteTemplate("光储充") })
  const pcs = d.devices.find((n) => n.type === "PCS"),
    bus = d.devices.find((n) => n.type === "交流母线")
  const points = electricalWirePoints(d, {
    from: { node: bus.id, port: "bus" },
    to: { node: pcs.id, port: "ac" },
    kind: "AC",
    id: "test",
  })
  assert.equal(points[0].x, pcs.x * 10)
  assert.equal(points.at(-1).x, pcs.x * 10)
  assert.equal(points.at(-1).y, pcs.y * 7.4 - (pcs.height ?? 58) / 2)
  const a = createDevice("电网", 1),
    b = createDevice("负载", 1),
    blocker = createDevice("PCS", 99)
  Object.assign(a, { x: 50, y: 10 })
  Object.assign(b, { x: 50, y: 70 })
  Object.assign(blocker, { x: 50, y: 40 })
  const obstacleDraft = { ...emptyProvision(), devices: [a, b, blocker] },
    r = electricalWirePoints(obstacleDraft, {
      from: { node: a.id, port: "ac" },
      to: { node: b.id, port: "ac" },
      kind: "AC",
      id: "detour",
    }),
    box = rect(obstacleDraft, blocker)
  assert.ok(r.length > 2, "same-column blocked wire takes a detour")
  for (let i = 1; i < r.length; i++) {
    const p = r[i - 1],
      q = r[i]
    assert.ok(p.x === q.x || p.y === q.y, "all wire segments orthogonal")
    assert.ok(
      !(p.x === q.x
        ? p.x > box.left &&
          p.x < box.right &&
          Math.max(p.y, q.y) > box.top &&
          Math.min(p.y, q.y) < box.bottom
        : p.y > box.top &&
          p.y < box.bottom &&
          Math.max(p.x, q.x) > box.left &&
          Math.min(p.x, q.x) < box.right),
      "route avoids card interior",
    )
  }
})
test("free DC bus and battery rows clear cabinet groups", () => {
  const d = { ...emptyProvision(), ...buildSiteTemplate("工商业储能") }
  d.devices.push(
    createDevice("直流母线", 9),
    createDevice("电池 / BMS", 9),
    createDevice("DC充电桩", 9),
  )
  checkGeometry(arrange(d))
})

test("custom independent symbol sizes and wide free branches preserve clear layout", () => {
  const d = { ...emptyProvision(), ...buildSiteTemplate("工商业储能") }
  d.devices.find((n) => n.type === "电网").height = 180
  d.devices.find((n) => n.type === "电网").width = 300
  for (let i = 0; i < 8; i++) d.devices.push(createDevice("电池 / BMS", 30 + i))
  const dc = createDevice("直流母线", 8)
  dc.width = 1400
  d.devices.push(dc)
  const a = arrange(d)
  checkGeometry(a)
  assert.equal(a.devices.find((n) => n.type === "电网").height, 180)
  assert.equal(a.devices.find((n) => n.id === dc.id).width, 1400)
})

test("every template and reference wire avoids all visible card interiors", () => {
  const { electricalWirePoints } = load("topologyCanvasModel")
  for (const d of [
    ...templates.map((t) =>
      arrange({ ...emptyProvision(), ...buildSiteTemplate(t) }),
    ),
    arrange(load("topologyReference").createIndustrialReference()),
  ])
    for (const e of d.connections) {
      const points = electricalWirePoints(d, {
        id: e.id,
        from: { node: e.from, port: e.fromPort ?? e.kind },
        to: { node: e.to, port: e.toPort ?? e.kind },
        kind: e.kind,
      })
      assert.ok(points.length >= 2)
      for (const n of d.devices.filter(
        (n) =>
          !n.type.includes("母线") && n.type !== "标准柜" && n.type !== "EMS",
      )) {
        const b = rect(d, n)
        for (let i = 1; i < points.length; i++) {
          const p = points[i - 1],
            q = points[i]
          assert.ok(
            !(p.x === q.x
              ? p.x > b.left + 0.001 &&
                p.x < b.right - 0.001 &&
                Math.max(p.y, q.y) > b.top + 0.001 &&
                Math.min(p.y, q.y) < b.bottom - 0.001
              : p.y > b.top + 0.001 &&
                p.y < b.bottom - 0.001 &&
                Math.max(p.x, q.x) > b.left + 0.001 &&
                Math.min(p.x, q.x) < b.right - 0.001),
            `${d.template}: ${e.id} crosses ${n.type}`,
          )
        }
      }
    }
})
test("wide ATS sources keep their custom sizes and do not overlap", () => {
  const grid = createDevice("电网", 1),
    gen = createDevice("柴油发电机", 1),
    ats = createDevice("ATS", 1),
    bus = createDevice("交流母线", 1)
  grid.width = gen.width = 300
  const d = {
    ...emptyProvision(),
    devices: [grid, gen, ats, bus],
    connections: [
      {
        id: "a",
        from: grid.id,
        to: ats.id,
        fromPort: "ac",
        toPort: "sourceA",
        kind: "AC",
      },
      {
        id: "b",
        from: gen.id,
        to: ats.id,
        fromPort: "ac",
        toPort: "sourceB",
        kind: "AC",
      },
      {
        id: "c",
        from: ats.id,
        to: bus.id,
        fromPort: "common",
        toPort: "bus",
        kind: "AC",
      },
    ],
  }
  const a = arrange(d)
  checkGeometry(a)
  assert.equal(a.devices[0].width, 300)
  assert.equal(a.devices[1].width, 300)
  assert.deepEqual(arrange(a), a)
})
test("wire escapes through a narrow saved gap instead of penetrating the next card", () => {
  const { electricalWirePoints } = load("topologyCanvasModel"),
    grid = createDevice("电网", 1),
    blocker = createDevice("PCS", 1),
    loadNode = createDevice("负载", 1)
  Object.assign(grid, { x: 50, y: 10 })
  Object.assign(blocker, { x: 50, y: 139 / 7.4 })
  Object.assign(loadNode, { x: 80, y: 70 })
  const d = { ...emptyProvision(), devices: [grid, blocker, loadNode] },
    p = electricalWirePoints(d, {
      id: "narrow",
      from: { node: grid.id, port: "ac" },
      to: { node: loadNode.id, port: "ac" },
      kind: "AC",
    })
  assert.ok(p.length >= 2)
  assert.deepEqual(p[0], { x: 500, y: 103 })
  assert.ok(
    p[1].y > 103 && p[1].y < 110,
    "source escape stays in its seven pixel gap",
  )
  for (const n of d.devices) {
    const b = rect(d, n)
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1],
        q = p[i]
      assert.ok(a.x === q.x || a.y === q.y)
      assert.ok(
        !(a.x === q.x
          ? a.x > b.left + 0.001 &&
            a.x < b.right - 0.001 &&
            Math.max(a.y, q.y) > b.top + 0.001 &&
            Math.min(a.y, q.y) < b.bottom - 0.001
          : a.y > b.top + 0.001 &&
            a.y < b.bottom - 0.001 &&
            Math.max(a.x, q.x) > b.left + 0.001 &&
            Math.min(a.x, q.x) < b.right - 0.001),
        "wire avoids " + n.type,
      )
    }
  }
})
