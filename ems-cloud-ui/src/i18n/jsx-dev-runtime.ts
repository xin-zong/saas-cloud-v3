export { Fragment } from 'react/jsx-runtime'
import type { ElementType,Key } from 'react'
import { jsx,jsxs } from './jsx-runtime'
export function jsxDEV(type:ElementType,props:unknown,key:Key|undefined,isStaticChildren:boolean){
  return isStaticChildren?jsxs(type,props,key):jsx(type,props,key)
}
