import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { api, DEMO_MODE } from '@/api/client'
import { applyPreferences, getPreferences, subscribePreferences } from './store'
import './display.css'
import { machineTranslator } from '@/i18n/machine'
export function useDisplayPreferences(){return useSyncExternalStore(subscribePreferences,getPreferences,getPreferences)}
export default function PreferencesProvider({children}:{children:ReactNode}){
  const {user}=useAuth()
  const preferences=useDisplayPreferences()
  useEffect(()=>{machineTranslator.configure(`${DEMO_MODE?'demo':'api'}:${user?.id??'guest'}`,!!user&&preferences.language==='English')},[user?.id,preferences.language])
  useEffect(()=>{
    applyPreferences({})
    if(!user)return
    const key=`enerlution:settings:${DEMO_MODE?'demo':'api'}:${user.id}`
    const controller=new AbortController()
    const initial=getPreferences()
    if(DEMO_MODE){try{const data=JSON.parse(localStorage.getItem(key)??'{}');applyPreferences(data.settings??data)}catch{/* defaults */}}
    else api<Record<string,string>>('/settings',{signal:controller.signal}).then(values=>{if(!controller.signal.aborted&&getPreferences()===initial)applyPreferences(values)}).catch(()=>{/* Keep safe defaults until settings can be read. */})
    return()=>controller.abort()
  },[user?.id])
  useEffect(()=>{
    const root=document.documentElement
    root.lang=preferences.language==='English'?'en':'zh-CN'
    root.dataset.theme=preferences.theme==='跟随系统'?'system':'light'
    root.dataset.density=preferences.density==='紧凑'?'compact':'comfortable'
    root.dataset.motion=preferences.chartAnimation==='开启'?'full':preferences.chartAnimation==='简化'?'reduced':'off'
    root.dataset.contrast=preferences.highContrast?'high':'normal'
    root.dataset.timezone=preferences.timezone
  },[preferences])
  return children
}
