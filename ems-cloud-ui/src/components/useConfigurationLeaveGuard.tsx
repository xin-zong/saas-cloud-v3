import { useState } from 'react'
import { Modal } from './station-provision/Common'
import { Button } from './ui/Workspace'
import { useEditorLeaveGuard, type RegisterLeaveGuard } from './useEditorLeaveGuard'

export function useConfigurationLeaveGuard({ dirty, busy, registerLeaveGuard, onClose, onDiscard }: { dirty: boolean; busy: boolean; registerLeaveGuard?: RegisterLeaveGuard; onClose: () => void; onDiscard: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const { requestLeave, settleLeave } = useEditorLeaveGuard({ dirty: dirty || busy, registerLeaveGuard, onConfirm: () => setConfirming(true), onCancel: () => setConfirming(false) })
  const cancel = () => { setConfirming(false); settleLeave(false) }
  return {
    close: async () => { if (await requestLeave()) onClose() },
    confirmation: confirming ? <Modal title="放弃配置草稿" onClose={cancel} actions={<><Button onClick={cancel}>继续编辑配置</Button><Button disabled={busy} onClick={() => { onDiscard(); setConfirming(false); settleLeave(true) }}>放弃配置修改</Button></>}><p>{busy ? '正在保存配置，请等待请求完成。' : '关闭或离开会丢失未保存的配置，是否放弃修改？'}</p></Modal> : null,
  }
}
