const GLOBAL_SITE_QUESTION_PATTERNS = [
  /how many sites/i,
  /how many stations/i,
  /managed sites/i,
  /managed stations/i,
  /sites do we manage/i,
  /stations do we manage/i,
  /list\s+(all\s+)?(sites|site names|stations|station names)/i,
  /all sites/i,
  /all stations/i,
  /site directory/i,
  /station directory/i,
  /site list/i,
  /station list/i,
  /站点.*几个/,
  /管理.*站点/,
  /所有站点/,
  /站点列表/
]

export function mapDisplayQuestionToInternal(text) {
  return String(text ?? '')
}

export function mapInternalTextToDisplay(text) {
  return String(text ?? '')
}

export function mapAgentResponseToDisplay(value) {
  return value
}

export function getDisplaySiteMatches(text, sites = []) {
  return (Array.isArray(sites) ? sites : []).filter(site => siteMatchesText(site, text))
}

export function isGlobalSiteQuestion(text) {
  const value = String(text ?? '')
  return GLOBAL_SITE_QUESTION_PATTERNS.some(pattern => pattern.test(value))
}

export function resolveMappedSiteIdsFromQuestion(text, sites) {
  return getDisplaySiteMatches(text, sites)
    .map(getSiteId)
    .filter(Boolean)
    .filter((siteId, index, all) => all.indexOf(siteId) === index)
}

export function mergeSiteScopes(...scopes) {
  const merged = []
  scopes.forEach(scope => {
    if (!Array.isArray(scope)) return
    scope.forEach(siteId => {
      const value = String(siteId || '').trim()
      if (value && !merged.includes(value)) merged.push(value)
    })
  })
  return merged
}

function siteMatchesText(site, text) {
  const normalizedText = normalizeLookup(text)
  if (!normalizedText) return false
  return getSiteLookupValues(site).some(value => {
    const normalized = normalizeLookup(value)
    return normalized.length >= 3 && normalizedText.includes(normalized)
  })
}

function getSiteId(site) {
  if (!site) return null
  return site.site_id || site.station_id || site.siteId || site.stationId || site.site_code || site.siteCode || null
}

function getSiteLookupValues(site) {
  if (!site) return []
  return [
    getSiteId(site),
    site.display_name,
    site.displayName,
    site.site_alias,
    site.siteAlias,
    site.station_name,
    site.stationName,
    site.site_name,
    site.siteName,
    site.name,
    site.label,
    ...(Array.isArray(site.aliases) ? site.aliases : [])
  ].filter(Boolean)
}

function normalizeLookup(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/站点/g, '')
    .replace(/\b(site|station)\b/g, '')
    .replace(/[\s_\-\u2010-\u2015]+/g, '')
    .trim()
}
