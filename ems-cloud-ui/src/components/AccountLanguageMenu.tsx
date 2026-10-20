import { useRef, useState } from 'react'
import { useDisplayPreferences } from '@/preferences/PreferencesProvider'
import { saveInterfaceLanguage } from '@/preferences/language'
import type { DisplayPreferences } from '@/preferences/model'
import { Button } from './ui/Workspace'
import LoadingState from './LoadingState'
import './system-settings.css'

/** The enclosing account popover/dialog owns focus restoration and dismissal. */
export default function AccountLanguageMenu({ userId, onClose }: { userId: string; onClose?: () => void }) {
  const { language } = useDisplayPreferences()
  const localized = (chinese: string, english: string) => language === 'English' ? english : chinese
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const saving = useRef(false)
  async function choose(next: DisplayPreferences['language']) {
    if (saving.current || next === language) return
    saving.current = true; setBusy(true); setError('')
    try { await saveInterfaceLanguage(userId, next); onClose?.() }
    catch (cause) { setError(cause instanceof Error ? cause.message : '语言保存失败，请重试。') }
    finally { saving.current = false; setBusy(false) }
  }
  return <section aria-label="界面语言" aria-busy={busy}>
    <div className="settings-choice-group" role="group" aria-label="界面语言">
      {(['简体中文', 'English'] as const).map(value => <button type="button" key={value} lang={value === 'English' ? 'en' : 'zh-CN'} translate="no" className={`settings-choice${language === value ? ' is-selected' : ''}`} aria-pressed={language === value} disabled={busy} onClick={() => { void choose(value) }}>{value}</button>)}
    </div>
    {busy ? <LoadingState compact label={localized('正在保存语言…', 'Saving language…')} /> : <p role="status" aria-live="polite">语言设置仅影响当前账户。</p>}
    {error && <p role="alert" className="ui-error">{error}</p>}
    {onClose && <Button disabled={busy} onClick={onClose}>{localized('关闭', 'Close')}</Button>}
  </section>
}
