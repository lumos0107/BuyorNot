import type { TagItem } from '../ai/types'
import { UNIT_LABEL, type BundleRawInput, type Unit } from './bundle'
import { formatWon } from './number'

// PRD F32 두 상품 사진으로 묶음 비교 채우기. 읽은 상품(TagItem)을 묶음 비교 카드의 칸 값과 확인 상자 문장으로 바꾼다.
// 칸 값은 문자열로 만들어 카드의 입력(BundleRawInput)과 같은 모양이다. 모르는 값은 빈 칸('')으로 둔다(그 칸의 기존 값도 지운다).

export type BundlePartial = { price: string; size: string; count: string; unit: Unit | null }

export type BundleFill =
  | { ok: true; partial: BundlePartial; read: string; fill: string }
  | { ok: false; message: string }

const UNKNOWN = '모름'

/** 읽은 개수가 없어 계산용으로 1을 넣었을 때 확인 상자에 적는 말 (PRD F32) */
const ASSUMED_ONE = '1개(계산용 1묶음)'

/** 단가 가격표(100g당 등)는 채우지 않는다. 단가로 총가격을 추정하지 않는다 (PRD F32). 기준 자리에는 읽은 값('100g')이 온다 */
function unitPriceMessage(basis: string): string {
  return `${basis}당 가격표라 묶음 비교에 넣지 않았어요. 산 양의 총가격과 실제 수량·용량을 확인해 주세요.`
}

export function tagToBundle(item: TagItem): BundleFill {
  const basis = item.priceBasis?.trim()
  if (basis) return { ok: false, message: unitPriceMessage(basis) }

  const unit = item.unit
  // 단위가 개면 용량 칸은 비운다. 단위를 모르면 읽은 용량을 그대로 둔다(사용자가 단위를 고른다)
  const size = unit === 'ea' || item.size === null ? '' : String(item.size)
  // 개수를 모르고 용량이 있으면 계산용으로 1을 넣는다. 용량도 없으면 비운다
  const assumedOne = item.count === null && size !== ''
  const count = item.count !== null ? String(item.count) : assumedOne ? '1' : ''
  const partial: BundlePartial = { price: item.price === null ? '' : String(item.price), size, count, unit }

  const price = item.price === null ? UNKNOWN : formatWon(item.price)
  const countText = item.count !== null ? `${item.count}개` : assumedOne ? ASSUMED_ONE : UNKNOWN
  // 단위가 개면 용량 없이 개수만 적는다. 단위를 모르면 용량 뒤에 "(단위 모름)"을 붙인다
  const sizeText = size === '' ? UNKNOWN : unit === null ? size : `${size}${UNIT_LABEL[unit]}`
  const amount = unit === 'ea' ? countText : `${sizeText}${unit === null ? '(단위 모름)' : ''} × ${countText}`

  const sizeLabel = item.sizeText?.trim()
  return {
    ok: true,
    partial,
    read: `읽은 내용: ${item.name} · ${sizeLabel ? sizeLabel : '포장 표기 없음'}`,
    fill: `채울 값: 가격 ${price} · ${amount}`,
  }
}

/** 확인 상자에서 단위를 정한 뒤의 카드 칸 값. 단위가 개면 읽은 용량이 있어도 용량 칸은 비운다 */
export function completeBundle(partial: BundlePartial, unit: Unit): BundleRawInput {
  return { price: partial.price, unit, size: unit === 'ea' ? '' : partial.size, count: partial.count }
}
