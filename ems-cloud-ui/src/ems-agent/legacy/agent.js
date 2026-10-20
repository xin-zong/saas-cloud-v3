// Legacy public interface adapted to the authenticated, server-side local gateway.

import { getHostContext } from "../host-context"
import { AgentApiError, agentRequest, chatPayload } from '../transport'
export { AgentApiError, streamChatMessage, uploadAttachment } from '../transport'

export const STORAGE_KEYS = {
  conversationId: "toyingzhen_ems_agent_conversation_id_v2",

  selectedSiteIds: "toyingzhen_ems_agent_selected_site_ids",

  dryRun: "toyingzhen_ems_agent_dry_run",

  agentMode: "toyingzhen_ems_agent_agent_mode",

  timeRange: "toyingzhen_ems_agent_time_range",
}

export const SITE_DIRECTORY_STALE_MESSAGE = "站点目录已更新，请刷新列表"

export const getHealth = () => agentRequest('/v1/health')
export const getTools = () => agentRequest('/v1/tools')
export const getRagHealth = () => agentRequest('/v1/rag/health')

export const getSites = async () => getHostContext().sites

export const sendChatMessage = payload => agentRequest('/v1/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(chatPayload(payload))})
export const getAttachment = id => agentRequest('/v1/attachments/'+encodeURIComponent(id))
export const deleteAttachment = id => agentRequest('/v1/attachments/'+encodeURIComponent(id),{method:'DELETE'})

export function resolveSiteId(site) {
  if (!site) return null

  return (
    site.site_id || site.station_id || site.stationId || site.siteCode || null
  )
}

export function resolveSiteLabel(site) {
  if (!site) return ""

  return (
    site.display_name ||
    site.site_alias ||
    site.station_name ||
    site.siteAlias ||
    site.stationName ||
    resolveSiteId(site) ||
    ""
  )
}

/** 是否为「站点目录需刷新」类 invalid_argument */

export function isSiteDirectoryStale(display) {
  if (!display || display.status !== "invalid_argument") {
    return false
  }

  const text = `${display.summary || ""}${display.detail || ""}`

  return text.includes(SITE_DIRECTORY_STALE_MESSAGE)
}

function scopedStorageKey(key, userId) {
  const identity = String(userId || "anonymous").trim() || "anonymous"

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
  saveJsonSetting(
    STORAGE_KEYS.selectedSiteIds,
    Array.isArray(siteIds) ? siteIds : [],
    userId,
  )
}

export function loadConversationId(userId) {
  return (
    localStorage.getItem(
      scopedStorageKey(STORAGE_KEYS.conversationId, userId),
    ) || null
  )
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
  const raw = localStorage.getItem(
    scopedStorageKey(STORAGE_KEYS.dryRun, userId),
  )

  if (raw === "false") return false

  return true
}

export function saveDryRun(value, userId) {
  localStorage.setItem(
    scopedStorageKey(STORAGE_KEYS.dryRun, userId),
    value ? "true" : "false",
  )
}

export function loadAgentMode(userId) {
  const raw = localStorage.getItem(
    scopedStorageKey(STORAGE_KEYS.agentMode, userId),
  )

  return raw === "thinking" ? "thinking" : "simple"
}

export function saveAgentMode(mode, userId) {
  localStorage.setItem(
    scopedStorageKey(STORAGE_KEYS.agentMode, userId),
    mode === "thinking" ? "thinking" : "simple",
  )
}

export function loadTimeRange(userId) {
  const value = loadJsonSetting(STORAGE_KEYS.timeRange, userId, null)

  return value && typeof value === "object" ? value : null
}

export function saveTimeRange(value, userId) {
  saveJsonSetting(STORAGE_KEYS.timeRange, value || null, userId)
}
