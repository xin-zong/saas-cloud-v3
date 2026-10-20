/**
 * Energy Storage Agent V8 REST API V1（独立服务，非若依后端）
 * @see REST_API_V1.md
 */
import { context, sendHost, getContextVersion } from './context.js'
import { getToken, BASE_URL } from '@/api/client'

export const STORAGE_KEYS = {
  conversationId: 'energy_agent_conversation_id_v2',
  selectedSiteIds: 'energy_agent_selected_site_ids',
  dryRun: 'energy_agent_dry_run',
  agentMode: 'energy_agent_agent_mode',
  timeRange: 'energy_agent_time_range'
}

export const SITE_DIRECTORY_STALE_MESSAGE = '站点目录已更新，请刷新列表'

export class AgentApiError extends Error {
  constructor(message, status, detail) {
    super(message)
    this.name = 'AgentApiError'
    this.status = status
    this.detail = detail
  }
}

function getApiBaseUrl() {
  return `${BASE_URL}/agent`
}

function buildAuthHeaders(extra = {}) {
  const token = getToken()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra
  }
}

function localized(zh,en) { return context.language.startsWith('zh') ? zh : en }
function verifySession(token,version) {
 if(version !== undefined && version !== getContextVersion())throw new AgentApiError(localized('权限或站点范围已变化，请重新操作。','Your access permissions changed. Please try again.'),403)
 if (getToken() !== token) throw new AgentApiError(localized('会话已变化，请重新操作。','Your session changed. Please try again.'),401)
}
async function checkedFetch(path,options = {}) {
 const token=getToken(),version=getContextVersion()
 let response
 try { response=await fetch(path,options) } catch(error) {
  if(error?.name==='AbortError')throw error
  throw new AgentApiError(localized('无法连接智能体服务，请稍后重试或联系管理员配置服务。','Unable to connect to the Agent service. Retry later or contact your administrator.'),0)
 }
 verifySession(token,version)
 if(response.status===401 || response.status===403) sendHost(response.status===401?'unauthorized':'forbidden')
 if(!response.ok) {
  const body=await response.json().catch(()=>({}))
  const detail=typeof body.detail==='string'?body.detail:typeof body.msg==='string'?body.msg:''
  const unavailable=[404,502,503,504].includes(response.status)
  throw new AgentApiError(unavailable ? localized('智能体服务暂不可用，请稍后重试或联系管理员配置服务。','The Agent service is unavailable. Retry later or contact your administrator.') : detail || localized('智能体请求失败，请重试。','Agent request failed. Please retry.'),response.status,body)
 }
 return {response,token,version}
}
async function request(path, options = {}) {
 const {response,token,version}=await checkedFetch(getApiBaseUrl()+path,{...options,headers:{'Content-Type':'application/json',...buildAuthHeaders(),...options.headers}})
 const body=await response.json().catch(()=>{throw new AgentApiError(localized('智能体服务返回无效响应。','The Agent service returned an invalid response.'),502)})
 verifySession(token,version)
 return body
}

export function getHealth() {
  return request('/v1/health', { method: 'GET' })
}

export function getTools() {
  return request('/v1/tools', { method: 'GET' })
}

export function getRagHealth() {
  return request('/v1/rag/health', { method: 'GET' })
}

export async function getSites() {
  // Use the exact same platform directory, permissions and default ordering
  // as the station pages. Do not merge in Agent-side or historical sites.
  return context.stations.map(site => ({...site,site_id:String(site.id),display_name:site.name || site.code || String(site.id)}))
}

function buildChatPayload(payload = {}) {
  return {
    message: payload.message,
    conversation_id: payload.conversation_id ?? null,
    agent_mode: payload.agent_mode || 'simple',
    response_language: context.language.startsWith('zh') ? 'zh' : 'en',
    dry_run: true,
    site_scope: payload.site_scope || [],
    time_range: payload.time_range ?? null,
    user_context: payload.user_context || {},
    attachment_ids: payload.attachment_ids || []
  }
}

export function sendChatMessage(payload) {
  return request('/v1/chat', {
    method: 'POST',
    body: JSON.stringify(buildChatPayload(payload))
  })
}

/**
 * 流式聊天，每行一条 NDJSON 事件
 * @param {object} payload 同 sendChatMessage
 * @param {(event: object) => void} onEvent
 */
