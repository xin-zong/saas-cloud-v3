/** Fixed field order from the saved QUDEOX device screenshots; no inferred metric aliases. */
export type DashboardSection={title:string;fields:string[]}
const section=(title:string,fields:string[]):DashboardSection=>({title,fields})
/** Keep source numbering; the reported channel count does not define registered fields. */
function mpptInputs(points:Record<string,unknown>[]):string[]{
 const labels=[...new Set(points.flatMap(point=>{const match=/^(?:详情 · )?(直流输入电(?:压|流)([1-9]\d*))$/.exec(String(point.name??''));return match?[match[1]]:[]}))]
 return labels.sort((a,b)=>Number(a.includes('电流'))-Number(b.includes('电流'))||Number(a.match(/\d+$/)?.[0])-Number(b.match(/\d+$/)?.[0]))
}
const battery=['当前功率','绝缘阻抗','电池温度','电池电压','电池电流','最大充电功率','最大放电功率','电池健康度SOH','电池循环次数','可充电量','可放电量','今日充电量','今日放电量','累计充电量','累计放电量']
export function deviceDashboard(type:string,points:Record<string,unknown>[] = []):DashboardSection[]{
 switch(type){
 case 'environment':return [section('基础信息',['序列号']),section('状态',['急停状态','消防状态','水浸状态'])]
 case 'mppt':return [section('铭牌定值',['SN','设备类型','最大直流路数']),section('发电',['实际直流路数','光伏-耦合有功总功率','光伏-耦合当日发电量','光伏-耦合累计发电量',...mpptInputs(points)]),section('电网',['电网总输出功率','电网频率','电网功率因数','电网总无功功率']),section('状态',['设备状态']),section('自定义参数',['自定义参数201'])]
 case 'liquid-cooler':return [section('铭牌定值',['SN']),section('设置参数',['控制温度选择','制冷设定温度','制热设定温度','制冷回差','加热回差','ID']),section('温度',['出水温度','回水温度']),section('压力',['进水压力','出水压力']),section('基础信息',['系统时间']),section('状态',['当前系统模式','断路器状态','消防状态','热管理模块连接状态','压缩机运行频率','水泵运行频率','加热运行状态','电表连接状态','上水位开关告警','下水位开关告警','故障信息']),section('版本信息',['软件主版本号']),section('报警',[2,4,5,6,7,8,9,10,21,22,23,24,31,32,33,34,35,36,41,42,43,51,52,53,61,71].map(n=>'报警代码'+n))]
 case 'inverter':return [section('关键运行数据',['直流输入总功率','交流输出总功率','交流无功总功率','交流视在总功率','设备状态','绝缘阻抗','逆变器温度','当日发电量（有功）','累计发电量（有功）','当日满发小时'])]
 case 'pcs':return [section('关键运行数据',['总直流电压','总直流电流','总直流功率','总交流有功功率','交流无功总功率','交流视在总功率','设备状态','充放电状态','总交流功率因素','内部温度','交流频率'])]
 case 'meter':return [section('关键运行数据',['有功总功率','无功总功率','视在总功率','实时功率因数','频率'])]
 case 'battery-cluster':case 'battery-stack':return [section('关键运行数据',battery)]
 case 'logger':return [section('基础信息',['内置设备SN','联网方式','互联网连接状态']),section('版本信息',['模块版本号','软件主版本号']),section('运行信息',['WiFi信号强度','4G信号强度']),section('状态',['策略模式'])]
 case 'ems':return [section('铭牌定值',['SN']),section('版本信息',['软件主版本号']),section('状态',['通信状态'])]
 default:return []
 }
}
/** A detail snapshot takes precedence over the independent list snapshot. Duplicate bindings are unsafe. */
export function dashboardPoint(points:Record<string,unknown>[],label:string):Record<string,unknown>|undefined{
 const labels=label==='充放电状态'?['充放电状态','电池充放电状态']:[label]
 const detail=points.filter(p=>labels.some(name=>p.name===`详情 · ${name}`))
 if(detail.length)return detail.length===1?detail[0]:undefined
 const matches=points.filter(p=>labels.includes(String(p.name)))
 return matches.length===1?matches[0]:undefined
}
export const batterySummary=['单体电压极差','单体电压平均值','单体温度极差','单体温度平均值']
/** Topology direction alone does not identify a battery stack. */
export function isStackParent(connection:Record<string,unknown>){return connection.direction==='upstream'&&connection.type==='battery-stack'}
