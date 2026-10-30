import { formatSupply, monthlyUseLabel, supplyMonths, type BundleSide, type MonthlyUse } from './bundle'
import type { DiscountSide } from './discount'
import { formatWon } from './number'

// PRD F21 비교 결과를 고민 목록에 담기: 고른 쪽의 가격과 비교 내용을 담기 폼에 채운다.
// 가격 비교에는 상품명이 없으므로 상품명은 사용자가 적는다.
export type WishDraft = { price: number; reason: string }

export function discountDraft(name: string, side: DiscountSide): WishDraft {
  const detail = side.applied ? `할인 ${formatWon(side.discount)} · 배송비 포함` : '쿠폰 적용 불가'
  return { price: side.total, reason: `가격 비교: ${name} 결제액 ${formatWon(side.total)} (${detail})` }
}

/** 한 달에 쓰는 양을 적었으면 괄호 안에 "· 한 달 500mL면 약 3.6개월 분량"을 더한다 (P3) */
export function bundleDraft(name: string, side: BundleSide, use?: MonthlyUse): WishDraft {
  const supply = use ? ` · 한 달 ${monthlyUseLabel(use)}면 ${formatSupply(supplyMonths(side, use))} 분량` : ''
  return {
    price: side.price,
    reason: `가격 비교: ${name} ${side.referenceLabel}당 ${side.unitPriceLabel}원 (총 ${side.totalLabel} · ${formatWon(side.price)}${supply})`,
  }
}

// PRD F31 가격표 사진 결과를 담기 폼에 넣기: 상품명·가격·링크(다나와 검색 주소)를 넘긴다. 이유는 사용자가 적는다.
export type PhotoDraft = { name: string; price: number; url: string }

/** 담기 폼에 넘기는 값. 가격 비교에서 온 것과 가격표 사진에서 온 것은 채우는 칸과 안내가 다르다 */
export type FormDraft = { source: 'compare'; value: WishDraft } | { source: 'photo'; value: PhotoDraft }

export type DraftMerge = { name: string; price: string; url: string; kept: ('상품명' | '가격')[] }

/** 사진 결과는 비어 있는 칸(공백만 있어도 빈 칸)에만 넣는다. 적어 둔 상품명·가격은 그대로 두고 알려 주며, 링크는 알리지 않는다 (AC54) */
export function mergePhotoDraft(current: { name: string; price: string; url: string }, draft: PhotoDraft): DraftMerge {
  const empty = (value: string) => value.trim() === ''
  const kept: DraftMerge['kept'] = []
  if (!empty(current.name)) kept.push('상품명')
  if (!empty(current.price)) kept.push('가격')
  return {
    name: empty(current.name) ? draft.name : current.name,
    price: empty(current.price) ? String(draft.price) : current.price,
    url: empty(current.url) ? draft.url : current.url,
    kept,
  }
}

/** 사진 결과를 담기 폼에 넣은 뒤의 안내. 적어 둔 칸을 그대로 두었으면 그 칸 이름을 덧붙인다 (AC54) */
export function photoDraftNotice(kept: DraftMerge['kept']): string {
  const base = '가격표 사진에서 상품명과 가격을 가져왔어요. 사고 싶은 이유를 적고 담아 두세요.'
  return kept.length > 0 ? `${base} 이미 적은 칸은 그대로 뒀어요: ${kept.join('·')}` : base
}

/** 사진 결과가 빈 링크 칸을 채운 직후의 상품명과 링크: 그 링크는 이 상품명으로 찾은 주소다 (F31, AC69) */
export type PhotoLink = { name: string; url: string }

/** 상품명을 바꿔 사진 초안의 링크를 지웠다는 안내. 사진 결과 안내가 있던 칸의 글을 이것으로 바꾼다 (F31, AC69) */
export const PHOTO_LINK_CLEARED =
  '상품명을 바꿔서 가격표 사진에서 가져온 다나와 검색 링크를 지웠어요. 바꾼 상품명의 검색 링크는 담은 뒤 카드의 ‘비교해 볼 곳’에 있어요.'

/** 사진이 채운 링크가 그대로인데 앞뒤 공백을 뺀 상품명이 채운 직후와 달라졌는가 (F31, AC69) */
export function isStaleLink(link: PhotoLink | null, form: { name: string; url: string }): boolean {
  return link !== null && form.url === link.url && form.name.trim() !== link.name.trim()
}

// 담기 폼에 채운 비교 문장. 위 두 함수가 만드는 형식만 찾는다("가격 비교:"로 시작해도 형식이 다르면 사용자가 쓴 것, PRD F23):
// 할인 "가격 비교: B안 결제액 72,000원 (할인 8,000원 · 배송비 포함)"·"(쿠폰 적용 불가)", 묶음 "가격 비교: 상품 A 100mL당 333.33원 (총 1,800mL · 6,000원)"(P3: 괄호 끝에 "· 한 달 500mL면 약 3.6개월 분량"이 붙을 수 있다)
const COMPARE_NOTE =
  /가격 비교: (?:[AB]안 결제액 [\d,]+원 \((?:할인 [\d,]+원 · 배송비 포함|쿠폰 적용 불가)\)|상품 [AB] (?:100g|100mL|1개)당 [\d.,]+원 \(총 [\d.,]+(?:g|mL|개) · [\d,]+원(?: · 한 달 [\d.,]+(?:g|kg|mL|L|개)면 약 [\d.]+(?:개월|일) 분량)?\))/g

/** 사고 싶은 이유에서 가격 비교 문장을 뺀, 사용자가 쓴 부분 (F23: 사기 전 점검의 할인 문구 검사용) */
export function userWrittenReason(reason: string): string {
  return reason.replace(COMPARE_NOTE, ' ')
}
