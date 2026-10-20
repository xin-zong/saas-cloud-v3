const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  ts = require("typescript")
function preferencesModule() {const exports={};new Function("exports","require",ts.transpileModule(fs.readFileSync(`${__dirname}/../src/preferences/date.ts`,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(exports,()=>({getPreferences:()=>({timezone:"UTC"})}));return exports}
function model() {
  const exports = {}
  new Function(
    "exports", "require",
    ts.transpileModule(
      fs.readFileSync(`${__dirname}/../src/data/alarmPresentation.ts`, "utf8"),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
  )(exports,id=>id==="@/preferences/date"?preferencesModule():{getPreferences:()=>({timezone:"UTC"})})
  return exports
}
test("rule columns contain trigger indicator and device columns do not", () => {
  const m = model()
  assert.equal(m.alarmColumns("rule").includes("触发指标"), true)
  assert.equal(m.alarmColumns("device").includes("触发指标"), false)
  assert.deepEqual(m.alarmColumns("device"), [
    "报警名称",
    "等级",
    "状态",
    "报警对象",
    "所属场站",
    "报警开始时间",
    "恢复时间",
    "持续时长",
    "操作",
  ])
})
test("closed alarms end duration at closure without fabricating recovery", () => {
  const m = model()
  assert.equal(
    m.alarmDuration(
      {
        occurred_at: "2026-10-01T01:00:00Z",
        closed_at: "2026-10-01T02:30:00Z",
        effective_recovered_at: null,
      },
      new Date("2026-10-03T01:00:00Z"),
    ),
    "1小时30分钟",
  )
  assert.equal(m.alarmDuration({ occurred_at: "invalid" }), "—")
})
test("history month range includes full local calendar month", () => {
  const m = model(),
    range = m.alarmMonthRange("2026-02")
  assert.equal(new Date(range.start).getDate(), 1)
  assert.equal(new Date(range.end).getDate(), 1)
  assert.equal(new Date(range.end).getMonth(), 2)
  assert.throws(() => m.alarmMonthRange("2026-13"))
})

test("history filters stay inside the chosen month across month boundaries", () => {
  const m = model()
  const range = m.alarmTimeRange(
    "2026-02",
    "2026-01-01T00:00",
    "2026-03-10T00:00",
  )
  assert.deepEqual(range, m.alarmMonthRange("2026-02"))
  assert.throws(() => m.alarmTimeRange("2026-02", "2026-03-03T00:00", ""))
})

test("history distribution groups names across days and levels, ranks counts and retains exact labels",()=>{
 const m=model(),rows=[{name:"温度高",severity:"critical",day:"2026-10-01",count:2},{name:"温度高",severity:"warning",day:"2026-10-02",count:3},{name:"电压低",severity:"critical",day:"2026-10-01",count:5},{name:"通信中断",severity:"info",day:"2026-10-01",count:10}]
 const groups=m.alarmNameDistribution(rows)
 assert.equal(groups.length,3);assert.deepEqual(groups[0],{name:"通信中断",count:10,percent:50});assert.equal(groups.find(x=>x.name==="温度高").count,5);assert.equal(groups.reduce((a,b)=>a+b.count,0),20)
 assert.deepEqual(m.alarmNameDistribution(rows,"warning"),[{name:"温度高",count:3,percent:100}]);assert.deepEqual(m.alarmNameDistribution([]),[])
})

test("history columns follow captured order without live duration column",()=>{
 const m=model();assert.deepEqual(m.alarmColumns("rule","history"),["报警名称","触发指标","报警状态","等级","报警对象","所属场站","报警开始时间","恢复时间","操作"]);assert.deepEqual(m.alarmColumns("device","history"),["报警名称","报警状态","等级","报警对象","所属场站","报警开始时间","恢复时间","操作"])
})

test("CSV values follow visible history and realtime columns for both sources", () => {
  const m=model();
  const row={title:"温度",severity:"minor",trigger_indicator:"temperature",lifecycle:"recovered",object_type:"DEVICE",device_name:"PCS",station_name:"新疆",occurred_at:"2026-10-01T00:00:00Z",effective_recovered_at:"2026-10-01T00:05:00Z"};
  for(const source of ["rule","device"]) for(const view of ["history","live"]) {
    const values=m.alarmExportValues(row,source,view,"次要","已恢复");
    const headers=m.alarmColumns(source,view).slice(0,-1);
    assert.equal(values.length,headers.length);
    const cells=Object.fromEntries(headers.map((key,i)=>[key,values[i]]));
    assert.equal(cells[view==="history"?"报警状态":"状态"],"已恢复");
    assert.equal(cells["等级"],"次要");
    assert.equal(cells["所属场站"],"新疆");
    assert.equal(cells["持续时长"],view==="live"?"5分钟":undefined);
    assert.equal(cells["触发指标"],source==="rule"?"temperature":undefined);
  }
});
