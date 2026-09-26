import { useEffect, useRef, type ReactNode } from "react"
import "./system-settings.css"

/** Native modal provides focus containment; callbacks stay current without refocusing. */
export default function SettingsDialog({ title, onClose, children, logout = false }: {
  title: string; onClose: () => void; children: ReactNode; logout?: boolean
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialog.current?.showModal()
    return () => { dialog.current?.close(); previous?.focus() }
  }, [])
  return <dialog ref={dialog} className={`settings-modal ${logout ? 'settings-logout-modal' : ''}`} aria-label={title}
    onCancel={event => { event.preventDefault(); close.current() }}
    onClick={event => { if (event.target === event.currentTarget) close.current() }}>
    <button className="settings-modal-close" aria-label="关闭弹窗" onClick={onClose}><img src="/figma/settings/close.svg" alt="" /></button>
    {logout && <div className="settings-warning-icon"><img src="/figma/settings/warning.svg" alt="" /></div>}
    <h2>{title}</h2>{children}
  </dialog>
}
