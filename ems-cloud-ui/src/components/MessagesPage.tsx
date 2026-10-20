import { Bell } from 'lucide-react'
import { Button } from './ui/Workspace'
import './messages.css'

/** Inbox delivery has no connected API yet. Never substitute alarms or fabricated messages. */
export default function MessagesPage({onNotificationSettings}:{onNotificationSettings:()=>void}) {
  return <section className="messages-page" aria-label="消息列表">
    <div className="messages-toolbar"><span>站内消息</span><Button onClick={onNotificationSettings}>通知设置</Button></div>
    <div className="messages-table"><table><thead><tr><th>消息主题</th><th>消息类型</th><th>时间</th><th>状态</th></tr></thead><tbody><tr><td colSpan={4}><div className="messages-empty"><Bell size={30} aria-hidden="true"/><strong>暂无可读取的站内消息</strong><p>站内消息投递服务尚未接通。</p></div></td></tr></tbody></table></div>
  </section>
}
