import { formatWon } from './number'
import { EMPTY_BILLS, isBillsStore, type BillsStore } from './bills'
import { EMPTY_PANTRY, isPantryStore, type PantryStore } from './pantry'
import { EMPTY_SPENDING, isSpendingStore, type SpendingStore } from './spending'
import { EMPTY_SAVINGS, isSavingsStore, type SavingsStore } from './savings'
import { isValidSettings } from './settings'
import { parseStore } from './storage'
import { parseSubscriptions, toDayIso, type Subscription } from './subscriptions'
import type { WishItem } from './wishlist'

// PRD F20 백업·복원: 기록은 이 브라우저에만 있으므로 파일로 내보내 옮기거나 보관한다.
// 불러올 때는 각 부분을 저장 데이터와 같은 복원 검증에 통과시키고, 하나라도 실패하면 아무것도 바꾸지 않는다.
// 2026-11-01 백업 v2: 모으기 기록(F48)을 함께 담는다. v1 파일에는 모으기가 없어 savings가 null이다
export type BackupData = { items: WishItem[]; hourlyWage: number | null; subscriptions: Subscription[]; savings: SavingsStore | null; bills: BillsStore | null; pantry: PantryStore | null; spending: SpendingStore | null }

export const NO_SAVINGS_NOTE = '이 파일에는 모으기 기록이 없어 지금 모으기 기록을 그대로 둬요.'
export const NO_BILLS_NOTE = '이 파일에는 공과금 기록이 없어 지금 공과금 기록을 그대로 둬요.'
export const NO_PANTRY_NOTE = '이 파일에는 집에 있는 것 기록이 없어 지금 기록을 그대로 둬요.'
export const NO_SPENDING_NOTE = '이 파일에는 자잘한 지출 기록이 없어 지금 기록을 그대로 둬요.'

const APP = 'buyornot'
const BACKUP_VERSION = 3

// savings를 빼면 빈 모으기를 쓴다 (v1 시절 호출이 그대로 컴파일되게). null은 받지 않는다: 그러면 지금 모으기 기록이 빈 기록으로 바뀐다
export type BackupInput = Omit<BackupData, 'savings' | 'bills' | 'pantry' | 'spending'> & { savings?: SavingsStore; bills?: BillsStore; pantry?: PantryStore; spending?: SpendingStore }

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
      bills: data.bills ?? EMPTY_BILLS,
      pantry: data.pantry ?? EMPTY_PANTRY,
      spending: data.spending ?? EMPTY_SPENDING,
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
  if (!o || o.app !== APP || (o.backupVersion !== 1 && o.backupVersion !== 2 && o.backupVersion !== BACKUP_VERSION)) return { ok: false }
  if (o.wishlist === undefined || o.subscriptions === undefined || !isValidSettings(o.settings)) return { ok: false }
  const wishlist = parseStore(JSON.stringify(o.wishlist))
  const subscriptions = parseSubscriptions(JSON.stringify(o.subscriptions))
  if (!wishlist.ok || !subscriptions.ok) return { ok: false }
  // v2는 모으기도 복원 검사를 통과해야 하고, v1에는 모으기가 없다(지금 기록을 그대로 둔다)
  if (o.backupVersion !== 1 && !isSavingsStore(o.savings)) return { ok: false }
  const savings = o.backupVersion !== 1 ? (o.savings as SavingsStore) : null
  // 1a에서 만든 v2와 v1에는 공과금이 없다. null이면 지금 공과금 기록을 유지한다.
  if (o.backupVersion === 3 && !isBillsStore(o.bills)) return { ok: false }
  if (o.backupVersion === 2 && o.bills !== undefined && !isBillsStore(o.bills)) return { ok: false }
  const bills = o.backupVersion !== 1 && o.bills !== undefined ? (o.bills as BillsStore) : null
  if (o.backupVersion === 3 && (!isPantryStore(o.pantry) || !isSpendingStore(o.spending))) return { ok: false }
  const pantry = o.backupVersion === 3 ? (o.pantry as PantryStore) : null
  const spending = o.backupVersion === 3 ? (o.spending as SpendingStore) : null
  return {
    ok: true,
    data: { items: wishlist.store.items, hourlyWage: o.settings.hourlyWage, subscriptions: subscriptions.store.items, savings, bills, pantry, spending },
  }
}

export function backupFileName(now: Date): string {
  return `buyornot-backup-${toDayIso(now)}.json`
}

/** 불러오기 확인 문구에 넣을 요약: "물건 기록 1건, 구독 1개, 시급 12,000원" */
export function describeBackup(data: BackupData | BackupInput): string {
  const wage = data.hourlyWage === null ? '시급 없음' : `시급 ${formatWon(data.hourlyWage)}`
  return `물건 기록 ${data.items.length}건, 구독 ${data.subscriptions.length}개, ${wage}`
}
