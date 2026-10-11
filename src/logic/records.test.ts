import { describe, expect, it } from 'vitest'
import { sameRecord } from './records'

// 수정 폼을 연 뒤 기록이 바뀌었는지는 기록 시각이 아니라 내용 전체로 비교한다 (같은 밀리초에 바뀌어도 잡도록)
describe('sameRecord', () => {
  it('키 순서가 달라도 내용이 같으면 같다', () => {
    expect(sameRecord({ a: 1, b: { x: 1, y: [1, 2] } }, { b: { y: [1, 2], x: 1 }, a: 1 })).toBe(true)
  })

  it('안쪽 값이나 키가 하나라도 다르면 다르다', () => {
    expect(sameRecord({ a: 1, b: { x: 1 } }, { a: 1, b: { x: 2 } })).toBe(false)
    expect(sameRecord({ a: 1 }, { a: 1, memo: '추가' })).toBe(false)
  })
})
