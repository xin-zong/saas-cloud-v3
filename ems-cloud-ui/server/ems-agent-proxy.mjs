import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const privateFile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../.local-tools/implementation/ems-agent-service-private.json')
function readConfig(){
 if(!fs.existsSync(privateFile))return null
 const config=JSON.parse(fs.readFileSync(privateFile,'utf8'))
 if(config.url!=='http://47.99.70.238:18080'||typeof config.apiKey!=='string'||!config.apiKey.trim())throw new Error('Invalid Agent private configuration')
 return config
}
function fail(code,message){throw Object.assign(new Error(message),{code})}
async function readBody(req,limit){
 const chunks=[];let size=0
 for await(const chunk of req){size+=chunk.length;if(size>limit)fail(413,'请求内容过大');chunks.push(chunk)}
 return Buffer.concat(chunks)
}
export function createAgentProxy({fetchImpl=fetch,config=readConfig}={}){
 const conversations=new Map(),attachments=new Map(),busy=new Set()
 return async(req,res,next)=>{
  const pathname=new URL(req.url,'http://localhost').pathname
  if(!pathname.startsWith('/ems-agent-api/'))return next()
  const route=pathname.slice('/ems-agent-api'.length)
  const attachment=/^\/v1\/attachments\/([a-zA-Z0-9_-]{1,160})$/.exec(route)
  const isRead=req.method==='GET'&&['/v1/health','/v1/tools','/v1/rag/health'].includes(route)
  const isChat=req.method==='POST'&&['/v1/chat','/v1/chat/stream'].includes(route)
  const isUpload=req.method==='POST'&&route==='/v1/attachments'
  let activeIdentity=null
  const abort=new AbortController()
  res.on('close',()=>{if(!res.writableEnded)abort.abort()})
  function json(code,data){res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data))}
  try{
   if(!isRead&&!isChat&&!isUpload&&!(attachment&&['GET','DELETE'].includes(req.method)))fail(404,'接口不存在')
   if(req.headers.origin&&!/^http:\/\/(127\.0\.0\.1|localhost):8444$/.test(req.headers.origin))fail(403,'不允许的请求来源')
   const authorization=req.headers.authorization
   if(!/^Bearer [^\s]+$/.test(authorization??''))fail(401,'请先登录当前系统')
   const authResponse=await fetchImpl('http://127.0.0.1:18091/api/auth/me',{headers:{Authorization:authorization},signal:AbortSignal.timeout(10000)})
   if(!authResponse.ok)fail(authResponse.status===401?401:403,'当前登录或权限校验失败')
   const authEnvelope=await authResponse.json()
   if(![0,200].includes(authEnvelope.code)||!authEnvelope.data?.id)fail(401,'当前登录已失效')
   const user=authEnvelope.data,identity=`${user.tenant?.tenantId??'local'}:${user.id}`
   const scopes=Object.entries(user.stationPermissions??{}).filter(([,codes])=>Array.isArray(codes)&&codes.includes('asset.read')).map(([id])=>id)
   if(!scopes.length)fail(403,'当前账户没有可供助手访问的场站')
   const privateConfig=config()
   if(!privateConfig)fail(503,'原 Agent 接口尚未配置')
   let body,contentType
   if(isChat){
    let payload;try{payload=JSON.parse((await readBody(req,128*1024)).toString('utf8'))}catch(error){if(error.code)throw error;fail(400,'请求格式错误')}
    if(typeof payload.message!=='string'||!payload.message.trim()||payload.message.length>24000)fail(400,'请输入有效消息')
    if(payload.site_scope!==undefined&&!Array.isArray(payload.site_scope))fail(400,'场站范围格式错误')
    const scope=payload.site_scope?.length?[...new Set(payload.site_scope.map(String))]:scopes
    if(scope.some(id=>!scopes.includes(id)))fail(403,'无权访问所选场站')
    if(payload.conversation_id&&conversations.get(payload.conversation_id)!==identity)fail(403,'会话不属于当前用户，或本地服务已重启，请新建会话')
    if(payload.attachment_ids!==undefined&&!Array.isArray(payload.attachment_ids))fail(400,'附件格式错误')
    if((payload.attachment_ids??[]).some(id=>attachments.get(id)!==identity))fail(403,'无权使用该附件，请重新上传')
    if(busy.has(identity))fail(429,'已有消息正在处理')
    busy.add(identity);activeIdentity=identity
    body=JSON.stringify({message:payload.message,conversation_id:payload.conversation_id??null,agent_mode:payload.agent_mode==='thinking'?'thinking':'simple',dry_run:true,site_scope:scope,time_range:payload.time_range??null,attachment_ids:payload.attachment_ids??[],response_language:payload.response_language==='en'?'en':'zh-CN',user_context:{user_id:identity,permissions:['asset.read'],read_only:true}})
    contentType='application/json'
   }else if(isUpload){
    if(!/^multipart\/form-data; boundary=/.test(req.headers['content-type']??''))fail(400,'附件格式错误')
    body=await readBody(req,21*1024*1024);contentType=req.headers['content-type']
   }else if(attachment&&attachments.get(attachment[1])!==identity)fail(403,'无权访问该附件')
   const headers={'X-API-Key':privateConfig.apiKey,...(contentType?{'Content-Type':contentType}:{})}
   const response=await fetchImpl(privateConfig.url+route,{method:req.method,headers,body,signal:AbortSignal.any([abort.signal,AbortSignal.timeout(isChat?180000:30000)])})
   if(!response.ok){if(response.body)await response.body.cancel();fail(response.status===401?502:response.status,'原 Agent 接口请求失败'+(response.status===401?'：鉴权失败':''))}
   if(route==='/v1/chat/stream'){
    res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Accel-Buffering':'no'})
    const decoder=new TextDecoder();let pending='',size=0
    for await(const chunk of response.body){
     size+=chunk.length;if(size>16*1024*1024)fail(502,'Agent 回复过大')
     pending+=decoder.decode(chunk,{stream:true})
     const lines=pending.split('\n');pending=lines.pop()??''
     for(const line of lines){if(!line.trim())continue;const event=JSON.parse(line);const id=event.conversation_id??event.response?.conversation_id;if(typeof id==='string')conversations.set(id,identity);res.write(line+'\n')}
    }
    pending+=decoder.decode();if(pending.trim()){const event=JSON.parse(pending);const id=event.conversation_id??event.response?.conversation_id;if(typeof id==='string')conversations.set(id,identity);res.write(pending+'\n')}
    res.end()
   }else{
    const data=await response.json()
    if(isChat&&typeof data.conversation_id==='string')conversations.set(data.conversation_id,identity)
    if(isUpload){const id=data.attachment_id??data.id;if(typeof id==='string')attachments.set(id,identity)}
    if(attachment&&req.method==='DELETE')attachments.delete(attachment[1])
    json(200,data)
   }
  }catch(error){
   if(res.headersSent){if(!res.writableEnded)res.end(JSON.stringify({type:'error',message:'Agent 响应中断，请重试'})+'\n')}
   else if(!res.destroyed){const code=Number.isInteger(error.code)&&error.code>=400&&error.code<=599?error.code:502;json(code,{detail:code===error.code?error.message:'无法连接原 Agent 接口，请稍后重试'})}
  }finally{if(activeIdentity)busy.delete(activeIdentity)}
 }
}
export default function emsAgentLocalProxy(){return{name:'ems-agent-local-authenticated-proxy',apply:'serve',configureServer(server){server.middlewares.use(createAgentProxy())}}}
