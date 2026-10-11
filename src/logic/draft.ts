import type { BundleSide } from './bundle'
import type { DiscountSide } from './discount'
import { formatWon } from './number'

// PRD F21 비교 결과를 고민 목록에 담기: 고른 쪽의 가격과 비교 내용을 담기 폼에 채운다.
// 가격 비교에는 상품명이 없으므로 상품명은 사용자가 적는다.
export type WishDraft = { price: number; reason: string }

export function discountDraft(name: string, side: DiscountSide): WishDraft {
  const detail = side.applied ? `할인 ${formatWon(side.discount)} · 배송비 포함` : '쿠폰 적용 불가'
  return { price: side.total, reason: `가격 비교: ${name} 결제액 ${formatWon(side.total)} (${detail})` }
}

export function bundleDraft(name: string, side: BundleSide): WishDraft {
  return {
    price: side.price,
    reason: `가격 비교: ${name} ${side.referenceLabel}당 ${side.unitPriceLabel}원 (총 ${side.totalLabel} · ${formatWon(side.price)})`,
  }
}

// 담기 폼에 채운 비교 문장. 위 두 함수가 만드는 형식만 찾는다("가격 비교:"로 시작해도 형식이 다르면 사용자가 쓴 것, PRD F23):
// 할인 "가격 비교: B안 결제액 72,000원 (할인 8,000원 · 배송비 포함)"·"(쿠폰 적용 불가)", 묶음 "가격 비교: 상품 A 100mL당 333.33원 (총 1,800mL · 6,000원)"
const COMPARE_NOTE =
  /가격 비교: (?:[AB]안 결제액 [\d,]+원 \((?:할인 [\d,]+원 · 배송비 포함|쿠폰 적용 불가)\)|상품 [AB] (?:100g|100mL|1개)당 [\d.,]+원 \(총 [\d.,]+(?:g|mL|개) · [\d,]+원\))/g

/** 사고 싶은 이유에서 가격 비교 문장을 뺀, 사용자가 쓴 부분 (F23: 사기 전 점검의 할인 문구 검사용) */
export function userWrittenReason(reason: string): string {
  return reason.replace(COMPARE_NOTE, ' ')
}
