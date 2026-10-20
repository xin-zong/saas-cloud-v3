type CapabilitySubscription={baseUrl:string;token:string;onInvalidate:()=>void;onUnauthorized:()=>void}
/** One transport per API origin across tabs. The channel carries no session or capability data. */
export function subscribeCapabilityEvents({baseUrl,token,onInvalidate,onUnauthorized}:CapabilitySubscription):()=>void{
 if(typeof navigator==='undefined'||!navigator.locks||typeof BroadcastChannel==='undefined')return ()=>{}
 const controller=new AbortController(),name=`enerlution:capability-events:${baseUrl}`
 let channel:BroadcastChannel
 try{channel=new BroadcastChannel(name)}catch{return ()=>{}}
 let retry:ReturnType<typeof setTimeout>|undefined,reader:ReadableStreamDefaultReader<Uint8Array>|undefined,release:()=>void=()=>{}
 const stop=()=>{if(controller.signal.aborted)return;controller.abort();if(retry)clearTimeout(retry);void reader?.cancel().catch(()=>{});channel.close();release()}
 channel.onmessage=event=>{if(!controller.signal.aborted&&event.data?.type==='invalidate')onInvalidate()}
 const invalidate=()=>{if(controller.signal.aborted)return;onInvalidate();channel.postMessage({type:'invalidate'})}
 const connect=async()=>{
  try{
   const response=await fetch(`${baseUrl}/me/capabilities/events`,{headers:{Authorization:`Bearer ${token}`},signal:controller.signal})
   if(controller.signal.aborted)return
   if(response.status===401){stop();onUnauthorized();return}
   if(!response.ok||!response.body)throw new Error('Notification disconnected')
   reader=response.body.getReader();const decoder=new TextDecoder();let buffer=''
   while(!controller.signal.aborted){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const events=buffer.split(/\r?\n\r?\n/);buffer=events.pop()??'';for(const event of events)if(/event:\s*(ready|capabilities-changed)/.test(event))invalidate()}
  }catch{ /* Focus and periodic auth checks remain available while disconnected. */ }
  finally{void reader?.cancel().catch(()=>{});reader=undefined}
  if(!controller.signal.aborted)retry=setTimeout(connect,5000)
 }
 try{void navigator.locks.request(name,{signal:controller.signal},async()=>{
  if(controller.signal.aborted)return
  await new Promise<void>(done=>{release=done;void connect()})
 }).catch(stop)}catch{stop()}
 return stop
}
