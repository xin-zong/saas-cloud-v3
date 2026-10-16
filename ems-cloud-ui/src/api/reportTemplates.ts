import { api, send } from './client'
import type { ReportKind } from '@/components/apiAnalytics'

export type ReportTimeType = 'day' | 'month' | 'year' | 'range'
export type ReportTemplate = { id: string; name: string; kind: ReportKind; timeType: ReportTimeType; origin: 'system' | 'custom'; fields: string[]; schemaVersion: 1; version: number }
export type ReportTemplateField = { code: string; label: string; group: string; locked: boolean; linkRef: string[] }
export type ReportTemplateCatalog = { schemaVersion: 1; timeTypes: { code: ReportTimeType; label: string }[]; fields: ReportTemplateField[] }
export type ReportTemplateSnapshot = Pick<ReportTemplate, 'id' | 'name' | 'kind' | 'timeType' | 'fields' | 'schemaVersion' | 'version'>
export const REPORT_KIND_LABELS: Record<ReportKind, string> = { operations: '运营报告', revenue: '收益报告', health: '设备健康报告' }
export const REPORT_TIME_LABELS: Record<ReportTimeType, string> = { day: '按日', month: '按月', year: '按年', range: '日期范围' }
export function normalizeReportTemplateName(name: string): string {
  const value = name.trim()
  if (!value || value.length > 50) throw new Error('模板名称须为 1—50 个字符。')
  return value
}
export function loadReportTemplates(kind?: ReportKind, timeType?: ReportTimeType) {
  const query = new URLSearchParams()
  if (kind) query.set('kind', kind)
  if (timeType) query.set('timeType', timeType)
  return api<ReportTemplate[]>(`/report-templates${query.size ? `?${query}` : ''}`)
}
export const loadReportTemplateFields = (kind: ReportKind) => api<ReportTemplateCatalog>(`/report-template-fields?kind=${encodeURIComponent(kind)}`)
export const createReportTemplate = (draft: Pick<ReportTemplate, 'name' | 'kind' | 'timeType' | 'fields'>) => send<ReportTemplate>('/report-templates', 'POST', { name: normalizeReportTemplateName(draft.name), kind: draft.kind, timeType: draft.timeType, fields: draft.fields })
export function updateReportTemplate(template: ReportTemplate) {
  if (template.origin === 'system') throw new Error('系统模板只读，请另存为私人模板。')
  return send<ReportTemplate>(`/report-templates/${encodeURIComponent(template.id)}`, 'PUT', { name: normalizeReportTemplateName(template.name), timeType: template.timeType, fields: template.fields, expectedVersion: template.version })
}
export function deleteReportTemplate(template: ReportTemplate) {
  if (template.origin === 'system') throw new Error('系统模板不可删除。')
  return send<void>(`/report-templates/${encodeURIComponent(template.id)}?expectedVersion=${template.version}`, 'DELETE')
}
export const cloneReportTemplate = (template: Pick<ReportTemplate, 'id' | 'version'>, name: string) => send<ReportTemplate>(`/report-templates/${encodeURIComponent(template.id)}/clone`, 'POST', { name: normalizeReportTemplateName(name), expectedVersion: template.version })
function fieldClosure(codes: string[], catalog: ReportTemplateCatalog): Set<string> {
  const byCode = new Map(catalog.fields.map(field => [field.code, field])), selected = new Set<string>(), pending = [...codes]
  while (pending.length) {
    const code = pending.pop()!
    if (selected.has(code)) continue
    const field = byCode.get(code)
    if (!field) throw new Error(`字段目录已变化，请刷新并核对字段：${code}`)
    selected.add(code); pending.push(...field.linkRef)
  }
  return selected
}
export const lockedReportTemplateFields = (catalog: ReportTemplateCatalog) => fieldClosure(catalog.fields.filter(field => field.locked).map(field => field.code), catalog)
export function normalizeReportTemplateFields(codes: string[], catalog: ReportTemplateCatalog): string[] {
  const selected = fieldClosure([...codes, ...lockedReportTemplateFields(catalog)], catalog)
  return catalog.fields.filter(field => selected.has(field.code)).map(field => field.code)
}
export function toggleReportTemplateField(codes: string[], code: string, checked: boolean, catalog: ReportTemplateCatalog): string[] {
  const locked = lockedReportTemplateFields(catalog)
  if (checked || locked.has(code)) return normalizeReportTemplateFields([...codes, code], catalog)
  const selected = new Set(codes.filter(value => value !== code))
  let changed = true
  while (changed) {
    changed = false
    for (const field of catalog.fields) if (selected.has(field.code) && field.linkRef.some(dependency => !selected.has(dependency))) { selected.delete(field.code); changed = true }
  }
  return normalizeReportTemplateFields([...selected], catalog)
}
/** Date choices only; calculations remain the existing report job's responsibility. */
export function reportPeriodDates(type: ReportTimeType, values: { day?: string; month?: string; year?: string; from?: string; to?: string }): { from: string; to: string } {
  let from = values.from ?? '', to = values.to ?? ''
  if (type === 'day') from = to = values.day ?? ''
  if (type === 'month') {
    const month = values.month ?? ''
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('请选择有效月份。')
    from = `${month}-01`
    const end = new Date(`${from}T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0)
    to = end.toISOString().slice(0, 10)
  }
  if (type === 'year') {
    const year = values.year ?? ''
    if (!/^\d{4}$/.test(year) || Number(year) < 1) throw new Error('请选择有效年份。')
    from = `${year}-01-01`; to = `${year}-12-31`
  }
  const valid = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value
  if (!valid(from) || !valid(to) || to < from) throw new Error('请选择有效报告日期范围。')
  if (Date.parse(to) - Date.parse(from) + 86400000 > 366 * 86400000) throw new Error('请选择 366 天内有效报告时间范围。')
  return { from, to }
}
