import { jsx as reactJsx, jsxs as reactJsxs, Fragment } from 'react/jsx-runtime'
import { useSyncExternalStore, type ElementType, type ReactNode, type Key } from 'react'
import { getPreferences,subscribePreferences } from '@/preferences/store'
import { useInterfaceTranslation } from './useInterfaceTranslation'
import { containsChinese } from './machine'
export { Fragment }
type Props=Record<string,unknown>&{children?:ReactNode}
function MotionChart({component,original}:{component:ElementType;original:Props}){
  const {chartAnimation,language}=useSyncExternalStore(subscribePreferences,getPreferences,getPreferences)
  const nameValue=original.name??original.dataKey
  const fields=['name','region','label','status']
  const rows=Array.isArray(original.data)?original.data as Record<string,unknown>[]:[]
  const texts=[...(typeof nameValue==='string'?[nameValue]:[]),...rows.flatMap(row=>fields.flatMap(field=>typeof row?.[field]==='string'?[row[field] as string]:[]))]
  const translate=useInterfaceTranslation(texts,language)
  const name=typeof nameValue==='string'?translate(nameValue):original.name
  const hasChinese=rows.some(row=>fields.some(field=>typeof row?.[field]==='string'&&containsChinese(row[field] as string)))
  const data=hasChinese?rows.map(row=>({...row,...Object.fromEntries(fields.filter(field=>typeof row?.[field]==='string').map(field=>[field,translate(row[field] as string)]))})):original.data
  const series=!(component as {displayName?:string}).displayName?.endsWith('Chart')
  return reactJsx(component,{...original,...(data?{data}:{}),...(series?{name,isAnimationActive:original.isAnimationActive!==false&&chartAnimation!=='关闭',animationDuration:chartAnimation==='简化'?150:original.animationDuration??1000}:{})})
}
function LocalizedElement({tag,original,renderElement}:{tag:keyof React.JSX.IntrinsicElements;original:Props;renderElement:typeof reactJsx}){
  const {language}=useSyncExternalStore(subscribePreferences,getPreferences,getPreferences)
  const props={...original}
  const excluded=props.translate==='no'||['pre','code','script','style'].includes(tag)
  const initialOf=typeof props['data-i18n-initial']==='string'?props['data-i18n-initial'] as string:null
  const strings=(child:ReactNode):string[]=>typeof child==='string'?[child]:Array.isArray(child)?child.flatMap(strings):[]
  const texts=excluded?[]:[...(initialOf?[initialOf]:tag==='textarea'?[]:strings(props.children)),...['title','placeholder','aria-label','alt'].flatMap(key=>typeof props[key]==='string'?[props[key] as string]:[])]
  const translate=useInterfaceTranslation(texts,language)
  if(excluded)return renderElement(tag,props)
  const render=(child:ReactNode):ReactNode=>typeof child==='string'?translate(child):Array.isArray(child)?child.map(render):child
  if(tag!=='textarea')props.children=render(props.children)
  if(initialOf){props.children=translate(initialOf).trim().slice(0,1).toUpperCase();delete props['data-i18n-initial']}
  for(const key of ['title','placeholder','aria-label','alt'])if(typeof props[key]==='string')props[key]=translate(props[key] as string)
  // Native option labels otherwise become their submitted value after translation.
  if(tag==='option'&&props.value===undefined){
    if(typeof original.children==='string')props.value=original.children
    else if(Array.isArray(original.children)&&original.children.every(c=>typeof c==='string'||typeof c==='number'))props.value=original.children.join('')
  }
  return renderElement(tag,props)
}
function wrap(factory:typeof reactJsx,type:ElementType,props:Props,key?:Key){
  if(typeof type!=='string'&&['Line','Area','Bar','Pie','Radar','RadialBar','Scatter','Funnel','LineChart','AreaChart','BarChart','PieChart','RadarChart','ComposedChart'].includes((type as {displayName?:string}).displayName??''))return reactJsx(MotionChart,{component:type,original:props},key)
  if(typeof type==='string'&&props.translate!=='no'&&(typeof props.children==='string'||Array.isArray(props.children)||['title','placeholder','aria-label','alt'].some(k=>typeof props[k]==='string')))
    return reactJsx(LocalizedElement,{tag:type,original:props,renderElement:factory},key)
  return factory(type,props,key)
}
export const jsx:typeof reactJsx=(type,props,key)=>wrap(reactJsx,type,(props??{}) as Props,key)
export const jsxs:typeof reactJsxs=(type,props,key)=>wrap(reactJsxs,type,(props??{}) as Props,key)
