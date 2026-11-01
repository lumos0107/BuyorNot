import { expect, it } from 'vitest'
import { PROGRAMS, programIncome, programListStale, validateProgramInput, type ProgramCheck } from './benefits'

it('AC151: 세 공식 링크에는 사용자 입력이나 검색 매개변수가 없다', () => {
  expect(PROGRAMS.map((program) => program.id)).toEqual(['rent', 'energy', 'transport'])
  for (const program of PROGRAMS) {
    const url = new URL(program.url)
    expect(url.protocol).toBe('https:')
    expect(url.search).toBe('')
    expect(url.hash).toBe('')
  }
})

it('AC152: 확인한 날은 오늘까지이고 받는 중일 때만 받은 금액을 적는다', () => {
  const today = new Date(2026, 10, 2, 9)
  expect(validateProgramInput('energy', '2026-11-02', 'applied', '', today)).toEqual({ id: 'energy', checkedOn: '2026-11-02', status: 'applied' })
  expect(validateProgramInput('energy', '2026-11-03', 'applied', '', today)).toBeNull()
  expect(validateProgramInput('energy', '2026-11-02', 'receiving', '100000', today)?.receivedKrw).toBe(100000)
  expect(validateProgramInput('energy', '2026-11-02', 'checked', '100000', today)).toBeNull()
})

it('AC153: 받은 금액만 생긴 돈이고 목록 확인 뒤 181일째 낡음 안내를 보인다', () => {
  const rows: ProgramCheck[] = [
    { id: 'energy', checkedOn: '2026-11-02', status: 'receiving', receivedKrw: 100000 },
    { id: 'rent', checkedOn: '2026-11-02', status: 'checked' },
  ]
  expect(programIncome(rows)).toBe(100000)
  expect(programListStale(new Date(2027, 4, 1, 9))).toBe(false)
  expect(programListStale(new Date(2027, 4, 2, 9))).toBe(true)
})
