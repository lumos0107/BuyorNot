import { describe, expect, it } from 'vitest'
import { DESIRE_KEEP, checkDesire, desireChange, desireDueToday, desireEffect, desireTrend } from './desire'
import { type DesireCheck, type DesireLevel, type WishItem } from './wishlist'

// PRD F22 고민 노트: 갖고 싶은 정도를 담을 때와 고민하는 동안 기록하고 변화를 보여준다 (AC36, AC36-2, AC40)
// 날짜는 기기 현지 날짜라서 시각도 현지 시각으로 만든다(시간대가 다른 환경에서도 같은 날짜가 나오게)
const local = (day: number, hour = 9) => new Date(2026, 9, day, hour)
const iso = (day: number, hour = 9) => local(day, hour).toISOString()
const pad = (n: number) => String(n).padStart(2, '0')
const nthDay = (i: number) => {
  const d = new Date(2026, 0, 1 + i)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function item(over: Partial<WishItem> = {}): WishItem {
  return {
    id: 'w1',
    name: '무선 헤드폰',
    priceKrw: 129000,
    reason: '출퇴근길에 쓰려고',
    url: null,
    createdAt: iso(8),
    updatedAt: iso(8),
    reviewAt: iso(11),
    status: 'considering',
    decidedAt: null,
    ...over,
  }
}
const checks = (...pairs: [string, number][]): DesireCheck[] => pairs.map(([day, level]) => ({ day, level: level as DesireLevel }))

describe('갖고 싶은 정도 기록 (F22)', () => {
  it('오늘(기기 현지 날짜)의 정도를 기록하고 기록 시각을 바꾼다', () => {
    const now = local(9, 23)
    const next = checkDesire(item({ desireStart: 4 }), 3, now)
    expect(next.desireChecks).toEqual(checks(['2026-10-09', 3]))
    expect(next.updatedAt).toBe(now.toISOString())
    expect(next.desireStart).toBe(4)
  })

  it('같은 날 다시 고르면 그날 값을 바꾼다', () => {
    const once = checkDesire(item({ desireStart: 4 }), 3, local(9, 10))
    expect(checkDesire(once, 2, local(9, 22)).desireChecks).toEqual(checks(['2026-10-09', 2]))
  })

  it('새 날짜는 날짜순으로 넣는다 (복원한 기록의 순서가 섞여 있어도)', () => {
    const mixed = item({ desireChecks: checks(['2026-10-10', 3], ['2026-10-08', 5]) })
    expect(checkDesire(mixed, 2, local(11)).desireChecks).toEqual(checks(['2026-10-08', 5], ['2026-10-10', 3], ['2026-10-11', 2]))
  })

  it('새 날짜를 더해 100개를 넘으면 첫 기록과 최근 99개를 남긴다 (AC36-2)', () => {
    const full = item({ desireChecks: Array.from({ length: DESIRE_KEEP }, (_, i) => ({ day: nthDay(i), level: 3 as DesireLevel })) })
    const next = checkDesire(full, 2, local(11)).desireChecks!
    expect(next).toHaveLength(DESIRE_KEEP)
    expect(next[0].day).toBe(nthDay(0))
    expect(next[1].day).toBe(nthDay(2))
    expect(next[next.length - 1]).toEqual({ day: '2026-10-11', level: 2 })
  })

  it('기기 날짜를 되돌려 빈 날에 기록해도 방금 고른 오늘 기록은 남긴다 (첫 기록 + 오늘 + 나머지 최근 것, GPT 코드 검토)', () => {
    // 1월 2일만 비어 있는 100개 기록에서 기기 날짜가 1월 2일이 됨
    const gap = item({ desireChecks: [0, ...Array.from({ length: 99 }, (_, i) => i + 2)].map((i) => ({ day: nthDay(i), level: 3 as DesireLevel })) })
    const next = checkDesire(gap, 1, new Date(2026, 0, 2, 9)).desireChecks!
    expect(next).toHaveLength(DESIRE_KEEP)
    expect(next[0].day).toBe(nthDay(0))
    expect(next).toContainEqual({ day: nthDay(1), level: 1 })
    expect(next.map((check) => check.day)).not.toContain(nthDay(2))
  })

  it('복원한 기록이 100개를 넘어도 그날 값만 바꿀 때는 줄이지 않고, 새 날짜를 기록할 때 줄인다 (AC36-2)', () => {
    const restored = Array.from({ length: 149 }, (_, i) => ({ day: nthDay(i), level: 3 as DesireLevel }))
    const withToday = item({ desireChecks: [...restored, { day: '2026-10-11', level: 4 }] })
    expect(checkDesire(withToday, 2, local(11)).desireChecks).toHaveLength(150)
    expect(checkDesire(withToday, 2, local(12)).desireChecks).toHaveLength(DESIRE_KEEP)
  })
})

describe('변화 문장 (F22)', () => {
  it('정도가 없으면 문장이 없고, 담을 때 정도만 있으면 "담을 때 4"', () => {
    expect(desireTrend(item())).toBeNull()
    expect(desireTrend(item({ desireStart: 4 }))).toBe('담을 때 4')
  })

  it('처음 값보다 뒤 날짜의 기록과 비교해 줄었는지·늘었는지·그대로인지 붙인다 (AC36)', () => {
    expect(desireTrend(item({ desireStart: 4, desireChecks: checks(['2026-10-09', 3]) }))).toBe('담을 때 4 → 3 (1 줄었어요)')
    expect(desireTrend(item({ desireStart: 3, desireChecks: checks(['2026-10-09', 5]) }))).toBe('담을 때 3 → 5 (2 늘었어요)')
    expect(desireTrend(item({ desireStart: 4, desireChecks: checks(['2026-10-09', 4]) }))).toBe('담을 때 4 → 4 (그대로예요)')
    expect(desireTrend(item({ desireStart: 4, desireChecks: checks(['2026-10-09', 3], ['2026-10-10', 2]) }))).toBe(
      '담을 때 4 → 3 → 2 (2 줄었어요)',
    )
  })

  it('같은 날 안에서 바꾼 것은 값만 보이고 판정하지 않는다 (AC36)', () => {
    expect(desireTrend(item({ desireStart: 4, desireChecks: checks(['2026-10-08', 2]) }))).toBe('담을 때 4 → 2')
    expect(desireChange(item({ desireStart: 4, desireChecks: checks(['2026-10-08', 2]) }))).toBeNull()
  })

  it('담을 때 고른 날을 저장해 두었으면 그 날을 쓴다 (나중에 시간대가 바뀌어도 같은 판정, GPT 코드 검토)', () => {
    // 등록 시각을 지금 시간대로 바꾸면 10월 8일이지만, 담을 때 고른 날은 10월 9일로 저장돼 있다
    const moved = item({ createdAt: iso(8, 23), desireStart: 4, desireStartDay: '2026-10-09', desireChecks: checks(['2026-10-09', 2]) })
    expect(desireTrend(moved)).toBe('담을 때 4 → 2')
    expect(desireChange(moved)).toBeNull()
  })

  it('담을 때 날짜는 등록 시각의 현지 날짜다 (UTC 문자열을 잘라 쓰지 않는다)', () => {
    // 현지 10월 9일 새벽 1시에 담음: 한국 시간이면 UTC로는 10월 8일이다
    const lateNight = item({ createdAt: iso(9, 1), desireStart: 4, desireChecks: checks(['2026-10-09', 2]) })
    expect(desireTrend(lateNight)).toBe('담을 때 4 → 2')
  })

  it('담을 때 정도가 없으면 가장 이른 날의 기록을 "처음"이라 쓴다', () => {
    expect(desireTrend(item({ desireChecks: checks(['2026-10-09', 3]) }))).toBe('처음 3')
    expect(desireTrend(item({ desireChecks: checks(['2026-10-10', 2], ['2026-10-09', 3]) }))).toBe('처음 3 → 2 (1 줄었어요)')
    expect(desireChange(item({ desireChecks: checks(['2026-10-09', 3], ['2026-10-10', 2]) }))).toEqual({ label: '처음', from: 3, to: 2 })
  })

  it('값이 5개까지는 모두, 6개 이상이면 첫 값·"…"·마지막 3개만 쓴다 (AC36)', () => {
    const five = checks(['2026-10-09', 4], ['2026-10-10', 4], ['2026-10-11', 3], ['2026-10-12', 2])
    expect(desireTrend(item({ desireStart: 5, desireChecks: five }))).toBe('담을 때 5 → 4 → 4 → 3 → 2 (3 줄었어요)')
    expect(desireTrend(item({ desireStart: 5, desireChecks: [...five, { day: '2026-10-13', level: 2 }] }))).toBe(
      '담을 때 5 → … → 3 → 2 → 2 (3 줄었어요)',
    )
  })

  it('기기 시각이 바뀌어 등록일보다 이른 날짜의 기록은 판정에 쓰지 않는다', () => {
    expect(desireChange(item({ desireStart: 4, desireChecks: checks(['2026-10-07', 2]) }))).toBeNull()
  })
})

describe('결정 기록의 고민 효과 (F22, AC40)', () => {
  const decided = (status: 'purchased' | 'skipped', over: Partial<WishItem>) =>
    item({ id: `${status}-${Math.random()}`, status, decidedAt: iso(12), ...over })

  it('결정한 기록 중 정도가 줄어든 것과 그중 구매 포기를 센다 (같은 판정 기준)', () => {
    const items = [
      decided('skipped', { desireStart: 4, desireChecks: checks(['2026-10-10', 2]) }),
      decided('skipped', { desireStart: 5, desireChecks: checks(['2026-10-09', 3]) }),
      decided('purchased', { desireStart: 3, desireChecks: checks(['2026-10-09', 4]) }),
      decided('skipped', {}),
      decided('skipped', { desireStart: 4, desireChecks: checks(['2026-10-08', 2]) }),
      item({ desireStart: 4, desireChecks: checks(['2026-10-10', 2]) }),
    ]
    expect(desireEffect(items)).toEqual({ dropped: 2, droppedSkipped: 2 })
    const boughtAnyway = decided('purchased', { desireStart: 4, desireChecks: checks(['2026-10-10', 3]) })
    expect(desireEffect([...items, boughtAnyway])).toEqual({ dropped: 3, droppedSkipped: 2 })
  })
})

describe('오늘 갖고 싶은 정도를 아직 안 적었는지 (2026-10-13 G)', () => {
  const now = local(11, 21)
  it('고민 중이고 오늘 날짜 기록이 없으면 적을 차례다', () => {
    expect(desireDueToday(item(), now)).toBe(true)
    expect(desireDueToday(item({ desireChecks: checks(['2026-10-10', 3]) }), now)).toBe(true)
  })

  it('오늘 기록했거나, 오늘 담으며 정도를 적었으면 아니다', () => {
    expect(desireDueToday(item({ desireChecks: checks(['2026-10-10', 3], ['2026-10-11', 2]) }), now)).toBe(false)
    expect(desireDueToday(item({ createdAt: iso(11, 8), desireStart: 4, desireStartDay: '2026-10-11' }), now)).toBe(false)
  })

  it('담을 때 정도는 담은 날에만 오늘 기록으로 친다. 결정한 물건은 적을 차례가 아니다', () => {
    expect(desireDueToday(item({ desireStart: 4, desireStartDay: '2026-10-08' }), now)).toBe(true)
    expect(desireDueToday(item({ status: 'purchased', decidedAt: iso(10) }), now)).toBe(false)
    expect(desireDueToday(item({ status: 'skipped', decidedAt: iso(10) }), now)).toBe(false)
  })
})
