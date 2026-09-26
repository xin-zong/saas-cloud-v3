import { useEffect, useRef } from "react"

export default function PlatformLeaveDialog({ onDecide }: { onDecide: (allow: boolean) => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>("button")?.focus()
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); onDecide(false) }
      if (event.key === "Tab") {
        const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])
        if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons.at(-1)?.focus() }
        else if (!event.shiftKey && document.activeElement === buttons.at(-1)) { event.preventDefault(); buttons[0]?.focus() }
      }
    }
    document.addEventListener("keydown", key, true)
    return () => { document.removeEventListener("keydown", key, true); previous?.focus() }
  }, [onDecide])
  return <div className="orgv2-overlay member-workflow-leave"><div ref={ref} className="orgv2-modal platform-leave-dialog" role="dialog" aria-modal="true" aria-label="未保存的修改"><h2>有未保存的修改</h2><p>离开将放弃本次修改，恢复上次保存的内容。</p><div className="orgv2-modal-footer"><button className="orgv2-outline" onClick={() => onDecide(false)}>继续编辑</button><button className="orgv2-primary" onClick={() => onDecide(true)}>放弃修改</button></div></div></div>
}
