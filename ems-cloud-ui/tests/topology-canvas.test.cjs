const test = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  ts = require("typescript")
const cache = {}
function load(file) {
  file = path.resolve(
    __dirname,
    "../src/components/station-provision",
    file + ".ts",
  )
  if (cache[file]) return cache[file]
  const m = { exports: {} }
  cache[file] = m.exports
  new Function(
    "require",
    "exports",
    "module",
    ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText,
  )(
    (name) =>
      name.endsWith(".json") ? {default:JSON.parse(fs.readFileSync(path.resolve(path.dirname(file),name),"utf8"))} : name.startsWith(".")
        ? load(
            path.relative(
              path.resolve(__dirname, "../src/components/station-provision"),
              path.resolve(path.dirname(file), name),
            ),
          )
        : require(name),
    m.exports,
    m,
  )
  return m.exports
}
const { emptyProvision, createDevice } = load("model")
const {
  screenToWorld,
  zoomAt,
  connectPorts,
  electricalPorts,
  communicationEdges,
  moveCanvasNode,
} = load("topologyCanvasModel")
test("cursor anchored zoom preserves the point under the pointer after a pan", () => {
  const view = { x: 75, y: -20, scale: 0.7 },
    point = { x: 350, y: 220 },
    before = screenToWorld(point, view),
    after = screenToWorld(point, zoomAt(view, 1.4, point))
  assert.deepEqual(after, before)
})
test("dragging a cabinet moves explicit members and preserves implicit layout", () => {
  const cab = createDevice("标准柜", 1),
    pcs = createDevice("PCS", 1),
    bat = createDevice("电池 / BMS", 1)
  cab.x = 40
  cab.y = 50
  pcs.cabinetId = cab.id
  pcs.x = 40
  pcs.y = 46
  bat.cabinetId = cab.id
  const d = { ...emptyProvision(), devices: [cab, pcs, bat] }
  const moved = moveCanvasNode(d, cab.id, { x: 55, y: 60 }, "electrical")
  assert.equal(moved.devices[1].x, 55)
  assert.equal(moved.devices[1].y, 56)
  assert.equal(moved.devices[2].x, undefined)
})
test("electrical port wiring rejects mixed AC/DC and duplicate links", () => {
  const pcs = createDevice("PCS", 1),
    bat = createDevice("电池 / BMS", 1),
    d = { ...emptyProvision(), devices: [pcs, bat] }
  assert.equal(
    electricalPorts(bat).some((p) => p.id === "AC"),
    false,
  )
  assert.ok(
    connectPorts(
      d,
      { node: pcs.id, port: "AC" },
      { node: bat.id, port: "DC" },
      "electrical",
    ).error,
  )
  const result = connectPorts(
    d,
    { node: pcs.id, port: "DC" },
    { node: bat.id, port: "DC" },
    "electrical",
  )
  assert.equal(result.patch.connections[0].kind, "DC")
  assert.ok(
    connectPorts(
      { ...d, ...result.patch },
      { node: pcs.id, port: "DC" },
      { node: bat.id, port: "DC" },
      "electrical",
    ).error,
  )
})
test("shared EMS port connects several devices and leaves IP untouched", () => {
  const ems = createDevice("EMS", 1),
    a = createDevice("PCS", 1),
    b = createDevice("电表", 1)
  ems.ports = [{ id: "ETH1", kind: "ETH", protocol: "Modbus TCP", targets: [] }]
  a.ip = "10.0.0.4"
  let d = { ...emptyProvision(), devices: [ems, a, b] }
  for (const n of [a, b]) {
    const r = connectPorts(
      d,
      { node: ems.id, port: "ETH1" },
      { node: n.id, port: "IN" },
      "communication",
    )
    assert.ok(!r.error)
    d = { ...d, ...r.patch }
  }
  assert.equal(communicationEdges(d).length, 2)
  assert.equal(d.devices[1].ip, "10.0.0.4")
  assert.equal(d.devices[2].interface, "ETH1")
})

