const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const file = path.join(__dirname, "../src/components/strategy/model.ts");
const source = fs.readFileSync(file, "utf8");
const exportsObject = {};
vm.runInNewContext(
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText,
  { exports: exportsObject, Date, JSON, Math, Number, Set },
);
const {
  newSlot,
  validateSlot,
  validateStrategy,
  newStrategy,
  movePriority,
  decodeWorkspace,
} = exportsObject;
test("weekly conflicts apply only to shared weekdays; touching endpoints are valid", () => {
  const first = newSlot();
  first.start = "00:00";
  first.end = "07:00";
  first.days = [0];
  const second = newSlot();
  second.id = "second";
  second.start = "06:00";
  second.end = "08:00";
  second.days = [1];
  assert.equal(validateSlot(second, [first], 100), "");
  second.days = [0];
  assert.match(validateSlot(second, [first], 100), /重叠/);
  second.start = "07:00";
  assert.equal(validateSlot(second, [first], 100), "");
  second.end = "25:00";
  assert.match(validateSlot(second, [first], 100), /时间/);
});
test("mode parameters and charging rows validate before local persistence", () => {
  const slot = newSlot();
  slot.days = [];
  assert.match(validateSlot(slot, [], 100), /生效/);
  slot.days = [0];
  slot.base = "光伏自发自用";
  slot.params["光伏自发自用"].reserve = "101";
  assert.match(validateSlot(slot, [], 100), /最低保留电量/);
  slot.params["光伏自发自用"].reserve = "20";
  slot.base = "峰谷套利";
  slot.charge = [
    { id: "c", start: "00:00", end: "02:00", power: "101", enabled: true },
  ];
  assert.match(validateSlot(slot, [], 100), /功率/);
  slot.charge[0].power = "20";
  slot.discharge = [
    { id: "d", start: "01:00", end: "03:00", power: "20", enabled: true },
  ];
  assert.match(validateSlot(slot, [], 100), /重叠/);
});
test("disabled external dispatch cannot be saved as enabled; priority order is immutable", () => {
  const slot = newSlot();
  slot.overlays = ["AGC"];
  assert.match(validateSlot(slot, [], 100), /未接入/);
  const order = ["VPP", "需量控制", "容量保护"];
  assert.deepEqual(Array.from(movePriority(order, 0, 2)), [
    "需量控制",
    "容量保护",
    "VPP",
  ]);
  assert.equal(order[0], "VPP");
});
test("invalid local persistence recovers empty, valid plans survive roundtrip", () => {
  assert.equal(decodeWorkspace("{bad").plans.length, 0);
  assert.equal(decodeWorkspace('{"plans":[{}]}').plans.length, 0);
  const plan = newStrategy("p");
  plan.name = "本地";
  plan.slots = [newSlot()];
  assert.equal(validateStrategy(plan, 100), "");
  assert.equal(
    decodeWorkspace(JSON.stringify({ plans: [plan], selected: "p" })).plans[0]
      .name,
    "本地",
  );
  plan.name = "";
  assert.match(validateStrategy(plan, 100), /名称/);
});
