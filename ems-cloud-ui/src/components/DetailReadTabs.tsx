import {useEffect,useRef,useState,type ReactNode} from 'react'
import {CAPABILITIES_CHANGED,getSessionVersion} from '@/api/client'

/** Owned by the open detail only. Never retain editors, polling views or controls here. */
export function RetainedReadTab({active,children}:{active:boolean;children:ReactNode}){
 const [visited,setVisited]=useState(active),container=useRef<HTMLDivElement>(null)
 if(active&&!visited)setVisited(true)
 useEffect(()=>{if(!active)container.current?.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(dialog=>dialog.close())},[active])
 return visited||active?<div ref={container} hidden={!active} inert={!active}>{children}</div>:null
}

/** Drop retained results immediately on capability/session invalidation, even before user refresh completes. */
export function useDetailEpoch(){
 const [epoch,setEpoch]=useState(0)
 useEffect(()=>{const invalidate=()=>setEpoch(value=>value+1);window.addEventListener(CAPABILITIES_CHANGED,invalidate);window.addEventListener('enerlution:unauthorized',invalidate);return()=>{window.removeEventListener(CAPABILITIES_CHANGED,invalidate);window.removeEventListener('enerlution:unauthorized',invalidate)}},[])
 return `${getSessionVersion()}:${epoch}`
}
