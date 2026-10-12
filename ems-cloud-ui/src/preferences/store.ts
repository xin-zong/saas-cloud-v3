import { DEFAULT_PREFERENCES, normalizePreferences } from './model'
let preferences=DEFAULT_PREFERENCES
const listeners=new Set<()=>void>()
export const getPreferences=()=>preferences
export function applyPreferences(values: Record<string,unknown>){
  const next=normalizePreferences(values)
  if(JSON.stringify(next)===JSON.stringify(preferences))return
  preferences=next;listeners.forEach(fn=>fn())
}
export function subscribePreferences(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn)}}
