import { formatWon } from './number'
import { EMPTY_SAVINGS, isSavingsStore, type SavingsStore } from './savings'
import { isValidSettings } from './settings'
import { parseStore } from './storage'
import { parseSubscriptions, toDayIso, type Subscription } from './subscriptions'
import type { WishItem } from './wishlist'

// PRD F20 백업·복원: 기록은 이 브라우저에만 있으므로 파일로 내보내 옮기거나 보관한다.
// 불러올 때는 각 부분을 저장 데이터와 같은 복원 검증에 통과시키고, 하나라도 실패하면 아무것도 바꾸지 않는다.
// 2026-11-01 백업 v2: 모으기 기록(F48)을 함께 담는다. v1 파일에는 모으기가 없어 savings가 null이다
export type BackupData = { items: WishItem[]; hourlyWage: number | null; subscriptions: Subscription[]; savings: SavingsStore | null }

export const NO_SAVINGS_NOTE = '이 파일에는 모으기 기록이 없어 지금 모으기 기록을 그대로 둬요.'

const APP = 'buyornot'
const BACKUP_VERSION = 2

// savings를 빼거나 null로 주면 빈 모으기를 쓴다 (v1 시절 호출이 그대로 컴파일되게)
type BackupInput = Omit<BackupData, 'savings'> & { savings?: SavingsStore | null }

export function makeBackup(data: BackupInput, now: Date): string {
  return JSON.stringify(
    {
      app: APP,
      backupVersion: BACKUP_VERSION,
      exportedAt: now.toISOString(),
      wishlist: { schemaVersion: 1, items: data.items },
      settings: { schemaVersion: 1, hourlyWage: data.hourlyWage },
      subscriptions: { schemaVersion: 1, items: data.subscriptions },
      savings: data.savings ?? EMPTY_SAVINGS,
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
  if (!o || o.app !== APP || (o.backupVersion !== 1 && o.backupVersion !== BACKUP_VERSION)) return { ok: false }
  if (o.wishlist === undefined || o.subscriptions === undefined || !isValidSettings(o.settings)) return { ok: false }
  const wishlist = parseStore(JSON.stringify(o.wishlist))
  const subscriptions = parseSubscriptions(JSON.stringify(o.subscriptions))
  if (!wishlist.ok || !subscriptions.ok) return { ok: false }
  // v2는 모으기도 복원 검사를 통과해야 하고, v1에는 모으기가 없다(지금 기록을 그대로 둔다)
  if (o.backupVersion === BACKUP_VERSION && !isSavingsStore(o.savings)) return { ok: false }
  const savings = o.backupVersion === BACKUP_VERSION ? (o.savings as SavingsStore) : null
  return {
    ok: true,
    data: { items: wishlist.store.items, hourlyWage: o.settings.hourlyWage, subscriptions: subscriptions.store.items, savings },
  }
}

export function backupFileName(now: Date): string {
  return `buyornot-backup-${toDayIso(now)}.json`
}

/** 불러오기 확인 문구에 넣을 요약: "물건 기록 1건, 구독 1개, 시급 12,000원" */
export function describeBackup(data: BackupInput): string {
  const wage = data.hourlyWage === null ? '시급 없음' : `시급 ${formatWon(data.hourlyWage)}`
  return `물건 기록 ${data.items.length}건, 구독 ${data.subscriptions.length}개, ${wage}`
}
