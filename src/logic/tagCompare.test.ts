import { describe, expect, it } from 'vitest'
import type { DanawaRow } from '../ai/types'
import { compareLines, packLabel, resultTopLine, rowLine, specCheck, UNKNOWN_COUNT_NOTICE, unitPriceNotice } from './tagCompare'

// PRD F31 규격 확인·비교 문장, 검증 사례 AC52(문장 부분), AC53(단가 가격표), AC72(결과 맨 위 줄)
const row: DanawaRow = { name: '농심 오징어짬뽕컵 67g', packCount: 6, price: 4900, unitPriceText: null, malls: '573' }
const store = { name: '농심 오징어짬뽕 소컵 6입', sizeText: '67g×6', count: 6 as number | null }
const FORBIDDEN = ['최저가', '싸요', '이득']

describe('다나와 줄 표시', () => {
  it('묶음 개수를 아는 줄은 "6개 묶음"으로 보인다', () => {
    expect(packLabel(row)).toBe('6개 묶음')
  })

  it('묶음 표시가 없는 줄은 "묶음 표시 없음"으로 보인다', () => {
    expect(packLabel({ ...row, packCount: null })).toBe('묶음 표시 없음')
  })

  it('AC52: 줄은 상품명 · 묶음 · 가격 · 판매처 수 순서로 한 줄이 된다', () => {
    expect(rowLine(row)).toBe('농심 오징어짬뽕컵 67g · 6개 묶음 · 4,900원 · 판매처 573곳')
  })

  it('판매처가 999+이면 "판매처 999+곳"으로 보인다', () => {
    expect(rowLine({ ...row, malls: '999+' })).toBe('농심 오징어짬뽕컵 67g · 6개 묶음 · 4,900원 · 판매처 999+곳')
  })

  it('묶음 표시가 없는 줄도 같은 모양의 한 줄이 된다', () => {
    expect(rowLine({ ...row, packCount: null, price: 12300 })).toBe(
      '농심 오징어짬뽕컵 67g · 묶음 표시 없음 · 12,300원 · 판매처 573곳',
    )
  })
})

describe('규격 확인', () => {
  it('AC52: 매장 6개와 다나와 6개 묶음이면 두 줄을 나란히 보이고 개수 경고는 없다', () => {
    expect(specCheck(store, row)).toEqual({
      kind: 'confirm',
      store: '매장: 농심 오징어짬뽕 소컵 6입 · 67g×6',
      online: '다나와: 농심 오징어짬뽕컵 67g · 6개 묶음',
      unknownCount: false,
    })
  })

  // plan: specCheck returns mismatch for 6 vs 12
  it('AC52: 줄이 12개 묶음이고 매장이 6개이면 묶음 개수가 달라요 문장만 돌려준다', () => {
    expect(specCheck(store, { ...row, packCount: 12 })).toEqual({
      kind: 'mismatch',
      line: '묶음 개수가 달라요(매장 6개 · 다나와 12개). 같은 규격끼리 비교해 주세요.',
    })
  })

  it('매장이 12개이고 줄이 6개 묶음이어도 매장 · 다나와 순서로 개수를 적는다', () => {
    expect(specCheck({ ...store, count: 12 }, row)).toEqual({
      kind: 'mismatch',
      line: '묶음 개수가 달라요(매장 12개 · 다나와 6개). 같은 규격끼리 비교해 주세요.',
    })
  })

  // plan: specCheck treats a row without pack count as unknown
  it('AC52: 줄에 묶음 표시가 없으면 다르다고 하지 않고 개수 모름으로 확인을 받는다', () => {
    expect(specCheck(store, { ...row, packCount: null })).toEqual({
      kind: 'confirm',
      store: '매장: 농심 오징어짬뽕 소컵 6입 · 67g×6',
      online: '다나와: 농심 오징어짬뽕컵 67g · 묶음 표시 없음',
      unknownCount: true,
    })
  })

  it('묶음 표시 없음은 1개로 보지 않아서 매장이 1개여도 다르다고 하지 않는다', () => {
    const result = specCheck({ ...store, count: 1 }, { ...row, packCount: null })
    expect(result.kind).toBe('confirm')
    expect(result).toMatchObject({ unknownCount: true })
  })

  // plan: specCheck treats an unknown store count as unknown
  it('AC52: 매장 개수를 모르면 다르다고 하지 않고 개수 모름으로 확인을 받는다', () => {
    expect(specCheck({ ...store, count: null }, { ...row, packCount: 12 })).toEqual({
      kind: 'confirm',
      store: '매장: 농심 오징어짬뽕 소컵 6입 · 67g×6',
      online: '다나와: 농심 오징어짬뽕컵 67g · 12개 묶음',
      unknownCount: true,
    })
  })

  it('양쪽 개수를 모두 모르면 개수 모름이다', () => {
    expect(specCheck({ ...store, count: null }, { ...row, packCount: null })).toMatchObject({
      kind: 'confirm',
      unknownCount: true,
    })
  })

  it('매장 포장 표기가 없으면 "표기 없음"을 적는다', () => {
    expect(specCheck({ ...store, sizeText: null }, row)).toMatchObject({
      store: '매장: 농심 오징어짬뽕 소컵 6입 · 표기 없음',
    })
  })

  it('매장 포장 표기 칸이 공백뿐이어도 "표기 없음"을 적는다', () => {
    expect(specCheck({ ...store, sizeText: '  ' }, row)).toMatchObject({
      store: '매장: 농심 오징어짬뽕 소컵 6입 · 표기 없음',
    })
  })

  it('AC52: 개수 모름 경고 문장은 PRD 문장 그대로다', () => {
    expect(UNKNOWN_COUNT_NOTICE).toBe('개수를 확인하지 못했어요. 상품명과 표기를 보고 같은 규격인지 확인해 주세요.')
  })
})

