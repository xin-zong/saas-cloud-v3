import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { translate } from './translate'
import { containsChinese, machineTranslator } from './machine'

/** Network work is scheduled in an effect, never while React renders. */
export function useInterfaceTranslation(texts: string[], language: string) {
  const revision = useSyncExternalStore(machineTranslator.subscribe, machineTranslator.getRevision, machineTranslator.getRevision)
  const candidates = language === 'English' ? [...new Set(texts.map(text => translate(text, language)).filter(containsChinese))] : []
  const key = JSON.stringify(candidates)
  useEffect(() => {
    if (language !== 'English') return
    const pending: string[] = JSON.parse(key)
    pending.forEach(text => { void machineTranslator.request(text) })
  }, [key, language, revision])
  return useCallback((text: string) => {
    const local = translate(text, language)
    return language === 'English' ? machineTranslator.read(local) ?? local : text
  }, [language, revision])
}