export async function streamChatMessage(payload, onEvent, options = {}) {
  const {response,token,version} = await checkedFetch(getApiBaseUrl()+'/v1/chat/stream', {
    method:'POST',headers:{'Content-Type':'application/json',...buildAuthHeaders()},
    body:JSON.stringify(buildChatPayload(payload)),signal:options.signal
  })
  if(!response.body)throw new AgentApiError(localized('智能体服务未返回数据流。','The Agent service did not return a stream.'),502)

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    verifySession(token,version)
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) continue
      onEvent(JSON.parse(line))
    }
  }

  verifySession(token,version)
  if (buffer.trim()) {
    onEvent(JSON.parse(buffer))
  }
}

export async function uploadAttachment(file) {
  const form = new FormData()
  form.append('file', file, file.name)

  const {response,token,version} = await checkedFetch(getApiBaseUrl()+'/v1/attachments', {method:'POST',headers:buildAuthHeaders(),body:form})
  const body=await response.json().catch(()=>{throw new AgentApiError(localized('附件服务返回无效响应。','The attachment service returned an invalid response.'),502)})
  verifySession(token,version)
  return body
}

export function getAttachment(attachmentId) {
  return request(`/v1/attachments/${encodeURIComponent(attachmentId)}`, { method: 'GET' })
}

export function deleteAttachment(attachmentId) {
  return request(`/v1/attachments/${encodeURIComponent(attachmentId)}`, { method: 'DELETE' })
}

export function resolveSiteId(site) {
  if (!site) return null
  return site.site_id || site.station_id || site.stationId || site.siteCode || null
}

export function resolveSiteLabel(site) {
  if (!site) return ''
  return site.display_name || site.site_alias || site.station_name ||
    site.siteAlias || site.stationName || resolveSiteId(site) || ''
}

/** 是否为「站点目录需刷新」类 invalid_argument */
export function isSiteDirectoryStale(display) {
  if (!display || display.status !== 'invalid_argument') {
    return false
  }
  const text = `${display.summary || ''}${display.detail || ''}`
  return text.includes(SITE_DIRECTORY_STALE_MESSAGE)
}

function scopedStorageKey(key, userId) {
  const identity = String(userId || 'anonymous').trim() || 'anonymous'
  return `${key}:${identity}`
}

function loadJsonSetting(key, userId, fallback) {
  try {
    const raw = localStorage.getItem(scopedStorageKey(key, userId))
    return raw == null ? fallback : JSON.parse(raw)
  } catch (e) {
    return fallback
  }
}

function saveJsonSetting(key, value, userId) {
  localStorage.setItem(scopedStorageKey(key, userId), JSON.stringify(value))
}

export function loadSelectedSiteIds(userId) {
  const value = loadJsonSetting(STORAGE_KEYS.selectedSiteIds, userId, [])
  return Array.isArray(value) ? value : []
}

export function saveSelectedSiteIds(siteIds, userId) {
  saveJsonSetting(STORAGE_KEYS.selectedSiteIds, Array.isArray(siteIds) ? siteIds : [], userId)
}

export function loadConversationId(userId) {
  return localStorage.getItem(scopedStorageKey(STORAGE_KEYS.conversationId, userId)) || null
}

export function saveConversationId(id, userId) {
  const key = scopedStorageKey(STORAGE_KEYS.conversationId, userId)
  if (id) {
    localStorage.setItem(key, id)
  } else {
    localStorage.removeItem(key)
  }
}

export function loadDryRun(userId) {
  const raw = localStorage.getItem(scopedStorageKey(STORAGE_KEYS.dryRun, userId))
  if (raw === 'false') return false
  return true
}

export function saveDryRun(value, userId) {
  localStorage.setItem(scopedStorageKey(STORAGE_KEYS.dryRun, userId), value ? 'true' : 'false')
}

export function loadAgentMode(userId) {
  const raw = localStorage.getItem(scopedStorageKey(STORAGE_KEYS.agentMode, userId))
  return raw === 'thinking' ? 'thinking' : 'simple'
}

export function saveAgentMode(mode, userId) {
  localStorage.setItem(scopedStorageKey(STORAGE_KEYS.agentMode, userId), mode === 'thinking' ? 'thinking' : 'simple')
}

export function loadTimeRange(userId) {
  const value = loadJsonSetting(STORAGE_KEYS.timeRange, userId, null)
  return value && typeof value === 'object' ? value : null
}

export function saveTimeRange(value, userId) {
  saveJsonSetting(STORAGE_KEYS.timeRange, value || null, userId)
}
