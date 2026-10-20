import { DEMO_MODE, send } from '@/api/client'
import { applyPreferences, getPreferences } from './store'
import type { DisplayPreferences } from './model'

/** A saved language updates the baseline; an explicit unsaved language remains a draft. */
export function reconcileSavedLanguage<T extends { language: string }>(draft: T, baseline: T, language: string) {
  return {
    draft: draft.language === baseline.language ? { ...draft, language } : draft,
    baseline: { ...baseline, language },
  }
}

export async function saveInterfaceLanguage(userId: string, language: DisplayPreferences['language']) {
  if (!userId || !['简体中文', 'English'].includes(language)) throw new Error('请选择支持的界面语言。')
  if (DEMO_MODE) {
    const key = `enerlution:settings:demo:${userId}`
    const raw = localStorage.getItem(key)
    const saved = raw ? JSON.parse(raw) : {}
    const settings = saved.settings ?? saved
    localStorage.setItem(key, JSON.stringify({ ...saved, settings: { ...settings, language }, savedAt: new Date().toISOString() }))
  } else {
    await send('/settings', 'PUT', { key: 'language', value: language })
  }
  applyPreferences({ ...getPreferences(), language })
}
