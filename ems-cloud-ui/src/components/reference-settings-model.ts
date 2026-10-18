export const settingsSections=['场站信息','基本电费','电价费率','授权信息','数据源','偏移量','计划发电','电能分析算法','实际需量','功率因数','收益','License管理'] as const
export const sourceGroups=[['辐照',[]],['光伏发电',['pvEnergy','mpptEnergy']],['储能',['chargeEnergy','dischargeEnergy','soc','soh']],['用电',['loadEnergy']],['电网',['gridImportEnergy','gridExportEnergy']]] as const
export function planTotal(months:{plannedKwh:string;excellentKwh:string|null}[],excellent=false){const values=months.map(m=>excellent?m.excellentKwh:m.plannedKwh);if(values.some(v=>v===null||v===''))return null;return values.reduce<number>((sum,v)=>sum+Number(v),0)}
export function numericOffset(value:string){if(!/^-?\d+(?:\.\d+)?$/.test(value)||!Number.isFinite(Number(value)))throw Error('请输入有效的电量偏移值');return value}

export function energyOffsetDate(kind:'DAILY'|'TOTAL',day:string){return kind==='TOTAL'?'1970-01-01':day}