test("forwarded communication rejects cycles and persists nested TMS positions in owner only", () => {
  const { communicationDraft, persistCanvasPatch } = load("topologyCanvasModel")
  const a = createDevice("电池 / BMS", 1),
    b = createDevice("PCS", 1)
  a.cooling = true
  a.coolingConfiguration = { name: "液冷 TMS", protocol: "Modbus TCP" }
  a.access = "设备转发"
  a.forwardDeviceId = b.id
  const d = { ...emptyProvision(), devices: [a, b] }
  assert.ok(
    connectPorts(
      d,
      { node: a.id, port: "FORWARD" },
      { node: b.id, port: "IN" },
      "communication",
    ).error,
  )
  const expanded = communicationDraft(d)
  const virtual = expanded.devices.find((n) => n.id === a.id + ":tms")
  assert.ok(virtual)
  const moved = moveCanvasNode(
    expanded,
    virtual.id,
    { x: 72, y: 66 },
    "communication",
  )
  const saved = persistCanvasPatch(d, moved)
  assert.equal(saved.devices.length, 2)
  assert.equal(saved.devices[0].coolingConfiguration.commX, 72)
  assert.equal(saved.devices[0].coolingConfiguration.commY, 66)
  assert.equal(saved.devices[0].coolingConfiguration.name, "液冷 TMS")
})
test("communication default layout remains distinct when EMS is last in an old draft", () => {
  const { canvasPosition } = load("topologyCanvasModel")
  const a = createDevice("PCS", 1),
    b = createDevice("电池 / BMS", 1),
    ems = createDevice("EMS", 1),
    d = { ...emptyProvision(), devices: [a, b, ems] }
  assert.notDeepEqual(
    canvasPosition(d, a, "communication"),
    canvasPosition(d, b, "communication"),
  )
})

test("communication arrange updates independent coordinates without overlap or touching electrical positions", () => {
  const { arrangeCommunication } = load("topologyCanvasModel")
  const a = createDevice("PCS", 1),
    b = createDevice("电池 / BMS", 1),
    d = {
      ...emptyProvision(),
      devices: [
        { ...a, x: 41, y: 62, commX: 70, commY: 50 },
        { ...b, commX: 70, commY: 50 },
      ],
    }
  const result = arrangeCommunication(d)
  assert.notEqual(result.devices[0].commX, result.devices[1].commX)
  assert.equal(result.devices[0].x, 41)
  assert.equal(result.devices[0].y, 62)
})

test("unconfigured EMS assignment does not fabricate a communication link", () => {
  const ems = createDevice("EMS", 1),
    d = createDevice("电表", 1)
  ems.ports = [{ id: "ETH1", kind: "ETH", protocol: "Modbus TCP", targets: [] }]
  d.emsId = ems.id
  d.interface = ""
  assert.equal(
    communicationEdges({ ...emptyProvision(), devices: [ems, d] }).length,
    0,
  )
})

test("owner nested edits win over unchanged projected TMS values", () => {
  const { communicationDraft, persistCanvasPatch } = load("topologyCanvasModel")
  const owner = createDevice("电池 / BMS", 1)
  owner.cooling = true
  owner.coolingConfiguration = { name: "旧液冷", ip: "10.0.0.1" }
  const draft = { ...emptyProvision(), devices: [owner] },
    expanded = communicationDraft(draft)
  const patch = {
    devices: expanded.devices.map((n) =>
      n.id === owner.id
        ? {
            ...n,
            coolingConfiguration: {
              ...n.coolingConfiguration,
              name: "新液冷",
              ip: "10.0.0.9",
            },
          }
        : n,
    ),
  }
  const result = persistCanvasPatch(draft, patch)
  assert.equal(result.devices[0].coolingConfiguration.name, "新液冷")
  assert.equal(result.devices[0].coolingConfiguration.ip, "10.0.0.9")
})
test("DC charging station exposes a connectable DC port", () => {
  const charger = createDevice("DC充电桩", 1),
    bus = createDevice("直流母线", 1),
    d = { ...emptyProvision(), devices: [bus, charger] }
  assert.deepEqual(
    electricalPorts(charger).map((p) => p.id),
    ["dc"],
  )
  assert.ok(
    connectPorts(
      d,
      { node: bus.id, port: "DC" },
      { node: charger.id, port: "DC" },
      "electrical",
    ).patch,
  )
})
test("DI interface preserves DI protocol when wiring", () => {
  const ems = createDevice("EMS", 1),
    device = createDevice("电表", 1)
  ems.ports = [
    { id: "DI1", interface: "DI1", kind: "DI", protocol: "DI", targets: [] },
  ]
  const result = connectPorts(
    { ...emptyProvision(), devices: [ems, device] },
    { node: ems.id, port: "DI1" },
    { node: device.id, port: "IN" },
    "communication",
  )
  assert.equal(
    result.patch.devices.find((n) => n.id === device.id).protocol,
    "DI",
  )
})

