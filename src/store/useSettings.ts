import { useEffect, useState } from 'react'
import { getLocalStorage } from '../logic/storage'
import { SETTINGS_KEY, loadSettings, saveSettings, type Settings } from '../logic/settings'

// PRD F12 시급 설정 (별도 키). 저장에 실패해도 이번 방문 동안은 화면에 그대로 쓴다.
export function useSettings(storage: Storage | null = getLocalStorage()) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings(storage))

  // 다른 탭에서 시급을 바꾸면 이 탭도 맞춘다
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== SETTINGS_KEY) return
      setSettings(loadSettings(storage))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storage])

  return {
    hourlyWage: settings.hourlyWage,
    setHourlyWage: (hourlyWage: number | null) => {
      const next: Settings = { schemaVersion: 1, hourlyWage }
      setSettings(next)
      saveSettings(storage, next)
    },
  }
}
