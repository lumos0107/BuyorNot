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
    /** 저장했으면 true (백업 불러오기에서 저장 결과를 모으는 데 쓴다) */
    setHourlyWage: (hourlyWage: number | null): boolean => {
      const next: Settings = { schemaVersion: 1, hourlyWage }
      setSettings(next)
      return saveSettings(storage, next)
    },
  }
}