test('ATS saves explicit source/common endpoint identities and requires port selection',()=>{const ats=createDevice('ATS',1),grid=createDevice('电网',1),bus=createDevice('交流母线',1),d={...emptyProvision(),devices:[ats,grid,bus]};assert.deepEqual(electricalPorts(ats).map(p=>p.id),['sourceA','sourceB','common']);assert.ok(connectPorts(d,{node:grid.id,port:'ac'},{node:ats.id,port:'AC'},'electrical').error);const result=connectPorts(d,{node:grid.id,port:'ac'},{node:ats.id,port:'sourceA'},'electrical');assert.equal(result.patch.connections[0].fromPort,'ac');assert.equal(result.patch.connections[0].toPort,'sourceA')});
test('RS485 allows only one direct device per EMS interface and DI always collects',()=>{const ems=createDevice('EMS',1),a=createDevice('电表',1),b=createDevice('PCS',1);ems.ports=[{id:'RS485_1',interface:'RS485_1',kind:'RS485',protocol:'Modbus RTU',targets:[]},{id:'DI1',interface:'DI1',kind:'DI',protocol:'DI',targets:[]}];let d={...emptyProvision(),devices:[ems,a,b]};const r=connectPorts(d,{node:ems.id,port:'RS485_1'},{node:a.id,port:'IN'},'communication');d={...d,...r.patch};assert.ok(connectPorts(d,{node:ems.id,port:'RS485_1'},{node:b.id,port:'IN'},'communication').error);b.controlPermission='control';const di=connectPorts(d,{node:ems.id,port:'DI1'},{node:b.id,port:'IN'},'communication');assert.equal(di.patch.devices.find(n=>n.id===b.id).controlPermission,'collect')});

test('nested virtual inspector preserves XML identity and model contract fields',()=>{const {communicationDraft,persistCanvasPatch}=load('topologyCanvasModel');const owner=createDevice('电池 / BMS',1);owner.cooling=true;owner.coolingConfiguration={nodeId:'TMS_STABLE',name:'液冷',modelCode:'OLD',measurement:{measuredObjectRef:'wire-1',positiveDirection:'Endpoint1To2'}};const d={...emptyProvision(),devices:[owner]},expanded=communicationDraft(d);const result=persistCanvasPatch(d,{devices:expanded.devices.map(n=>n.id===owner.id+':tms'?{...n,modelCode:'NEW',modelId:'catalog-model-2',manufacturer:'Test Manufacturer',enabledState:'true',digitalInput:{activeLevel:'High',signalMeaning:'Cooling ready'}}:n)});assert.equal(result.devices[0].coolingConfiguration.nodeId,'TMS_STABLE');assert.equal(result.devices[0].coolingConfiguration.modelCode,'NEW');assert.equal(result.devices[0].coolingConfiguration.modelId,'catalog-model-2');assert.equal(result.devices[0].coolingConfiguration.measurement.measuredObjectRef,'wire-1');assert.equal(result.devices[0].coolingConfiguration.digitalInput.activeLevel,'High')});
test('single device electrical ports cannot fan out and reserved interfaces cannot create fake direct links',()=>{const grid=createDevice('电网',1),a=createDevice('PCS',1),b=createDevice('PCS',2),ems=createDevice('EMS',1);ems.ports=[{id:'CAN1',interface:'CAN1',kind:'CAN',protocol:'CAN',targets:[]}];let d={...emptyProvision(),devices:[grid,a,b,ems]};const r=connectPorts(d,{node:grid.id,port:'ac'},{node:a.id,port:'ac'},'electrical');d={...d,...r.patch};assert.ok(connectPorts(d,{node:grid.id,port:'ac'},{node:b.id,port:'ac'},'electrical').error);assert.ok(connectPorts(d,{node:ems.id,port:'CAN1'},{node:b.id,port:'IN'},'communication').error)});

