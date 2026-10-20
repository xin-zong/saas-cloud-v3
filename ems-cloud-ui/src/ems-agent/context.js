import Vue from 'vue'
export const context = Vue.observable({ visible:false, sessionVersion:0, user: null, language: 'zh-CN', theme: 'light', timezone: 'Asia/Shanghai', stations: [], activeNav: '', activeStationId: null, viewportWidth: 0, viewportHeight: 0 })
let accessVersion=0
export const getContextVersion=()=>accessVersion
function accessFingerprint(){return JSON.stringify([context.user?.tenantId,context.user?.id,context.sessionVersion,[...(context.user?.permissions||[])].sort(),[...(context.user?.roles||[])].sort(),Object.entries(context.user?.stationPermissions||{}).sort(([a],[b])=>a.localeCompare(b)).map(([id,permissions])=>[id,[...permissions].sort()]),context.stations.map(site=>[String(site.id),String(site.code||'')]).sort(([a],[b])=>a.localeCompare(b))])}
export const sendHost = (type, detail = {}) => window.parent.postMessage({source:'enerlution-ems-agent', type, ...detail}, window.location.origin)
export function receiveContext(event) {
  if (event.origin !== window.location.origin || event.source !== window.parent) return false
  if (event.data?.source !== 'enerlution-ems-agent' || event.data?.type !== 'context') return false
  const value = event.data.context
  if (!value || typeof value !== 'object') return false
  const previousAccess=accessFingerprint()
  for (const key of Object.keys(context)) if (Object.prototype.hasOwnProperty.call(value,key)) context[key] = value[key]
  if(accessFingerprint()!==previousAccess)accessVersion++
  document.documentElement.lang = context.language
  document.documentElement.dataset.theme = context.theme
  return true
}
export function storageIdentity() { return `${context.user?.tenantId || 'default'}:${context.user?.id || 'anonymous'}` }
export const getPageZoom = () => 1
export async function collectAgentPageContext() {
 return { active_page_id:context.activeNav || null, collected_at:new Date().toISOString(), pages:[{page_id:context.activeNav || 'current', active:true, selected_station_id:context.activeStationId, timezone:context.timezone}] }
}
export async function executeAgentFrontendActions(actions = []) {
 return actions.map(action=>({status:'not_available',action:action?.action || '',page_id:action?.page_id || null,message:'This page does not support Agent actions. No changes were applied.'}))
}