describe('비교 문장', () => {
  it('AC52: 매장 3,980원이고 다나와 4,900원이면 920원 높아요와 두 번째 줄을 돌려준다', () => {
    expect(compareLines(3980, row, null)).toEqual([
      '조회 시점 다나와 표시 상품가가 매장 가격보다 920원 높아요.',
      '매장 3,980원 · 다나와 4,900원 · 배송비와 총 결제액은 확인하지 않았어요',
    ])
  })

  it('AC52: 매장 4,900원이면 같아요 문장이다', () => {
    expect(compareLines(4900, row, null)).toEqual([
      '조회 시점 다나와 표시 상품가와 매장 가격이 같아요.',
      '매장 4,900원 · 다나와 4,900원 · 배송비와 총 결제액은 확인하지 않았어요',
    ])
  })

  it('AC52: 매장 5,500원이면 600원 낮아요 문장이다', () => {
    expect(compareLines(5500, row, null)).toEqual([
      '조회 시점 다나와 표시 상품가가 매장 가격보다 600원 낮아요.',
      '매장 5,500원 · 다나와 4,900원 · 배송비와 총 결제액은 확인하지 않았어요',
    ])
  })

  it('AC52: 가격 조건이 회원가이면 둘째 줄 끝에 " · 매장 가격은 회원가 기준"을 붙인다', () => {
    const [first, second] = compareLines(3980, row, '회원가')
    expect(first).toBe('조회 시점 다나와 표시 상품가가 매장 가격보다 920원 높아요.')
    expect(second).toBe(
      '매장 3,980원 · 다나와 4,900원 · 배송비와 총 결제액은 확인하지 않았어요 · 매장 가격은 회원가 기준',
    )
  })

  it('가격 조건이 비어 있거나 공백뿐이면 꼬리를 붙이지 않는다', () => {
    const plain = compareLines(3980, row, null)
    expect(compareLines(3980, row, '')).toEqual(plain)
    expect(compareLines(3980, row, '   ')).toEqual(plain)
  })

  it('차이가 천 원 이상이면 쉼표를 넣는다', () => {
    expect(compareLines(3980, { ...row, price: 15400 }, null)[0]).toBe(
      '조회 시점 다나와 표시 상품가가 매장 가격보다 11,420원 높아요.',
    )
  })

  it('어느 경우에도 최저가·싸요·이득을 쓰지 않는다', () => {
    for (const storePrice of [3980, 4900, 5500]) {
      const text = compareLines(storePrice, row, '회원가').join('\n')
      for (const word of FORBIDDEN) expect(text).not.toContain(word)
    }
  })
})

describe('단가 가격표 안내', () => {
  it('AC53: 단가 가격표(100g)는 온라인 가격과 비교하지 않는다는 문장이 나온다', () => {
    expect(unitPriceNotice('100g')).toBe('100g당 가격처럼 단위 가격이라 온라인 가격과 비교하지 않아요.')
  })

  it('읽은 단위를 그대로 앞에 넣는다', () => {
    expect(unitPriceNotice('100mL')).toBe('100mL당 가격처럼 단위 가격이라 온라인 가격과 비교하지 않아요.')
  })
})

describe('결과 맨 위 줄', () => {
  it('AC72: 결과 맨 위 줄은 다나와 상태마다 정해진 문장이고 못 읽었으면 없어요', () => {
    expect(resultTopLine('found')).toBe('가격 차이로는 필요한 물건인지 알 수 없어요.')
    expect(resultTopLine('not_confirmed')).toBe('가격 차이로는 필요한 물건인지 알 수 없어요.')
    expect(resultTopLine('off')).toBe('지금은 다나와 가격을 자동으로 가져오지 않아요. 가격은 다나와에서 직접 확인해 주세요.')
    // 못 읽었으면(unavailable) 맨 위 줄이 따로 없고, 화면의 "다나와 결과를 가져오지 못했어요."가 맨 위가 된다
    expect(resultTopLine('unavailable')).toBeNull()
  })
})
