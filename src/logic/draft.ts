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
