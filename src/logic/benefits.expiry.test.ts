import { expect, it } from 'vitest'
import { expiryLine, sortExpiries, validateExpiryInput, type Expiry } from './benefits'
import { buildExpiryIcs, expiryGoogleCalendarUrl } from './calendar'

const a: Expiry = { id: 'a', name: '포인트', expiresOn: '2026-11-15', amountKrw: 5000 }
const b: Expiry = { id: 'b', name: '쿠폰', expiresOn: '2026-11-10' }

it('AC156·AC157: 만료일 순으로 보이고 D-n·지난 날짜를 구분한다', () => {
  const today = new Date(2026, 10, 2, 9)
  expect(sortExpiries([a, b]).map((row) => row.id)).toEqual(['b', 'a'])
  expect(expiryLine(b, today)).toContain('D-8')
  expect(expiryLine({ ...b, expiresOn: '2026-11-01' }, today)).toContain('만료일이 지났어요')
  expect(validateExpiryInput('포인트', '5000', '2026-11-15')).toEqual({ name: '포인트', amountKrw: 5000, expiresOn: '2026-11-15' })
  expect(validateExpiryInput('포인트', '-1', '2026-11-15')).toBeNull()
})

it('AC158: 만료일 종일 일정에는 알림 요청이 없다', () => {
  const ics = buildExpiryIcs(a, new Date('2026-11-02T00:00:00.000Z'))
  expect(ics).toContain('DTSTART;VALUE=DATE:20261115')
  expect(ics).toContain('DTEND;VALUE=DATE:20261116')
  expect(ics).not.toContain('VALARM')
  expect(expiryGoogleCalendarUrl(a)).toContain('dates=20261115/20261116')
})
