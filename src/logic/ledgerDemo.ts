import { toDayIso } from './subscriptions'
import type { LedgerEntry } from './ledger'

// 가계부 기록이 하나도 없을 때 보여 주는 저장되지 않는 예시(F82·F84, 2026-11-03 제작자 "예상 지출 몇 가지 추가해 주고 쓴 금액도", "모을 금액 정해서 반영").
// 가계부 요약·현황판·결제·지출 달력이 같은 예시를 쓴다. 이번 달 안의 날짜만 넣는다(1일보다 앞이거나 다음 달이면 뺀다)
export const LEDGER_DEMO_TARGET = 100_000

const DEMO: readonly { offset: number; kind: LedgerEntry['kind']; category: LedgerEntry['category']; name: string; amountKrw: number }[] = [
  { offset: 0, kind: 'income', category: 'salary', name: '(예시) 이번 달 용돈', amountKrw: 500_000 },
  { offset: -2, kind: 'expense', category: 'daily', name: '(예시) 장보기', amountKrw: 23_400 },
  { offset: -1, kind: 'expense', category: 'food', name: '(예시) 카페', amountKrw: 4_800 },
  { offset: 0, kind: 'expense', category: 'food', name: '(예시) 점심 식사', amountKrw: 12_000 },
  { offset: 0, kind: 'expense', category: 'transport', name: '(예시) 교통비', amountKrw: 3_500 },
  // 오늘 뒤 날짜의 지출은 달력에서 '예상 지출'로 보인다
  { offset: 4, kind: 'expense', category: 'other', name: '(예시) 친구 생일 선물', amountKrw: 30_000 },
  { offset: 10, kind: 'expense', category: 'health', name: '(예시) 병원', amountKrw: 15_000 },
  { offset: 17, kind: 'expense', category: 'daily', name: '(예시) 미용실', amountKrw: 18_000 },
]

export function ledgerDemoEntries(today: Date): LedgerEntry[] {
  const month = toDayIso(today).slice(0, 7)
  const createdAt = today.toISOString()
  return DEMO.map((row, index) => ({
    id: `demo-${index}`,
    kind: row.kind,
    category: row.category,
    name: row.name,
    amountKrw: row.amountKrw,
    day: toDayIso(new Date(today.getFullYear(), today.getMonth(), today.getDate() + row.offset, 12)),
    createdAt,
  })).filter((entry) => entry.day.slice(0, 7) === month)
}
