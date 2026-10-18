import {api,send} from './client'
export type BasicElectricityDraft={pricePolicy:''|'single'|'two-part';priceType:''|'capacity'|'contract-demand'|'actual-demand';transformerCapacityKva:string;contractDemandKw:string;consumerNumber:string}
export type BasicElectricityConfig=Omit<BasicElectricityDraft,'priceType'|'transformerCapacityKva'|'contractDemandKw'> & {stationId:string;priceType:BasicElectricityDraft['priceType']|null;transformerCapacityKva:string|null;contractDemandKw:string|null;version:number;billingConnected:false}
export const emptyBasicElectricity=():BasicElectricityDraft=>({pricePolicy:'',priceType:'',transformerCapacityKva:'',contractDemandKw:'',consumerNumber:''})
export function basicElectricityDraft(value:BasicElectricityConfig|null):BasicElectricityDraft{return value?{pricePolicy:value.pricePolicy,priceType:value.priceType??'',transformerCapacityKva:value.transformerCapacityKva??'',contractDemandKw:value.contractDemandKw??'',consumerNumber:value.consumerNumber}:emptyBasicElectricity()}
export function basicElectricityPayload(d:BasicElectricityDraft,expectedVersion:number){
 if(!['single','two-part'].includes(d.pricePolicy))throw Error('请选择电价政策')
 if(d.consumerNumber.length>50)throw Error('户号最多50个字符')
 const two=d.pricePolicy==='two-part';if(two&&!['capacity','contract-demand','actual-demand'].includes(d.priceType))throw Error('请选择两部制类型')
 const capacity=two&&d.priceType==='capacity'?d.transformerCapacityKva:null,demand=two&&d.priceType==='contract-demand'?d.contractDemandKw:null
 for(const v of [capacity,demand])if(v!==null&&(!/^\d+(?:\.\d{1,2})?$/.test(v)||v.length>20||Number(v)>65535))throw Error('容量/需量须为0–65535，最多两位小数')
 return {pricePolicy:d.pricePolicy,priceType:two?d.priceType:null,transformerCapacityKva:capacity,contractDemandKw:demand,consumerNumber:d.consumerNumber,expectedVersion}
}
const path=(station:string)=>`/stations/${encodeURIComponent(station)}/basic-electricity`
export const loadBasicElectricity=(station:string,signal?:AbortSignal)=>api<BasicElectricityConfig|null>(path(station),{signal})
export const saveBasicElectricity=(station:string,draft:BasicElectricityDraft,expectedVersion:number)=>send<BasicElectricityConfig>(path(station),'PUT',basicElectricityPayload(draft,expectedVersion))
