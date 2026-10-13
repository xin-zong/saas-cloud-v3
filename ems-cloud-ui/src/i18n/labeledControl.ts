import { cloneElement, isValidElement, type ReactNode } from 'react'

/** Retain control labels when the JSX runtime wraps a native element for translation. */
export function labeledControl(child: ReactNode, label: string): ReactNode {
  if (!isValidElement<Record<string, any>>(child)) return child
  const controls = ['input', 'select', 'textarea']
  if (typeof child.type === 'string' && controls.includes(child.type)) {
    return cloneElement(child, { 'aria-label': child.props['aria-label'] || label })
  }
  if (controls.includes(child.props.tag) && child.props.original) {
    return cloneElement(child, {
      original: { ...child.props.original, 'aria-label': child.props.original['aria-label'] || label },
    })
  }
  return child
}
