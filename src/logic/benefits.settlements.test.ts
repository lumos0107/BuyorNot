import { expect, it } from 'vitest'
import { settlementTotals, validateSettlementInput, type Settlement } from './benefits'

it('AC159: 받을 돈과 줄 돈은 따로 합산하고 정산한 것은 뺀다', () => {
  const rows: Settlement[] = [
    { id: 'a', nickname: '친구A', amountKrw: 20000, day: '2026-11-02', direction: 'receive' },
    { id: 'b', nickname: '친구B', amountKrw: 8000, day: '2026-11-02', direction: 'pay' },
  ]
  expect(settlementTotals(rows)).toEqual({ receiveKrw: 20000, payKrw: 8000 })
  expect(settlementTotals([{ ...rows[0], settledOn: '2026-11-02' }, rows[1]])).toEqual({ receiveKrw: 0, payKrw: 8000 })
})

it('AC160·AC161: 별명·금액·날짜를 검사하고 미래 날짜는 받지 않는다', () => {
  const today = new Date(2026, 10, 2, 9)
  expect(validateSettlementInput('친구', '20000', '2026-11-02', 'receive', today)).toEqual({ nickname: '친구', amountKrw: 20000, day: '2026-11-02', direction: 'receive' })
  expect(validateSettlementInput('친구', '20000', '2026-11-03', 'receive', today)).toBeNull()
  expect(validateSettlementInput('친구', '0', '2026-11-02', 'receive', today)).toBeNull()
  expect(validateSettlementInput('가'.repeat(21), '1000', '2026-11-02', 'pay', today)).toBeNull()
})
