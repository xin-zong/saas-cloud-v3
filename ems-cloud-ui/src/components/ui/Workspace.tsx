import type {
  ButtonHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react"
import { ChevronDown } from "lucide-react"

export function Button({
  variant = "default",
  iconOnly = false,
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "ghost"
  iconOnly?: boolean
}) {
  return (
    <button
      type={type}
      className={`ui-button ui-button--${variant}${
        iconOnly ? " ui-button--icon" : ""
      } ${className}`}
      {...props}
    />
  )
}
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: ReactNode
  actions?: ReactNode
}) {
  return (
    <header className="ui-page-header">
      <div className="ui-page-heading">
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="ui-page-actions">{actions}</div>}
    </header>
  )
}
export function Badge({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info"
  children: ReactNode
}) {
  return <span className={`ui-badge ui-badge--${tone}`}>{children}</span>
}
export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`ui-select-wrap ${className}`}>
      <select className="ui-select" {...props}>
        {children}
      </select>
      <ChevronDown size={16} aria-hidden="true" />
    </span>
  )
}
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      className="ui-switch"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
    >
      <span className="ui-switch-track">
        <i />
      </span>
    </button>
  )
}
