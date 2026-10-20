export type VerifiedApplicationIdentity={email:string;context:string}
/** Component-local gate; starts synchronously before React can render a disabled button. */
export class PublicRequestGate {
 private pending=false
 async run(work:()=>Promise<void>):Promise<void>{if(this.pending)return;this.pending=true;try{await work()}finally{this.pending=false}}
}
export function progressGuidance(row:{status?:string;nextAction?:string}):string{
 switch(row.nextAction){
  case 'await_review':return '申请正在等待平台审核。'
  case 'reapply':return '请按拒绝原因补充资料后重新申请。'
  case 'wait_for_email':return '审批已通过，激活邮件正在排队投递，请稍后查收。'
  case 'check_activation_email':return '邮件服务器已接收，请查看收件箱或垃圾邮件，并使用一次性激活链接设置密码。'
  case 'contact_administrator':return '激活或投递状态异常，请联系平台管理员处理。'
  case 'sign_in':return '账号已激活，可以返回登录。'
 }
 return row.status==='rejected'?'请按拒绝原因补充资料后重新申请。':row.status==='approved'?'审批已通过。请查收激活邮件；如未收到或链接已失效，请联系平台管理员。':'申请正在等待平台审核。'
}
