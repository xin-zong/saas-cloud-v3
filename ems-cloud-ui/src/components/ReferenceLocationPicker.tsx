import {useEffect,useRef,useState} from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
export default function ReferenceLocationPicker({longitude,latitude,onChange}:{longitude:string|number;latitude:string|number;onChange:(longitude:number,latitude:number)=>void}){
 const element=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),marker=useRef<L.CircleMarker|null>(null),callback=useRef(onChange);callback.current=onChange;const [failed,setFailed]=useState(false)
 useEffect(()=>{if(!element.current)return;const instance=L.map(element.current,{center:[35,107],zoom:3});map.current=instance;L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).on('tileerror',()=>setFailed(true)).addTo(instance);instance.on('click',(event:L.LeafletMouseEvent)=>callback.current(Number(event.latlng.lng.toFixed(6)),Number(event.latlng.lat.toFixed(6))));return()=>{instance.remove();map.current=null;marker.current=null}},[])
 useEffect(()=>{if(!map.current||String(longitude).trim()===''||String(latitude).trim()==='')return;const lng=Number(longitude),lat=Number(latitude);if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)return;if(marker.current)marker.current.setLatLng([lat,lng]);else marker.current=L.circleMarker([lat,lng],{radius:7,color:'#20a8aa',fillOpacity:.8}).addTo(map.current);map.current.panTo([lat,lng])},[longitude,latitude])
 return <div className="ref-lifecycle-map"><div ref={element}/><div className="map-note">{failed?'地图瓦片暂不可用，请手动填写经纬度。':'点击地图选择位置，或手动填写经纬度。'} 地址搜索服务尚未接入。</div></div>
}
