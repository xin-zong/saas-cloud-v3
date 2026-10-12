import { useSyncExternalStore } from 'react'
import { machineTranslator } from './machine'
import { getPreferences, subscribePreferences } from '@/preferences/store'

export default function MachineTranslationStatus() {
  const { language } = useSyncExternalStore(subscribePreferences, getPreferences, getPreferences)
  useSyncExternalStore(machineTranslator.subscribe, machineTranslator.getRevision, machineTranslator.getRevision)
  const status = machineTranslator.getStatus()
  if (language !== 'English' || !status.enabled || (!status.pending && !status.failed)) return null
  return <span translate="no" role="status" aria-live="polite" style={{fontSize:10,color:'var(--ui-muted)',whiteSpace:'nowrap'}}>
    {status.pending ? 'Translating…' : <button type="button" onClick={machineTranslator.retryFailed} title="Translation service unavailable. Original text is shown; click to retry." style={{textDecoration:'underline'}}>Translation unavailable · Retry</button>}
  </span>
}
