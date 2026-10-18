import {useEffect,useRef,useState} from 'react'
import {coordinateToDms,dmsToCoordinate,type CoordinateDms} from '@/data/referenceLifecycle'
export default function ReferenceCoordinateInput({label,value,max,error,disabled,onChange}:{label:string;value:string|number;max:number;error?:string;disabled?:boolean;onChange:(value:string|number)=>void}){
 const [parts,setParts]=useState(()=>coordinateToDms(value)),[invalid,setInvalid]=useState(false),lastReported=useRef(value)
 useEffect(()=>{if(Object.is(value,lastReported.current))return;setParts(coordinateToDms(value));setInvalid(false);lastReported.current=value},[value])
 const change=(key:keyof CoordinateDms,text:string)=>{const next={...parts,[key]:text};setParts(next);const decimal=dmsToCoordinate(next,max);setInvalid(decimal===null);lastReported.current=decimal??'';onChange(decimal??'')}
 return <div className="ref-coordinate"><div className="ref-coordinate-inputs"><span>{label}：</span>{(['degrees','minutes','seconds'] as const).map((key,i)=><label key={key}><input aria-label={`${label}${['度','分','秒'][i]}`} inputMode={i===2?'decimal':'numeric'} value={parts[key]} disabled={disabled} aria-invalid={invalid||!!error} onChange={e=>change(key,e.target.value)}/><span>{['°','′','″'][i]}</span></label>)}</div>{(invalid||error)&&<small role="alert">{error||`度须为整数，分秒须小于60，${label}范围 -${max}° 至 ${max}°`}</small>}</div>
}