test('copying the reference cabinet renews all identities and rewires internal references deeply',()=>{const {createIndustrialReference}=load('topologyReference'),{cloneNode}=load('topologyModel'),{topologyNodes,xmlNodeId}=load('topologyContract');const d=createIndustrialReference(),cab=d.devices.find(n=>n.type==='标准柜'),pcs=d.devices.find(n=>n.type==='PCS'),emu=d.devices.find(n=>n.type==='电池 / BMS'),pv=d.devices.find(n=>n.type==='光伏 DC/DC'),internal=d.connections.find(e=>(e.from===emu.id||e.to===emu.id));pcs.nodeId='PCS_XML_EXPLICIT';pcs.metering={nodeId:'LOCAL_METER',name:'柜内计量',access:'设备转发',forwardDeviceId:emu.id,measurement:{measuredObjectRef:internal.id,positiveDirection:'Endpoint1To2'},digitalInput:{activeLevel:'High',signalMeaning:'ready'}};const before=structuredClone(d),r=cloneNode(d,cab.id),originalIds=new Set(d.devices.map(n=>n.id)),copies=r.devices.filter(n=>!originalIds.has(n.id)),newCab=copies.find(n=>n.type==='标准柜'),newEmu=copies.find(n=>n.type===emu.type),newPcs=copies.find(n=>n.type==='PCS'),newPv=copies.find(n=>n.type===pv.type),newWire=r.connections.find(e=>e.to===newEmu.id||e.from===newEmu.id);assert.notEqual(newCab.cabinetNumber,cab.cabinetNumber);assert.match(newCab.cabinetNumber,/^[1-9]\d*$/);assert.notEqual(newPcs.nodeId,pcs.nodeId);assert.notEqual(newEmu.coolingConfiguration.nodeId,emu.coolingConfiguration.nodeId);const nodes=topologyNodes({...d,devices:r.devices,connections:r.connections});assert.equal(new Set(nodes.map(xmlNodeId)).size,nodes.length);assert.equal(newPv.forwardDeviceId,newEmu.id);assert.equal(newPcs.metering.forwardDeviceId,newEmu.id);assert.notEqual(newWire.id,internal.id);assert.equal(newPcs.metering.measurement.measuredObjectRef,newWire.id);assert.equal(newWire.fromPort,internal.fromPort);assert.equal(newWire.toPort,internal.toPort);newPcs.metering.measurement.positiveDirection='Endpoint2To1';newPcs.metering.digitalInput.signalMeaning='changed';newEmu.coolingConfiguration.name='changed';assert.deepEqual(d,before);const again=cloneNode({...d,devices:r.devices,connections:r.connections},cab.id);assert.equal(new Set(again.devices.filter(n=>n.type==='标准柜').map(n=>n.cabinetNumber)).size,3)});
test('copying a single meter retains its valid external measurement wire while isolating config objects',()=>{const {createIndustrialReference}=load('topologyReference'),{cloneNode}=load('topologyModel');const d=createIndustrialReference(),owner=d.devices.find(n=>n.metering),wire=d.connections[0];const meter={...createDevice('电表',1),nodeId:'METER_EXPLICIT',measurement:{measuredObjectRef:wire.id,positiveDirection:'Endpoint1To2'},metering:{nodeId:'NESTED_TEST',measurement:{measuredObjectRef:wire.id,positiveDirection:'Endpoint1To2'}}};d.devices.push(meter);const r=cloneNode(d,meter.id),copy=r.devices.find(n=>n.id===r.selectedId);assert.notEqual(copy.nodeId,meter.nodeId);assert.equal(copy.measurement.measuredObjectRef,wire.id);assert.equal(copy.metering.measurement.measuredObjectRef,wire.id);assert.notEqual(copy.measurement,meter.measurement);assert.notEqual(copy.metering.measurement,meter.metering.measurement)});


test("fit-to-content preserves padding and centers the actual nodes rather than an empty world",()=>{
 const {fitCanvasViewport}=load("topologyCanvasModel")
 const view=fitCanvasViewport([{x:200,y:100,width:600,height:400}],{x:800,y:600},48)
 assert.equal(view.scale,(800-96)/600)
 assert.equal(view.x+500*view.scale,400)
 assert.equal(view.y+300*view.scale,300)
 assert.ok(view.x+200*view.scale>=48)
 assert.ok(view.y+100*view.scale>=48)
 const empty=fitCanvasViewport([],{x:600,y:400},48)
 assert.ok(Number.isFinite(empty.scale)&&Number.isFinite(empty.x)&&Number.isFinite(empty.y))
})

test("new starter templates center cabinet members inside the group without changing topology identities",()=>{
 const {buildSiteTemplate,nodePosition}=load("topologyModel"),draft={...emptyProvision(),...buildSiteTemplate('工商业储能')}
 const cabinet=draft.devices.find(d=>d.type==='标准柜'),pos=nodePosition(draft,cabinet,0)
 assert.equal(pos.x,50)
 const members=draft.devices.filter(d=>d.cabinetId===cabinet.id)
 for(const member of members){const p=nodePosition(draft,member,draft.devices.indexOf(member));assert.ok(Math.abs(p.x-pos.x)<=10);assert.ok(p.y>=pos.y+3&&p.y<=pos.y+22)}
 assert.ok(draft.connections.every(c=>draft.devices.some(d=>d.id===c.from)&&draft.devices.some(d=>d.id===c.to)))
})

test("implicit cabinet layout respects restored custom cabinet heights",()=>{
 const {buildSiteTemplate,nodePosition}=load("topologyModel"),draft={...emptyProvision(),...buildSiteTemplate('工商业储能')}
 const cab=draft.devices.find(d=>d.type==='标准柜'),battery=draft.devices.find(d=>d.type==='电池 / BMS')
 for(const height of [245,220,270]) {cab.height=height;const p=nodePosition(draft,battery,0);assert.ok(p.y*7.4+29<=cab.y*7.4-65+height,'battery must fit '+height)}
})
