import { getToken } from '@/api/client'

export class AgentApiError extends Error {
 constructor(message,status,detail){super(message);this.name='AgentApiError';this.status=status;this.detail=detail}
}
function authHeaders(){const token=getToken();return token?{Authorization:`Bearer ${token}`}:{}}
async function response(path,options={}){
 const result=await fetch('/ems-agent-api'+path,{...options,headers:{...authHeaders(),...options.headers}})
 if(!result.ok){let data;try{data=await result.json()}catch{data={}}throw new AgentApiError(data.detail||'Agent 接口请求失败',result.status)}
 return result
}
export async function agentRequest(path,options={}){return (await response(path,options)).json()}
export function chatPayload(payload={}){
 return {message:payload.message,conversation_id:payload.conversation_id??null,agent_mode:payload.agent_mode==='thinking'?'thinking':'simple',dry_run:true,site_scope:payload.site_scope??[],time_range:payload.time_range??null,attachment_ids:payload.attachment_ids??[],response_language:payload.user_context?.locale==='en'?'en':'zh-CN'}
}
export async function streamChatMessage(payload,onEvent,options={}){
 const result=await response('/v1/chat/stream',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(chatPayload(payload)),signal:options.signal})
 if(!result.body)throw new AgentApiError('Agent 未返回响应流',502)
 const reader=result.body.getReader(),decoder=new TextDecoder();let pending=''
 const consume=text=>{pending+=text;const lines=pending.split('\n');pending=lines.pop()??'';for(const line of lines)if(line.trim())onEvent(JSON.parse(line))}
 try{while(true){const {done,value}=await reader.read();if(done)break;consume(decoder.decode(value,{stream:true}))}consume(decoder.decode());if(pending.trim())onEvent(JSON.parse(pending))}finally{reader.releaseLock()}
}
export async function uploadAttachment(file){const form=new FormData();form.append('file',file,file.name);return agentRequest('/v1/attachments',{method:'POST',body:form})}
