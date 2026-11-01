import { formatWon, josa, MAX_WON, parseInteger } from './number'
import { compareFreeShipping } from './shipping'
import { kindOf, monthlyEquivalent, type Subscription } from './subscriptions'

// PRD F60: 사용자가 직접 적은 배달 앱 A/B 총액. 서버 가격·쿠폰을 가져오지 않는다.
export type DeliverySide = { name: string; menuKrw: number; deliveryKrw: number; couponKrw: number; pickup: boolean; minimumOrderKrw?: number; freeDeliveryKrw?: number }
export type DeliveryRaw = { name: string; menu: string; delivery: string; coupon: string; pickup: boolean; minimum: string; freeDelivery: string }
export type DeliveryErrors = Partial<Record<keyof DeliveryRaw, string>>

export function validateDeliverySide(raw: DeliveryRaw): { value?: DeliverySide; errors: DeliveryErrors } {
  const errors: DeliveryErrors = {}
  const name = raw.name.trim()
  if (!name || name.length > 30) errors.name = '앱 이름은 1~30자로 적어 주세요.'
  const menu = parseInteger(raw.menu)
  if (menu === null || menu < 1 || menu > MAX_WON) errors.menu = '메뉴 금액은 1원~10억 원 사이여야 해요.'
  const delivery = raw.delivery.trim() ? parseInteger(raw.delivery) : 0
  if (delivery === null || delivery < 0 || delivery > MAX_WON) errors.delivery = '배달비는 0원~10억 원 사이여야 해요.'
  const coupon = raw.coupon.trim() ? parseInteger(raw.coupon) : 0
  if (coupon === null || coupon < 0 || coupon > MAX_WON) errors.coupon = '쿠폰은 0원 이상이어야 해요.'
  else if (menu !== null && coupon > menu) errors.coupon = '쿠폰은 메뉴 금액 이하여야 해요.'
  const minimum = raw.minimum.trim() ? parseInteger(raw.minimum) : undefined
  if (minimum !== undefined && (minimum === null || minimum < 1 || minimum > MAX_WON)) errors.minimum = '최소 주문 금액은 1원~10억 원 사이여야 해요.'
  const free = raw.freeDelivery.trim() ? parseInteger(raw.freeDelivery) : undefined
  if (free !== undefined && (free === null || free < 1 || free > MAX_WON)) errors.freeDelivery = '무료배달 기준은 1원~10억 원 사이여야 해요.'
  if (Object.keys(errors).length || menu === null || delivery === null || coupon === null) return { errors }
  return { value: { name, menuKrw: menu, deliveryKrw: delivery, couponKrw: coupon, pickup: raw.pickup, ...(minimum !== undefined ? { minimumOrderKrw: minimum! } : {}), ...(free !== undefined ? { freeDeliveryKrw: free! } : {}) }, errors }
}

export function deliveryTotal(side: DeliverySide): number {
  const fee = side.pickup || (side.freeDeliveryKrw !== undefined && side.menuKrw >= side.freeDeliveryKrw) ? 0 : side.deliveryKrw
  return side.menuKrw - side.couponKrw + fee
}

export function compareDelivery(a: DeliverySide, b: DeliverySide): { aTotal: number; bTotal: number; difference: number; line: string } {
  const aTotal = deliveryTotal(a)
  const bTotal = deliveryTotal(b)
  return { aTotal, bTotal, difference: Math.abs(aTotal - bTotal), line: `${a.name} 총 ${formatWon(aTotal)} · ${b.name} 총 ${formatWon(bTotal)}` }
}

export function minimumOrderLine(side: DeliverySide): string | null {
  return side.minimumOrderKrw !== undefined && side.menuKrw < side.minimumOrderKrw
    ? `최소 주문까지 ${formatWon(side.minimumOrderKrw - side.menuKrw)} 부족해요. 이 금액으로는 주문할 수 없어요.` : null
}

export function freeDeliveryLine(side: DeliverySide): string | null {
  if (side.pickup || side.freeDeliveryKrw === undefined || side.menuKrw >= side.freeDeliveryKrw || minimumOrderLine(side)) return null
  const add = side.freeDeliveryKrw - side.menuKrw
  const compared = compareFreeShipping({ price: side.menuKrw, shipping: side.deliveryKrw, threshold: side.freeDeliveryKrw, add })
  return `배달비를 내면 총 ${formatWon(compared.current - side.couponKrw)} · ${formatWon(add)}을 더 담으면 총 ${formatWon(compared.after - side.couponKrw)}` // copy-check: ignore josa formatWon은 늘 원으로 끝난다
}

export function deliveryMemberLines(subs: readonly Subscription[]): string[] {
  return subs.filter((sub) => !sub.cancelledOn && ['subscription', 'membership'].includes(kindOf(sub)) && sub.areas?.includes('delivery'))
    .map((sub) => `${sub.name}${josa(sub.name, '을/를')} 내고 있어요(월 ${formatWon(monthlyEquivalent(sub))})`)
}
