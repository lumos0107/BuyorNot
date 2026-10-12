import { describe, expect, it } from 'vitest'
import { calendarDaysBetween } from './dates'
import { josa } from './number'
import { describeSimilar, findSimilar } from './similar'
import { decideItem, demoItems, reviewAtFrom, type WishItem } from './wishlist'

// PRD F10 내 기록 기반 알림 / AC21
const NOW = new Date('2026-10-11T09:00:00+09:00')
const DAY = 24 * 60 * 60 * 1000
let seq = 0
const nextId = () => `id-${++seq}`

function item(name: string, createdDaysAgo: number, over: Partial<WishItem> = {}): WishItem {
  const created = new Date(NOW.getTime() - createdDaysAgo * DAY).toISOString()
  return {
    id: nextId(),
    name,
    priceKrw: 1000,
    reason: '이유',
    url: null,
    createdAt: created,
    updatedAt: created,
    reviewAt: reviewAtFrom(created, 3),
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}

describe('비슷한 이름 찾기 (F10)', () => {
  const demo = demoItems(NOW, nextId)

  it("AC21: '게이밍 키보드'를 입력하면 예시의 포기 기록을 3일 전으로 알려준다", () => {
    const found = findSimilar('게이밍 키보드', demo, NOW)
    expect(found.map((f) => describeSimilar(f))).toEqual(["3일 전에 '(예시) 게이밍 키보드'를 구매 포기했어요"])
  })

  it("AC21: '키보드'처럼 물건 종류만 같아도 알려준다", () => {
    expect(findSimilar('키보드', demo, NOW).map((f) => f.item.name)).toEqual(['(예시) 게이밍 키보드'])
  })

  it("AC21: '무선 마우스'는 '무선'만 겹치고 물건 종류가 달라 알리지 않는다", () => {
    expect(findSimilar('무선 마우스', demo, NOW)).toEqual([])
  })

  it('AC21: 빈 값이나 괄호만 있는 입력은 알리지 않는다', () => {
    expect(findSimilar('', demo, NOW)).toEqual([])
    expect(findSimilar('  ', demo, NOW)).toEqual([])
    expect(findSimilar('(테스트)', demo, NOW)).toEqual([])
    expect(findSimilar('키', demo, NOW)).toEqual([])
  })

  it('공백을 지운 이름이 서로를 포함하면 비슷하다', () => {
    const items = [item('게이밍키보드', 2)]
    expect(findSimilar('게이밍 키보드', items, NOW)).toHaveLength(1)
  })

  it('AC21: 비슷한 기록이 4건이면 기준 시각이 최근인 3건만 보여준다', () => {
    const items = [item('A 키보드', 10), item('B 키보드', 1), item('C 키보드', 5), item('D 키보드', 3)]
    expect(findSimilar('키보드', items, NOW).map((f) => f.item.name)).toEqual(['B 키보드', 'D 키보드', 'C 키보드'])
  })

  it('결정한 기록은 결정 시각, 고민 중은 담은 시각으로 날짜를 센다. 오늘이면 "오늘"이다', () => {
    const considering = item('무선 헤드폰', 0)
    expect(describeSimilar(findSimilar('헤드폰', [considering], NOW)[0]!)).toBe("오늘 '무선 헤드폰'을 담아 뒀어요 (아직 고민 중)")
    const bought = decideItem(item('노이즈캔슬링 헤드폰', 20), 'purchased', new Date(NOW.getTime() - 2 * DAY))
    expect(describeSimilar(findSimilar('헤드폰', [bought], NOW)[0]!)).toBe("2일 전에 '노이즈캔슬링 헤드폰'을 구매했어요")
  })
})

describe('비슷한 기록에 구매 후 회고를 붙인다 (2026-10-13 A)', () => {
  const boughtAt = new Date(NOW.getTime() - 10 * DAY)
  const bought = (over: Partial<WishItem> = {}) => ({ ...decideItem(item('무선 청소기', 15), 'purchased', boughtAt), ...over })

  it('구매함 기록의 회고 세 가지를 "· 회고: …"로 붙인다', () => {
    const say = (it: WishItem) => describeSimilar(findSimilar('로봇 청소기', [it], NOW)[0]!)
    expect(say(bought({ satisfaction: 'regret' }))).toBe("10일 전에 '무선 청소기'를 구매했어요 · 회고: 후회해요")
    expect(say(bought({ satisfaction: 'good' }))).toBe("10일 전에 '무선 청소기'를 구매했어요 · 회고: 잘 샀어요")
    expect(say(bought({ satisfaction: 'meh' }))).toBe("10일 전에 '무선 청소기'를 구매했어요 · 회고: 그저 그래요")
  })

  it('회고가 없으면 지금 문장 그대로이고, 회고를 고친 시각은 날짜·순서에 쓰지 않는다', () => {
    expect(describeSimilar(findSimilar('청소기', [bought()], NOW)[0]!)).toBe("10일 전에 '무선 청소기'를 구매했어요")
    const reviewedToday = bought({ satisfaction: 'regret', updatedAt: NOW.toISOString() })
    expect(findSimilar('청소기', [reviewedToday], NOW)[0]!.daysAgo).toBe(10)
    // 늦게 산 물건이 먼저다. 먼저 산 물건의 회고를 오늘 고쳐도 순서가 바뀌지 않는다 (GPT 25번)
    const later = { ...decideItem(item('핸디 청소기', 5), 'purchased', new Date(NOW.getTime() - 3 * DAY)), updatedAt: new Date(NOW.getTime() - 3 * DAY).toISOString() }
    expect(findSimilar('청소기', [reviewedToday, later], NOW).map((f) => f.item.name)).toEqual(['핸디 청소기', '무선 청소기'])
  })

  it('구매 포기·고민 중 기록에는 회고 값이 남아 있어도 붙이지 않는다', () => {
    const skipped = { ...decideItem(item('무선 청소기', 15), 'skipped', boughtAt), satisfaction: 'regret' as const }
    expect(describeSimilar(findSimilar('청소기', [skipped], NOW)[0]!)).toBe("10일 전에 '무선 청소기'를 구매 포기했어요")
    const considering = { ...item('무선 청소기', 1), satisfaction: 'good' as const }
    expect(describeSimilar(findSimilar('청소기', [considering], NOW)[0]!)).toBe("1일 전에 '무선 청소기'를 담아 뒀어요 (아직 고민 중)")
  })
})

describe('날짜와 조사 도우미', () => {
  it('현지 달력으로 날짜 차이를 센다 (시각이 달라도 같은 날이면 0)', () => {
    const morning = new Date(2026, 9, 11, 1, 0)
    const night = new Date(2026, 9, 11, 23, 0)
    expect(calendarDaysBetween(morning, night)).toBe(0)
    expect(calendarDaysBetween(new Date(2026, 9, 9, 23, 59), new Date(2026, 9, 11, 0, 1))).toBe(2)
  })

  it('조사만 골라 준다', () => {
    expect(josa('키보드', '을/를')).toBe('를')
    expect(josa('헤드폰', '을/를')).toBe('을')
  })
})
