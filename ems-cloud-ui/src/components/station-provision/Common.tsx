import { cloneElement, isValidElement, useEffect, useRef, type ReactNode } from "react"
import { Button } from "../ui/Workspace"
export function Asset({ name }: { name: string }) {
  return (
    <img
      className="station-design-asset"
      src={`/figma/station-entry/${name}.svg`}
      alt=""
      draggable={false}
    />
  )
}
export function Modal({
  title,
  children,
  onClose,
  actions,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  actions?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    const prior = document.activeElement as HTMLElement | null
    const el = ref.current
    el?.focus()
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current()
      if (e.key === "Tab") {
        const items = el?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]',
        )
        if (!items?.length) return
        const first = items[0],
          last = items[items.length - 1]
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === el)
        ) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener("keydown", listener)
    return () => {
      document.removeEventListener("keydown", listener)
      prior?.focus()
    }
  }, [])
  return (
    <div className="station-modal-backdrop">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="station-modal"
      >
        <Button
          className="station-modal-close"
          aria-label="关闭弹窗"
          onClick={onClose}
        >
          ×
        </Button>
        <h2>{title}</h2>
        {children}
        <footer>{actions}</footer>
      </div>
    </div>
  )
}
export function Field({
  label,
  children,
  wide = false,
}: {
  label: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <label className={`station-field ${wide ? "station-field-wide" : ""}`}>
      <span>{label}</span>
      {isValidElement<{ 'aria-label'?: string }>(children) && typeof children.type === 'string' && ['input', 'select', 'textarea'].includes(children.type)
        ? cloneElement(children, { 'aria-label': children.props['aria-label'] || label })
        : children}
    </label>
  )
}
export function EntryTabs({
  active = "列表查询",
  onChange,
}: {
  active?: string
  onChange: (value: string) => void
}) {
  return (
    <nav className="station-entry-tabs" aria-label="站点查询方式">
      {["列表查询", "地图查询", "收藏站点", "智能规则"].map((tab) => (
        <button
          type="button"
          key={tab}
          aria-current={active === tab ? "page" : undefined}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </nav>
  )
}
