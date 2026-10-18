const {test}=require('node:test'),assert=require('node:assert/strict'),{chromium}=require('playwright');
test('live analysis retains last known source evidence outside plot window without plotting stale values',{timeout:90000},async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(15000);page.setDefaultNavigationTimeout(60000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route(/fonts\.googleapis\.com|fonts\.gstatic\.com|static\.figma\.com/,route=>route.abort());
 await page.route('**/src/auth/AuthContext.tsx*',route=>route.fulfill({contentType:'text/javascript',body:'export function useAuth(){return {user:{id:"7",stationPermissions:{"12":["telemetry.read"]}}}}'}));
 await page.route('**/src/api/stationRealtime.ts*',route=>route.fulfill({contentType:'text/javascript',body:`export async function subscribeStationTelemetry(station,ids,callbacks,signal){callbacks.onSnapshot({serverTime:Date.now(),items:[{pointId:'88',sourceType:'stored_device',sourceTime:1000,receivedAt:2000,value:'0',valueType:'number',quality:'valid',staleReason:'source_older_than_90_seconds'}]});callbacks.onStatus?.('connected');await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}))}`}));
 await page.route('**/src/main.tsx*',async route=>{const source=await(await route.fetch()).text(),react=source.match(/["']([^"']*\/react\.js\?v=[^"']+)["']/)?.[1],dom=source.match(/["']([^"']*\/react-dom_client\.js\?v=[^"']+)["']/)?.[1];assert.ok(react&&dom);await route.fulfill({contentType:'text/javascript',body:`import React from '${react}';import ReactDOM from '${dom}';import Component from '/src/components/StationAnalysisPage.tsx';import '/src/index.css';ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Component,{station:{id:'12',name:'统一测点测试',code:'T'},initialMetric:'soc'}));`})});
 await page.route(url=>url.pathname.startsWith('/api/'),route=>route.fulfill({headers:{'access-control-allow-origin':'*'},json:{code:0,data:[{id:88,device_id:9,device_name:'Battery Stack',name:'SOC',unit:'%',source:'ems',sourceType:'stored_device',namespace:'device',semanticKey:'soc',valueType:'number',supportedAggregations:['last']}]}}));
 await page.goto(process.env.API_PREVIEW_URL||'http://127.0.0.1:8444',{waitUntil:'domcontentloaded'});
 const channels=page.getByRole('region',{name:'监测通道',exact:true});await channels.getByText('1970-01-01T00:00:01.000Z',{exact:true}).waitFor();
 const row=channels.locator('tbody tr').first();assert.equal(await row.locator('td').nth(1).innerText(),'0');assert.match(await row.innerText(),/最后采样.*已过期/);
 assert.equal(await page.locator('.analysis-chart .recharts-line-curve').count(),0);assert.match(await channels.innerText(),/0\/1 有效/);assert.deepEqual(errors,[]);
 }finally{await browser.close()}
});
