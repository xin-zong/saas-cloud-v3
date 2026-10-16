import { api, send } from './client'
export type MonitorTemplate = { id: string; name: string; cards: string[]; pinned: boolean; sortOrder: number; version: number }
export type MonitorConfiguration = { items: MonitorTemplate[]; selectedId: string | null }
export const loadMonitorTemplates = () => api<MonitorConfiguration>('/monitor/templates')
export const createMonitorTemplate = (name: string, cards: string[]) => send<MonitorTemplate>('/monitor/templates', 'POST', { name, cards })
export const updateMonitorTemplate = (template: Pick<MonitorTemplate, 'id' | 'name' | 'cards' | 'version'>) => send<MonitorTemplate>(`/monitor/templates/${encodeURIComponent(template.id)}`, 'PUT', { name: template.name, cards: template.cards, expectedVersion: template.version })
export const pinMonitorTemplate = (template: Pick<MonitorTemplate, 'id' | 'version'>, pinned: boolean) => send<MonitorTemplate>(`/monitor/templates/${encodeURIComponent(template.id)}/pin`, 'PUT', { pinned, expectedVersion: template.version })
export const deleteMonitorTemplate = (template: Pick<MonitorTemplate, 'id' | 'version'>) => send<void>(`/monitor/templates/${encodeURIComponent(template.id)}?expectedVersion=${template.version}`, 'DELETE')
export const selectMonitorTemplate = (templateId: string | null) => send<void>('/monitor/templates/selection', 'PUT', { templateId })
