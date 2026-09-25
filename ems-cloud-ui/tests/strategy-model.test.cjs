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
test("local external intent and priority order remain independent of dispatch", () => {
  const slot = newSlot();
  slot.overlays = ["AGC"];
  slot.advanced = true;
  slot.params.AGC.power = "25";
  assert.equal(validateSlot(slot, [], 100), "");
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

test("external parameters validate as local intent without claiming a service connection", () => {
  const slot = newSlot();
  slot.advanced = true;
  slot.overlays = ["VPP", "AGC", "调峰", "AVC"];
  slot.params.AGC.power = "25";
  slot.params["调峰"].charge = "20";
  slot.params["调峰"].discharge = "30";
  slot.params.AVC.voltage = "10.5";
  slot.params.AVC.reactive = "50";
  assert.equal(validateSlot(slot, [], 100), "");
  assert.equal(slot.params.AGC.connection, "未接入");
  slot.params["调峰"].charge = "101";
  assert.match(validateSlot(slot, [], 100), /最大充电功率/);
  slot.params["调峰"].charge = "20";
  slot.params.AVC.voltage = "-1";
  assert.match(validateSlot(slot, [], 100), /目标电压/);
});
test("Shanghai date and weekday use one calendar; tariff expiry is exclusive and currency stays native", () => {
  const { shanghaiCalendar, effectiveTariff, tariffUnit } = exportsObject;
  const calendar = shanghaiCalendar(new Date("2026-09-26T17:00:00Z"));
  assert.equal(calendar.date, "2026-09-27");
  assert.equal(calendar.weekday, 6);
  const expired = {
    id: 1,
    valid_from: "2026-09-01",
    valid_until: "2026-09-27",
    currency: "CNY",
  };
  const current = {
    id: 2,
    valid_from: "2026-09-27",
    valid_until: "2026-10-01",
    currency: "EUR",
  };
  assert.equal(effectiveTariff([expired], calendar.date), undefined);
  assert.equal(effectiveTariff([expired, current], calendar.date), current);
  assert.equal(tariffUnit(current), "EUR/kWh");
  assert.equal(tariffUnit({}), "币种未知/kWh");
  assert.equal(tariffUnit(undefined), "币种未知/kWh");
});
