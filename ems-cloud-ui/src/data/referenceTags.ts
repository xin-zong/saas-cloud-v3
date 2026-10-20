export function tagValidation(name:string,description:string,originalDescription?:string){
 if(!name.trim()||[...name.trim()].length>50)return '标签名称应为1–50个字符'
 if([...description].length>200&&description!==originalDescription)return '标签描述最多200个字符'
 return ''
}
export function tagPage<T extends {id:string;name:string}>(rows:T[],query:string,page:number,size:number,sort:'asc'|'desc'){
 const filtered=rows.filter(row=>row.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>(sort==='asc'?1:-1)*(a.name.localeCompare(b.name,'zh-CN',{numeric:true,sensitivity:'base'})||a.id.localeCompare(b.id)))
 const pages=Math.max(1,Math.ceil(filtered.length/size)),current=Math.max(1,Math.min(page,pages))
 return {items:filtered.slice((current-1)*size,current*size),total:filtered.length,page:current,pages}
}
