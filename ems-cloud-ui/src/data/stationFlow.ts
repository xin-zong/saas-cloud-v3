import type {DashboardFlow} from '@/api/stationDashboard'
import type {EnergyMetrics, EdgeConfig} from '@/components/EnergyFlow3D'

/** Explicit dataset contract: grid + imports / − exports; battery + charges / − discharges.
 * PV + generates and load + consumes. No balance equation or branch allocation is inferred.
 */
export type StationFlowInput = DashboardFlow & {solarKw?:number|null;batterySoc?:number|null}
export type FlowDirectionConvention = 'import-charge-positive' | null
export type FlowDirection = 'forward' | 'reverse' | 'idle' | 'unknown'
export interface StationFlowModel {
  batterySoc: number | null
  values: DashboardFlow
  metrics: EnergyMetrics
  edges: EdgeConfig[]
  gridDirection: FlowDirection
  batteryDirection: FlowDirection
  solarDirection: FlowDirection
  loadDirection: FlowDirection
}
const finite = (value: number | null | undefined): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null
function direction(value: number | null, known: boolean, reversible = true): FlowDirection {
  if (value === null) return 'unknown'
  if (value === 0) return 'idle'
  if (!known || (!reversible && value < 0)) return 'unknown'
  return value > 0 ? 'forward' : 'reverse'
}
export function buildStationFlow(flow: StationFlowInput | null | undefined, convention: FlowDirectionConvention = null, scene = 'overall'): StationFlowModel {
  const gridOnly = scene === 'grid'
  const solarOnly = scene === 'solar' || scene === 'pv'
  const values: DashboardFlow = {
    gridKw: finite(flow?.gridKw), loadKw: finite(flow?.loadKw),
    pcsKw: gridOnly || solarOnly ? null : finite(flow?.pcsKw),
    mpptKw: gridOnly ? null : finite(flow?.solarKw ?? flow?.mpptKw),
    batteryKw: gridOnly || solarOnly ? null : finite(flow?.batteryKw),
  }
  const metric = (value: number | null) => ({value: value === null ? '—' : new Intl.NumberFormat('en-US',{maximumSignificantDigits:4,useGrouping:false}).format(value), unit: 'kW'})
  const metrics: EnergyMetrics = {tower: metric(values.gridKw),factory: metric(values.loadKw),pcs: metric(values.pcsKw),solar: metric(values.mpptKw),battery: metric(values.batteryKw)}
  const known = convention === 'import-charge-positive'
  const gridDirection = direction(values.gridKw, known)
  const batteryDirection = direction(values.batteryKw, known)
  const solarDirection = direction(values.mpptKw, true, false)
  const loadDirection = direction(values.loadKw, true, false)
  // Original 3D central connection position acts as the common bus. An edge is a
  // node meter to bus branch, never a claim that one source supplies another node.
  const edge = (id: string, from: string, to: string, dir: FlowDirection): EdgeConfig => ({id,from:dir==='reverse'?to:from,to:dir==='reverse'?from:to,animate:dir==='forward'||dir==='reverse'})
  const edges = [edge('grid','tower','pcs',gridDirection),...(!gridOnly?[edge('solar','solar','pcs',solarDirection)]:[]),edge('load','pcs','factory',loadDirection),...(!gridOnly&&!solarOnly?[edge('battery','pcs','battery',batteryDirection)]:[])]
  const soc = finite(flow?.batterySoc)
  const batterySoc = gridOnly || solarOnly || soc === null || soc < 0 || soc > 100 ? null : soc
  return {values,metrics,edges,gridDirection,batteryDirection,solarDirection,loadDirection,batterySoc}
}
