import { describe, expect, it } from 'vitest'
import { backupFileName, describeBackup, makeBackup, parseBackup, type BackupData } from './backup'
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
const data: BackupData = { items: [item], hourlyWage: 12000, subscriptions: [sub] }

describe('백업 만들기와 읽기 (F20)', () => {
  it('만든 백업을 다시 읽으면 같은 기록이 나온다', () => {
    const raw = makeBackup(data, NOW)
    expect(JSON.parse(raw)).toMatchObject({ app: 'buyornot', backupVersion: 1, exportedAt: NOW.toISOString() })
    expect(parseBackup(raw)).toEqual({ ok: true, data })
  })

  it('파일 이름은 날짜를 붙인 영문 이름이다', () => {
    expect(backupFileName(NOW)).toBe('buyornot-backup-2026-10-11.json')
  })

  it('확인 문구에 넣을 요약', () => {
    expect(describeBackup(data)).toBe('물건 1개, 구독 1개, 시급 12,000원')
    expect(describeBackup({ items: [], hourlyWage: null, subscriptions: [] })).toBe('물건 0개, 구독 0개, 시급 없음')
  })

  it('살까말까 백업이 아니거나 한 부분이라도 복원 검증을 통과하지 못하면 읽지 않는다', () => {
    const valid = JSON.parse(makeBackup(data, NOW))
    const bad = (over: Record<string, unknown>) => JSON.stringify({ ...valid, ...over })
    expect(parseBackup('{not json')).toEqual({ ok: false })
    expect(parseBackup(bad({ app: 'other' }))).toEqual({ ok: false })
    expect(parseBackup(bad({ backupVersion: 2 }))).toEqual({ ok: false })
    expect(parseBackup(bad({ wishlist: undefined }))).toEqual({ ok: false })
    expect(parseBackup(bad({ wishlist: { schemaVersion: 1, items: [{ ...item, priceKrw: -1 }] } }))).toEqual({ ok: false })
    expect(parseBackup(bad({ settings: { schemaVersion: 1, hourlyWage: 999 } }))).toEqual({ ok: false })
    expect(parseBackup(bad({ subscriptions: { schemaVersion: 1, items: [{ ...sub, billingDay: 40 }] } }))).toEqual({ ok: false })
  })
})
