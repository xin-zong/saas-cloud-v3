import {useEffect,useRef,useState} from 'react'
import {MapPin,X} from 'lucide-react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import {locationCoordinates,locationDegrees} from '@/data/stationLocation'
import './station-location-details.css'

type Props={name:string;address:string|null|undefined;longitude:unknown;latitude:unknown;region?:string|null}
export default function StationLocationDetails(props:Props){
 const [open,setOpen]=useState(false),[failed,setFailed]=useState(false)
 const dialog=useRef<HTMLDialogElement>(null),canvas=useRef<HTMLDivElement>(null)
 const position=locationCoordinates(props.longitude,props.latitude)
 useEffect(()=>{
  if(!open)return
  dialog.current?.showModal();setFailed(false)
  if(!canvas.current||!position)return
  const map=L.map(canvas.current,{center:[position.lat,position.lng],zoom:14,zoomControl:false})
  L.control.zoom({position:'bottomright',zoomInTitle:'放大地图',zoomOutTitle:'缩小地图'}).addTo(map)
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>'}).on('tileerror',()=>setFailed(true)).addTo(map)
  L.marker([position.lat,position.lng],{icon:L.divIcon({className:'station-location-pin',html:'<span></span>',iconSize:[28,36],iconAnchor:[14,36]}),title:props.name,keyboard:true}).addTo(map)
  map.invalidateSize()
  return()=>{map.remove()}
 },[open,props.longitude,props.latitude,props.name])
 const close=()=>{dialog.current?.close();setOpen(false)}
 return <><button type="button" className="sdp-address-link" aria-label={`查看${props.name}地址位置`} onClick={()=>setOpen(true)}><span>{props.address||'暂无地址'}</span><MapPin size={18}/></button>
  {open&&<dialog ref={dialog} className="station-location-dialog" aria-label={`${props.name}地址位置`} onCancel={close} onClick={e=>{if(e.target===dialog.current)close()}}>
   <header><h2>{props.name}</h2><button type="button" onClick={close} aria-label="关闭地址位置"><X size={20}/></button></header>
   {position?<div ref={canvas} className="station-location-map" aria-label="场站位置地图"/>:<div className="station-location-map station-location-empty">暂无有效经纬度，无法定位场站</div>}
   {failed&&<p role="status" className="station-location-note">地图底图暂不可用；定位标记及下方坐标来自场站档案。</p>}
   <dl><dt>地址：</dt><dd>{props.address||'—'}</dd><dt>经纬度</dt><dd>{position?`经度：${locationDegrees(position.lng)}　纬度：${locationDegrees(position.lat)}`:'暂无经纬度'}</dd><dt>行政区域：</dt><dd>{props.region||'暂无行政区域'}</dd></dl>
  </dialog>}
 </>
}
