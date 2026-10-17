export type ConditionField = {
  code: string
  unit: string
  cycleType: string
  objectType: string
}
export type Condition = {
  fields: ConditionField[]
  algorithm: string
  period: number
  operator: string
  lower: number | null
  upper: number | null
  statusValue: string | null
  includeLower: boolean
  includeUpper: boolean
  extend1: boolean
}
export const emptyCondition = (objectType = "DEVICE"): Condition => ({
  fields: [{ code: "", unit: "", cycleType: "INSTANT", objectType }],
  algorithm: "self",
  period: 1,
  operator: "gt",
  lower: null,
  upper: null,
  statusValue: null,
  includeLower: true,
  includeUpper: false,
  extend1: false,
})
export const conditionOperators: { [key: string]: string } = {
  eq: "等于",
  neq: "不等于",
  lt: "小于",
  lte: "小于等于",
  gt: "大于",
  gte: "大于等于",
  bet: "区间内",
  nbet: "区间外",
  mom_up: "环比上升",
  mom_down: "环比下降",
  yoy_up: "同比上升",
  yoy_down: "同比下降",
}
