import { useEffect,useRef,useState } from 'react'
import type { Station } from '@/App'
import { useDisplayPreferences } from '@/preferences/PreferencesProvider'
import { mapRegionView,stationCoordinates } from '@/maps/regions'
import { useInterfaceTranslation } from '@/i18n/useInterfaceTranslation'
const colors:Record<string,string>={online:'#10b981',fault:'#ef4444',offline:'#76857f',building:'#1f7a68'}
const labels:Record<string,string>={online:'在线',fault:'故障',offline:'离线',building:'建设中'}
interface Props {stations:Station[];selectedStation:Station|null;onSelectStation:(s:Station,pos?:{x:number;y:number})=>void;region?:string;compact?:boolean}
export default function MapView({stations,selectedStation,onSelectStation,region='global',compact=false}:Props){
 const {language}=useDisplayPreferences()
 const translate=useInterfaceTranslation(stations.map(station=>station.name),language)
 const frame=useRef<HTMLIFrameElement>(null)
 const [status,setStatus]=useState<'loading'|'loaded'|'error'>('loading'),[retry,setRetry]=useState(0),[zoom,setZoom]=useState(4)
 const key=import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string|undefined
 const lastRegion=useRef(region)
 const current=useRef({stations,onSelectStation,region,compact,selectedStation});current.current={stations,onSelectStation,region,compact,selectedStation}
 const post=(type:string,data?:unknown)=>frame.current?.contentWindow?.postMessage({source:'ems-map-host',type,data},location.origin)
 const payload=()=>({stations:current.current.stations.flatMap(s=>{const position=stationCoordinates(s);return position?[{id:s.id,name:translate(s.name),position,color:colors[s.status]??colors.offline}]:[]}),compact:current.current.compact,defaultLocation:!current.current.selectedStation&&['global','europe'].includes(current.current.region)?language==='English'?'Europe · default location':'欧洲 · 默认位置':null})
 useEffect(()=>{
  setStatus('loading');lastRegion.current=current.current.region
  let timer:ReturnType<typeof setTimeout>
  const receive=(event:MessageEvent)=>{
   if(event.source!==frame.current?.contentWindow||event.origin!==location.origin||event.data?.source!=='ems-google-map')return
   if(event.data.type==='ready'){
    const view=mapRegionView(current.current.region,current.current.stations,true)
    post('initialize',{...payload(),view,key,language:language==='English'?'en':'zh-CN'})
   }
   if(event.data.type==='loaded'){clearTimeout(timer);setStatus('loaded');const p=current.current.selectedStation&&stationCoordinates(current.current.selectedStation);if(p)post('pan',p)}
   if(event.data.type==='error'){clearTimeout(timer);setStatus('error')}
   if(event.data.type==='zoom')setZoom(event.data.zoom)
   if(event.data.type==='select'){const s=current.current.stations.find(s=>s.id===event.data.id);if(s)current.current.onSelectStation(s)}
  }
  window.addEventListener('message',receive);timer=setTimeout(()=>setStatus('error'),20000)
  return()=>{clearTimeout(timer);window.removeEventListener('message',receive)}
 },[language,retry,key])
 useEffect(()=>{if(status==='loaded')post('update',payload())},[stations,compact,status,region,selectedStation,translate])
 useEffect(()=>{if(status!=='loaded'||lastRegion.current===region)return;lastRegion.current=region;post('view',mapRegionView(region,current.current.stations))},[region,status])
 useEffect(()=>{const p=selectedStation&&stationCoordinates(selectedStation);if(p&&status==='loaded')post('pan',p)},[selectedStation,status])
 useEffect(()=>{if(!frame.current)return;const observer=new ResizeObserver(()=>post('resize'));observer.observe(frame.current);return()=>observer.disconnect()},[])
 return <div className="map-green-base absolute inset-0" data-map-provider="google">
  {key&&<iframe ref={frame} key={`${language}-${retry}`} src="/google-map.html" title="Google Maps" onLoad={()=>post('handshake')} style={{position:'absolute',inset:0,width:'100%',height:compact?'100%':'calc(100% - 112px)',border:0}} />}
  {(!key||status!=='loaded')&&<div className="google-map-feedback" role="status"><span>{!key?'Google 地图未配置密钥':status==='error'?'Google 地图加载失败，请检查网络或密钥授权':'Google 地图加载中…'}</span>{key&&status==='error'&&<button onClick={()=>setRetry(n=>n+1)}>重新加载地图</button>}</div>}
  <div className="map-zoom-controls absolute flex flex-col rounded-lg overflow-hidden" style={{bottom:compact?30:164,right:16,zIndex:20,background:'white',border:'1px solid #d8e3dc'}}>{([1,-1] as const).map(dir=><button key={dir} aria-label={dir===1?'放大地图':'缩小地图'} disabled={status!=='loaded'||(dir===1?zoom>=18:zoom<=2)} onClick={()=>post('zoom',dir)} style={{width:30,height:30,color:'#24423b'}}>{dir===1?'+':'−'}</button>)}</div>
  {!compact&&<div className="map-status-legend absolute flex items-center gap-4 px-4 py-1.5 rounded-lg" style={{bottom:144,left:16,background:'rgba(255,255,255,.92)',border:'1px solid #d8e3dc',zIndex:20}}>{Object.entries(labels).map(([status,label])=><span key={status} className="flex items-center gap-1.5"><img src={`/figma/overview/map/${({online:'imgEllipse13',fault:'imgEllipse12',offline:'imgEllipse14',building:'imgEllipse15'} as Record<string,string>)[status]}.svg`} alt=""/>{label}</span>)}</div>}
 </div>
}
