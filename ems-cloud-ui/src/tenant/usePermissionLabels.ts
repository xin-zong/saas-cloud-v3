import { useEffect, useSyncExternalStore } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { DEMO_MODE } from '@/api/client'
import { useDisplayPreferences } from '@/preferences/PreferencesProvider'
import { chineseLabelTranslator, machineTranslator } from '@/i18n/machine'
import { translate } from '@/i18n/translate'
import { clientLabel, knownName, localizedName, menuLabel, menuSourceLabel, permissionLabel, sameLanguage } from './permissionLabels'
import type { MenuRow } from './types'

export function usePermissionLabels(rows: MenuRow[] = [], names: string[] = []) {
  const { language } = useDisplayPreferences(), { user } = useAuth()
  const english = language === 'English', translator = english ? machineTranslator : chineseLabelTranslator
  const revision = useSyncExternalStore(translator.subscribe, translator.getRevision, translator.getRevision)
  const scope = `${DEMO_MODE ? 'demo' : 'api'}:${user?.id ?? 'guest'}`
  const source = (name: string) => knownName(name, language) ?? (english ? translate(name, language) : name)
  const candidates = JSON.stringify([...new Set([...rows.map(menuSourceLabel), ...names].map(source).filter(name => name && !sameLanguage(name, language)))])
  useEffect(() => { chineseLabelTranslator.configure(scope, !!user && !english) }, [scope, !!user, english])
  useEffect(() => { JSON.parse(candidates).forEach((name: string) => { void translator.request(name) }) }, [candidates, translator, revision])
  const labelText = (name: string, fallback = english ? 'Custom name' : '自定义名称') => {
    const text = source(name)
    return localizedName(text, language, fallback, translator.read(text))
  }
  return {
    language, labelText,
    menuLabel: (row: MenuRow) => menuLabel(row, language, translator.read(source(menuSourceLabel(row)))),
    permissionLabel: (code: string, name: string) => permissionLabel(code, name, language, translator.read(source(name))),
    clientLabel: (client: string) => clientLabel(client, language),
  }
}
