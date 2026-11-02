import { expect, it } from 'vitest'
import { makeBackup, parseBackup } from './backup'
import { EMPTY_PANTRY } from './pantry'
import { EMPTY_SPENDING } from './spending'

const now = new Date('2026-11-01T00:00:00.000Z')
const base = { items: [], hourlyWage: null, subscriptions: [] }

it('AC131: 판 3 백업은 집에 있는 것과 작은 지출을 담는다', () => {
  const raw = makeBackup({ ...base, pantry: EMPTY_PANTRY, spending: EMPTY_SPENDING }, now)
  expect(JSON.parse(raw)).toMatchObject({ backupVersion: 4, pantry: EMPTY_PANTRY, spending: EMPTY_SPENDING })
  expect(parseBackup(raw)).toMatchObject({ ok: true, data: { pantry: EMPTY_PANTRY, spending: EMPTY_SPENDING } })
})

it('AC132: 판 2에는 새 기록이 없어 현재 기록을 유지하도록 null이다', () => {
  const old = JSON.parse(makeBackup(base, now))
  old.backupVersion = 2
  delete old.pantry
  delete old.spending
  expect(parseBackup(JSON.stringify(old))).toMatchObject({ ok: true, data: { pantry: null, spending: null } })
})

it('AC131: 판 3에서 한 부분이 손상이면 전체를 읽지 않는다', () => {
  const base3 = JSON.parse(makeBackup(base, now))
  expect(parseBackup(JSON.stringify({ ...base3, pantry: { ...EMPTY_PANTRY, unknown: 1 } }))).toEqual({ ok: false })
  expect(parseBackup(JSON.stringify({ ...base3, spending: null }))).toEqual({ ok: false })
})
