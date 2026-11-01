import { describe, expect, it } from 'vitest'
import { BENEFITS_KEY, EMPTY_BENEFITS, isBenefitsStore, parseBenefits, type BenefitsStore } from './benefits'
import { makeBackup, parseBackup } from './backup'

const base = { items: [], hourlyWage: null, subscriptions: [] }
const store: BenefitsStore = {
  schemaVersion: 1,
  programs: [{ id: 'energy', checkedOn: '2026-11-02', status: 'receiving', receivedKrw: 100000 }],
  cards: [{ id: 'c', name: '생활 카드', month: '2026-11', targetKrw: 300000, spentKrw: 280000 }],
  expiries: [{ id: 'e', name: '포인트', expiresOn: '2026-11-15' }],
  settlements: [{ id: 's', nickname: '친구', amountKrw: 20000, day: '2026-11-02', direction: 'receive' }],
}

describe('받을 수 있는 돈 저장', () => {
  it('AC162: 새 키의 네 부분을 저장하고 다시 읽는다', () => {
    expect(BENEFITS_KEY).toBe('buyornot.benefits.v1')
    expect(parseBenefits(null)).toEqual({ ok: true, store: EMPTY_BENEFITS })
    expect(parseBenefits(JSON.stringify(store))).toEqual({ ok: true, store })
  })

  it('AC162: 모르는 제도·중복·날짜·금액·정산 순서가 손상이면 전체를 거절한다', () => {
    const bad = [
      { ...store, programs: [{ ...store.programs[0], id: 'unknown' }] },
      { ...store, programs: [store.programs[0], store.programs[0]] },
      { ...store, cards: [{ ...store.cards[0], spentKrw: -1 }] },
      { ...store, expiries: [{ ...store.expiries[0], expiresOn: '2026-02-30' }] },
      { ...store, settlements: [{ ...store.settlements[0], settledOn: '2026-11-01' }] },
      { ...store, settlements: Array.from({ length: 51 }, (_, i) => ({ ...store.settlements[0], id: String(i) })) },
    ]
    for (const value of bad) expect(isBenefitsStore(value)).toBe(false)
  })
})

it('AC162: 새 판 3 백업은 받을 수 있는 돈을 왕복하고 옛 판 3에는 없으면 현재 기록을 유지한다', () => {
  const fresh = JSON.parse(makeBackup({ ...base, benefits: store }, new Date('2026-11-02T00:00:00Z')))
  expect(fresh.backupVersion).toBe(3)
  expect(fresh.benefits).toEqual(store)
  expect(parseBackup(JSON.stringify(fresh))).toMatchObject({ ok: true, data: { benefits: store } })
  delete fresh.benefits
  expect(parseBackup(JSON.stringify(fresh))).toMatchObject({ ok: true, data: { benefits: null } })
  fresh.benefits = { ...store, cards: [{ ...store.cards[0], targetKrw: -1 }] }
  expect(parseBackup(JSON.stringify(fresh))).toEqual({ ok: false })
  for (const version of [1, 2]) {
    const old = JSON.parse(makeBackup(base, new Date('2026-11-02T00:00:00Z')))
    old.backupVersion = version
    delete old.benefits
    if (version === 1) { delete old.savings; delete old.bills; delete old.pantry; delete old.spending }
    if (version === 2) { delete old.pantry; delete old.spending }
    expect(parseBackup(JSON.stringify(old))).toMatchObject({ ok: true, data: { benefits: null } })
  }
})
