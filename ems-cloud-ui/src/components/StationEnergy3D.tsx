import { Component, lazy, Suspense, useState, type ReactNode } from "react"
import type { DeviceType, EnergyMetrics } from "./EnergyFlow3D"

const EnergyFlow3D = lazy(() => import("./EnergyFlow3D"))
const unavailable = <div className="station-3d-status" role="status">3D 暂不可用，请切换回设备图查看。</div>

class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? unavailable : this.props.children }
}

export default function StationEnergy3D(props: {
  metrics: EnergyMetrics
  selectedType: DeviceType
  onDeviceSelect: (type: DeviceType) => void
}) {
  const [supported] = useState(() => {
    try {
      const context = document.createElement("canvas").getContext("webgl2")
      if (!context) return false
      context.getExtension("WEBGL_lose_context")?.loseContext()
      return true
    } catch { return false }
  })
  if (!supported) return unavailable
  return <SceneBoundary>
    <Suspense fallback={<div className="station-3d-status" role="status">正在加载 3D 设备图…</div>}>
      <EnergyFlow3D {...props} fallback={unavailable} />
    </Suspense>
  </SceneBoundary>
}
