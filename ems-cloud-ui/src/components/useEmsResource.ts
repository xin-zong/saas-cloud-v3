import { useCallback, useEffect, useRef, useState } from 'react'
import { CAPABILITIES_CHANGED } from '@/api/client'
import { createLatestRequest } from '@/api/ems'

/** Only a visible page polls. Each scope change clears facts and cancels old authority. */
export function useEmsResource<T>(key: string, enabled: boolean, load: (signal: AbortSignal) => Promise<T>) {
  const loader = useRef(load); loader.current = load
  const [state, setState] = useState<{ key: string; data?: T; error?: string; loading: boolean }>({ key, loading: false })
  const gate = useRef<ReturnType<typeof createLatestRequest<T>> | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(n => n + 1), [])
  useEffect(() => {
    setState({ key, loading: enabled })
    const request = createLatestRequest<T>(data => setState({ key, data, loading: false }), error => setState({ key, error: error instanceof Error ? error.message : 'EMS 数据读取失败', loading: false }))
    gate.current = request
    let revoked = false
    const run = () => {
      if (enabled && !revoked && document.visibilityState === 'visible') void request.run(signal => loader.current(signal))
      else request.cancel()
    }
    const revoke = () => { revoked = true; request.cancel(); setState({ key, loading: false, error: '权限已变化，请等待授权刷新' }) }
    run(); const timer = window.setInterval(run, 10000)
    document.addEventListener('visibilitychange', run); window.addEventListener(CAPABILITIES_CHANGED, revoke)
    return () => { request.cancel(); window.clearInterval(timer); document.removeEventListener('visibilitychange', run); window.removeEventListener(CAPABILITIES_CHANGED, revoke) }
  }, [key, enabled, revision])
  return { ...(state.key === key && enabled ? state : { key, loading: false }), refresh }
}
