import {useRef} from 'react'
const example='/examples/station-storage-example.webp'
export default function StationProfileImage({imageUrl,name}:{imageUrl?:string|null;name:string}){
 const preview=useRef<HTMLDialogElement>(null),sample=!imageUrl,src=imageUrl||example,alt=sample?'储能电站示例图片（非当前场站实景）':`${name}场站图片`
 return <div className="sdp-image"><button type="button" className="sdp-image-preview-trigger" aria-label="预览场站图片" onClick={()=>preview.current?.showModal()}><img src={src} alt={alt}/>{sample&&<span className="sdp-image-example-label">示例图片</span>}</button><dialog ref={preview} className="sdp-image-preview" aria-label="场站图片预览" onClick={event=>{if(event.target===event.currentTarget)preview.current?.close()}}><header><h3>{sample?'储能电站示例图片':`${name}场站图片`}</h3><button type="button" aria-label="关闭图片预览" onClick={()=>preview.current?.close()}>×</button></header><figure><img src={src} alt={alt}/>{sample&&<figcaption>示例图片 · 非当前场站实景 <a href="https://www.olipowerenergy.com/uploads/images/backup-energy-storage.webp" target="_blank" rel="noreferrer">图片来源：Olipower</a></figcaption>}</figure></dialog></div>
}
