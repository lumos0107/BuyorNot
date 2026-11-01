import { expect, it } from 'vitest'
import { cardGapLine, cardMonthLine, validateCardInput } from './benefits'

it('AC154: 30만 원 기준에 28만 원을 적으면 차이만 보인다', () => {
  const input = validateCardInput({ name: '생활 카드', month: '2026-11', target: '300000', spent: '280000', benefit: '' }, new Date(2026, 10, 2, 9))
  expect(input).toEqual({ name: '생활 카드', month: '2026-11', targetKrw: 300000, spentKrw: 280000 })
  expect(cardGapLine({ ...input!, id: 'c' })).toBe('실적까지 20,000원')
  expect(cardGapLine({ ...input!, id: 'c', spentKrw: 300000 })).toBe('적은 기준을 채웠어요')
  expect(cardGapLine({ ...input!, id: 'c', spentKrw: 320000 })).toBe('적은 기준을 채웠어요')
})

it('AC155: 지난달은 월을 표시하고 미래 월·잘못된 금액은 거절한다', () => {
  const raw = { name: '생활 카드', month: '2026-10', target: '300000', spent: '280000', benefit: '5000' }
  const card = validateCardInput(raw, new Date(2026, 10, 2, 9))
  expect(card?.benefitKrw).toBe(5000)
  expect(cardMonthLine({ ...card!, id: 'c' }, new Date(2026, 10, 2, 9))).toBe('2026-10 기록')
  expect(validateCardInput({ ...raw, month: '2026-12' }, new Date(2026, 10, 2, 9))).toBeNull()
  expect(validateCardInput({ ...raw, spent: '-1' }, new Date(2026, 10, 2, 9))).toBeNull()
})
