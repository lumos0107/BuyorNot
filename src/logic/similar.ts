import { calendarDaysBetween } from './dates'
import { josa } from './number'
import { SATISFACTION_TEXT, type WishItem } from './wishlist'

// PRD F10 내 기록 기반 알림
// 비슷함 = ① 마지막 어절(보통 물건 종류: 헤드폰, 키보드)이 같거나 ② 공백을 지운 이름 중 하나가 다른 하나로 끝날 때.
// '무선', '게이밍' 같은 꾸밈말만 겹치는 것은 비슷하다고 보지 않는다. (AC21: '무선 마우스' ≠ '무선 헤드폰')
// 끝부분만 보므로 '헤드폰 거치대'·'아이폰 케이스' 같은 액세서리는 본체와 구분된다.
// 색상·모델이 뒤에 붙은 이름('헤드폰 블랙' vs '헤드폰 화이트')은 놓칠 수 있다(알려진 한계).

export const MAX_SIMILAR = 3

/** "(예시)"와 괄호 안 내용을 지우고 공백을 정리한다 (비슷한 이름 판정용) */
export function normalizeName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function words(name: string): string[] {
  return normalizeName(name).split(' ').filter(Boolean)
}

function compact(name: string): string {
  return normalizeName(name).replace(/\s/g, '')
}

function isSimilar(input: string, other: string): boolean {
  const a = compact(input)
  const b = compact(other)
  if (a.length < 2 || b.length < 2) return false
  if (a.endsWith(b) || b.endsWith(a)) return true
  const lastA = words(input).at(-1) ?? ''
  const lastB = words(other).at(-1) ?? ''
  return lastA.length >= 2 && lastA === lastB
}

export type SimilarRecord = { item: WishItem; daysAgo: number }

/** 결정한 기록은 결정 시각, 고민 중은 담은 시각 */
function baseTime(item: WishItem): string {
  return item.status === 'considering' ? item.createdAt : (item.decidedAt ?? item.createdAt)
}

export function findSimilar(input: string, items: readonly WishItem[], now: Date): SimilarRecord[] {
  if (compact(input).length < 2) return []
  return items
    .filter((item) => isSimilar(input, item.name))
    .sort((x, y) => Date.parse(baseTime(y)) - Date.parse(baseTime(x)))
    .slice(0, MAX_SIMILAR)
    .map((item) => ({ item, daysAgo: Math.max(0, calendarDaysBetween(new Date(baseTime(item)), now)) }))
}

export function describeSimilar({ item, daysAgo }: SimilarRecord): string {
  const when = daysAgo === 0 ? '오늘' : `${daysAgo}일 전에`
  const quoted = `'${item.name}'${josa(item.name, '을/를')}`
  // 구매 후 회고가 있으면 함께 보여 준다. 지난 기록의 사실일 뿐 이번 구매를 판정하지 않는다 (2026-10-13 A)
  if (item.status === 'purchased') return `${when} ${quoted} 구매했어요${item.satisfaction ? ` · 회고: ${SATISFACTION_TEXT[item.satisfaction]}` : ''}`
  if (item.status === 'skipped') return `${when} ${quoted} 구매 포기했어요`
  return `${when} ${quoted} 담아 뒀어요 (아직 고민 중)`
}

/** 상품명으로 만든 비교용 검색 링크. 실제 추천이 아니라 검색 결과로 보낸다.
 *  검색어에서는 "(예시)" 표지만(위치와 상관없이) 빼고, 모델·세대 같은 괄호 정보는 남긴다 */
export function compareLinks(name: string): { label: string; href: string }[] {
  const q = encodeURIComponent(name.replace(/\(예시\)/g, ' ').replace(/\s+/g, ' ').trim() || name)
  return [
    { label: '네이버쇼핑', href: `https://search.shopping.naver.com/search/all?query=${q}` },
    { label: '다나와', href: `https://search.danawa.com/dsearch.php?query=${q}` },
    { label: '쿠팡', href: `https://www.coupang.com/np/search?q=${q}` },
  ]
}
