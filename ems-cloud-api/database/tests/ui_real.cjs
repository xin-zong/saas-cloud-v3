const {createRequire}=require('node:module');
const path=require('node:path');
const requireUi=createRequire(path.resolve(__dirname,'../../../ems-cloud-ui/package.json'));
const {chromium}=requireUi('playwright');
(async()=>{
 const browser=await chromium.launch({channel:'msedge',headless:true});
 const page=await browser.newPage({viewport:{width:1500,height:1100},acceptDownloads:true});
 const errors=[]; page.on('pageerror',error=>errors.push(error.message));
 try{
  await page.goto('http://127.0.0.1:8443');
  await page.getByLabel('登录账号',{exact:true}).fill('owner@prototype.local');
  await page.getByLabel('密码',{exact:true}).fill(process.env.EMS_TEST_PASSWORD);
  await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByText('原型验证储能电站一',{exact:true}).first().waitFor({timeout:30000});
  await page.getByRole('button',{name:'分析与报告',exact:true}).click();
  await page.getByRole('button',{name:'查询历史',exact:true}).click();
  await page.getByText('所选时间段没有采样数据。',{exact:true}).waitFor({timeout:30000});
  await page.getByRole('tab',{name:'报告中心',exact:true}).click();
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'下载 CSV 报告',exact:true}).click();
  const report=await downloaded;if(await report.failure())throw Error('Report download failed');
  await page.getByRole('button',{name:'平台管理',exact:true}).click();
  await page.getByRole('heading',{name:'客户管理',exact:true}).waitFor({timeout:30000});
  await page.getByRole('button',{name:'资产与站点',exact:true}).click();
  await page.getByText('原型验证储能电站一',{exact:true}).first().click();
  await page.getByRole('button',{name:'一次接线图',exact:true}).click();
  await page.getByRole('img',{name:'已登记设备连接图'}).waitFor();
  await page.screenshot({path:path.resolve(__dirname,'../../../.local-tools/real-topology.png'),fullPage:true});
  if(await page.getByText('原型验证储能电站二',{exact:true}).count())throw Error('Unauthorized station rendered');
  await page.reload();
  await page.getByText('原型验证储能电站一',{exact:true}).first().waitFor({timeout:30000});
  if(errors.length)throw Error('Browser runtime error: '+errors.join(';'));
  await page.screenshot({path:path.resolve(__dirname,'../../../.local-tools/real-ui.png'),fullPage:true});
  console.log('PASS: real browser login, authorized remote station loading, history query, report download, customer page and session restore, no browser runtime errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error.message);process.exit(1)});
