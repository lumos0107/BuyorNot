import { describe, expect, it } from 'vitest'
import { backupFileName, describeBackup, makeBackup, parseBackup, type BackupData } from './backup'
import { EMPTY_BILLS, type BillsStore } from './bills'
import { EMPTY_BENEFITS } from './benefits'
import { EMPTY_PANTRY } from './pantry'
import { EMPTY_SAVINGS, type SavingsStore } from './savings'
import { EMPTY_SPENDING } from './spending'
import { EMPTY_LEDGER } from './ledger'
import type { Subscription } from './subscriptions'
import type { WishItem } from './wishlist'

// PRD F20 백업·복원: 기록(물건·시급·구독)을 파일 하나로 내보내고, 검증을 거쳐 다시 불러온다
const NOW = new Date(2026, 9, 11, 9)
const item: WishItem = {
  id: 'w1',
  name: '전동 칫솔',
  priceKrw: 59000,
  reason: '고장',
  url: null,
  createdAt: '2026-10-10T00:00:00.000Z',
  updatedAt: '2026-10-10T00:00:00.000Z',
  reviewAt: '2026-10-13T00:00:00.000Z',
  status: 'considering',
  decidedAt: null,
}
const sub: Subscription = {
  id: 's1',
  name: '티빙',
  priceKrw: 9500,
  cycle: 'monthly',
  billingDay: 10,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const data: Omit<BackupData, 'savings' | 'bills' | 'pantry' | 'spending' | 'benefits' | 'ledger'> = { items: [item], hourlyWage: 12000, subscriptions: [sub] }
const asV2 = (raw: string) => {
  const value = JSON.parse(raw)
  value.backupVersion = 2
  delete value.pantry
  delete value.spending
  delete value.benefits
  return JSON.stringify(value)
}

describe('백업 만들기와 읽기 (F20)', () => {
  it('가계부가 들어간 판 4 백업은 왕복하고, 손상된 내역은 거절한다', () => {
    const ledger = { schemaVersion: 1 as const, entries: [{ id: 'l1', kind: 'expense' as const, category: 'food' as const, name: '점심', amountKrw: 12000, day: '2026-10-11', createdAt: NOW.toISOString() }] }
    const raw = makeBackup({ ...data, ledger }, NOW)
    expect(parseBackup(raw)).toMatchObject({ ok: true, data: { ledger } })
    const broken = JSON.parse(raw)
    broken.ledger.entries[0].amountKrw = -1
    expect(parseBackup(JSON.stringify(broken))).toEqual({ ok: false })
  })
  it('만든 백업을 다시 읽으면 같은 기록이 나온다', () => {
    const raw = makeBackup(data, NOW)
    expect(JSON.parse(raw)).toMatchObject({ app: 'buyornot', backupVersion: 4, exportedAt: NOW.toISOString() })
    expect(parseBackup(raw)).toEqual({ ok: true, data: { ...data, savings: EMPTY_SAVINGS, bills: EMPTY_BILLS, pantry: EMPTY_PANTRY, spending: EMPTY_SPENDING, benefits: EMPTY_BENEFITS, ledger: EMPTY_LEDGER } })
  })

  it('파일 이름은 날짜를 붙인 영문 이름이다', () => {
    expect(backupFileName(NOW)).toBe('buyornot-backup-2026-10-11.json')
  })

  it('확인 문구에 넣을 요약', () => {
    expect(describeBackup(data)).toBe('물건 기록 1건, 구독 1개, 시급 12,000원')
    expect(describeBackup({ items: [], hourlyWage: null, subscriptions: [] })).toBe('물건 기록 0건, 구독 0개, 시급 없음')
  })

  it('살까말까 백업이 아니거나 한 부분이라도 복원 검증을 통과하지 못하면 읽지 않는다', () => {
    const valid = JSON.parse(makeBackup(data, NOW))
    const bad = (over: Record<string, unknown>) => JSON.stringify({ ...valid, ...over })
    expect(parseBackup('{not json')).toEqual({ ok: false })
    expect(parseBackup(bad({ app: 'other' }))).toEqual({ ok: false })
    expect(parseBackup(bad({ backupVersion: 5 }))).toEqual({ ok: false })
    expect(parseBackup(bad({ wishlist: undefined }))).toEqual({ ok: false })
    expect(parseBackup(bad({ wishlist: { schemaVersion: 1, items: [{ ...item, priceKrw: -1 }] } }))).toEqual({ ok: false })
    expect(parseBackup(bad({ settings: { schemaVersion: 1, hourlyWage: 999 } }))).toEqual({ ok: false })
    expect(parseBackup(bad({ subscriptions: { schemaVersion: 1, items: [{ ...sub, billingDay: 40 }] } }))).toEqual({ ok: false })
  })
})

describe('백업 v2: 모으기 (F20 보강)', () => {
  const savings: SavingsStore = {
    schemaVersion: 1,
    transfers: [{ id: 't1', day: '2026-10-20', amountKrw: 30000, direction: 'in', memo: '월급날', createdAt: '2026-10-20T01:00:00.000Z' }],
    goal: { name: '여행 자금', targetKrw: 500000, startedOn: '2026-10-01', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z' },
  }

  it('AC99: v2를 만들어 다시 읽으면 모으기까지 같다', () => {
    const raw = asV2(makeBackup({ ...data, savings }, NOW))
    expect(JSON.parse(raw)).toMatchObject({ app: 'buyornot', backupVersion: 2, savings })
    expect(parseBackup(raw)).toEqual({ ok: true, data: { ...data, savings, bills: EMPTY_BILLS, pantry: null, spending: null, benefits: null, ledger: null } })
  })

  it('AC99: v1 파일은 읽히고 모으기는 null이다', () => {
    // v1 모양 원문을 손으로 만든다 (backupVersion 1, savings 없음)
    const v1 = JSON.stringify({
      app: 'buyornot',
      backupVersion: 1,
      exportedAt: NOW.toISOString(),
      wishlist: { schemaVersion: 1, items: [item] },
      settings: { schemaVersion: 1, hourlyWage: 12000 },
      subscriptions: { schemaVersion: 1, items: [sub] },
    })
    expect(parseBackup(v1)).toEqual({ ok: true, data: { ...data, savings: null, bills: null, pantry: null, spending: null, benefits: null, ledger: null } })
  })

  it('AC99·AC131: 모으기가 손상됐거나 없는 v2와 필수 부분 없는 판 3은 읽지 않는다', () => {
    const valid = JSON.parse(asV2(makeBackup({ ...data, savings }, NOW)))
    const bad = (over: Record<string, unknown>) => JSON.stringify({ ...valid, ...over })
    const badTransfer = { ...savings.transfers[0], amountKrw: -1 }
    expect(parseBackup(bad({ savings: { ...savings, transfers: [badTransfer] } }))).toEqual({ ok: false })
    expect(parseBackup(bad({ savings: undefined }))).toEqual({ ok: false })
    expect(parseBackup(bad({ savings: null }))).toEqual({ ok: false })
    expect(parseBackup(bad({ backupVersion: 3 }))).toEqual({ ok: false })
    expect(parseBackup(bad({ backupVersion: 1, savings: undefined })).ok).toBe(true)
  })

  it('AC99: 확인 요약 문장은 그대로다', () => {
    expect(describeBackup({ ...data, savings })).toBe('물건 기록 1건, 구독 1개, 시급 12,000원')
    expect(describeBackup({ ...data, savings: null, bills: null, pantry: null, spending: null, benefits: null })).toBe('물건 기록 1건, 구독 1개, 시급 12,000원')
  })
})

describe('백업 v2: 공과금 (F20 보강)', () => {
  const bills: BillsStore = { schemaVersion: 1, items: [{ id: 'b1', kind: 'electric', month: '2026-10', amountKrw: 42300, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }] }
  it('AC116: v2를 만들어 다시 읽으면 공과금까지 같다', () => {
    const raw = asV2(makeBackup({ ...data, bills }, NOW))
    expect(parseBackup(raw)).toEqual({ ok: true, data: { ...data, savings: EMPTY_SAVINGS, bills, pantry: null, spending: null, benefits: null, ledger: null } })
  })
  it('AC116: 공과금이 없는 v2는 읽히고 공과금은 null이다', () => {
    const old = JSON.parse(asV2(makeBackup(data, NOW)))
    delete old.bills
    expect(parseBackup(JSON.stringify(old))).toEqual({ ok: true, data: { ...data, savings: EMPTY_SAVINGS, bills: null, pantry: null, spending: null, benefits: null, ledger: null } })
  })
  it('AC116: 공과금이 손상된 v2나 null인 v2는 읽지 않는다', () => {
    const base = JSON.parse(asV2(makeBackup({ ...data, bills }, NOW)))
    for (const bad of [null, { ...bills, items: [{ ...bills.items[0], amountKrw: 0 }] }, { ...bills, unknown: true }]) {
      expect(parseBackup(JSON.stringify({ ...base, bills: bad }))).toEqual({ ok: false })
    }
  })
})
