import { formatWon } from './number'
import { isValidSettings } from './settings'
import { parseStore } from './storage'
import { parseSubscriptions, toDayIso, type Subscription } from './subscriptions'
import type { WishItem } from './wishlist'

// PRD F20 백업·복원: 기록은 이 브라우저에만 있으므로 파일로 내보내 옮기거나 보관한다.
// 불러올 때는 각 부분을 저장 데이터와 같은 복원 검증에 통과시키고, 하나라도 실패하면 아무것도 바꾸지 않는다.
export type BackupData = { items: WishItem[]; hourlyWage: number | null; subscriptions: Subscription[] }

const APP = 'buyornot'
const BACKUP_VERSION = 1

export function makeBackup(data: BackupData, now: Date): string {
  return JSON.stringify(
    {
      app: APP,
      backupVersion: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      wishlist: { schemaVersion: 1, items: data.items },
      settings: { schemaVersion: 1, hourlyWage: data.hourlyWage },
      subscriptions: { schemaVersion: 1, items: data.subscriptions },
    },
    null,
    2,
  )
}

export function parseBackup(raw: string): { ok: true; data: BackupData } | { ok: false } {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return { ok: false }
  }
  if (!o || o.app !== APP || o.backupVersion !== BACKUP_VERSION) return { ok: false }
  if (o.wishlist === undefined || o.subscriptions === undefined || !isValidSettings(o.settings)) return { ok: false }
  const wishlist = parseStore(JSON.stringify(o.wishlist))
  const subscriptions = parseSubscriptions(JSON.stringify(o.subscriptions))
  if (!wishlist.ok || !subscriptions.ok) return { ok: false }
  return {
    ok: true,
    data: { items: wishlist.store.items, hourlyWage: o.settings.hourlyWage, subscriptions: subscriptions.store.items },
  }
}

export function backupFileName(now: Date): string {
  return `buyornot-backup-${toDayIso(now)}.json`
}

/** 불러오기 확인 문구에 넣을 요약: "물건 1개, 구독 1개, 시급 12,000원" */
export function describeBackup(data: BackupData): string {
  const wage = data.hourlyWage === null ? '시급 없음' : `시급 ${formatWon(data.hourlyWage)}`
  return `물건 ${data.items.length}개, 구독 ${data.subscriptions.length}개, ${wage}`
}
