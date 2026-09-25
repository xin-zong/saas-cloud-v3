import { useCallback, useEffect, useRef } from 'react'

export type RegisterLeaveGuard = (guard: null | (() => Promise<boolean>)) => void

/** A pending destination is cancelled when its editor or permission disappears. */
export function useEditorLeaveGuard({ dirty, enabled = true, onConfirm, onCancel, registerLeaveGuard }: {
  dirty: boolean
  enabled?: boolean
  onConfirm: () => void
  onCancel: () => void
  registerLeaveGuard?: RegisterLeaveGuard
}) {
  const current = useRef({ dirty, enabled, onConfirm, onCancel })
  current.current = { dirty, enabled, onConfirm, onCancel }
  const pending = useRef<{ promise: Promise<boolean>; resolve: (allowed: boolean) => void } | null>(null)
  const settleLeave = useCallback((allowed: boolean) => {
    const request = pending.current
    pending.current = null
    request?.resolve(allowed)
    return !!request
  }, [])
  const requestLeave = useCallback(() => {
    if (pending.current) return pending.current.promise
    if (!current.current.enabled || !current.current.dirty) return Promise.resolve(true)
    let resolve!: (allowed: boolean) => void
    const promise = new Promise<boolean>(done => { resolve = done })
    pending.current = { promise, resolve }
    current.current.onConfirm()
    return promise
  }, [])
  useEffect(() => {
    registerLeaveGuard?.(requestLeave)
    return () => { registerLeaveGuard?.(null) }
  }, [registerLeaveGuard, requestLeave])
  useEffect(() => () => { settleLeave(false) }, [settleLeave])
  useEffect(() => {
    if (!enabled) {
      settleLeave(false)
      current.current.onCancel()
    }
  }, [enabled, settleLeave])
  return { requestLeave, settleLeave }
}
