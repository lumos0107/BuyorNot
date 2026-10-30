import type { TagItem } from '../ai/types'
import { UNIT_LABEL, type BundleRawInput, type Unit } from './bundle'
import { formatWon } from './number'
import { CHECK_TEXT } from './sizeFill'

// PRD F32 두 상품 사진으로 묶음 비교 채우기. 읽은 상품(TagItem)을 묶음 비교 카드의 칸 값과 확인 상자 문장으로 바꾼다.
// 칸 값은 문자열로 만들어 카드의 입력(BundleRawInput)과 같은 모양이다. 모르는 값은 빈 칸('')으로 둔다(그 칸의 기존 값도 지운다).

export type BundlePartial = {
  price: string
  size: string
  count: string
  unit: Unit | null
  /** count가 읽은 값이 아니라 개수를 몰라서 계산용으로 넣은 1이다(단위를 개로 고르면 이 1은 버린다) */
  countAssumed: boolean
}

export type BundleFill =
  | { ok: true; partial: BundlePartial; read: string; fill: string }
  | { ok: false; message: string }

const UNKNOWN = '모름'

/** 읽은 개수가 없어 계산용으로 1을 넣었을 때 확인 상자에 적는 말 (PRD F32) */
const ASSUMED_ONE = '1개(계산용 1묶음)'

/**
 * 단가 가격표(100g당 등)는 채우지 않는다. 단가로 총가격을 추정하지 않는다 (PRD F32).
 * 기준 자리에는 읽은 값('100g')이 온다. AI가 그렇게 읽었다는 이유와 사용자가 할 일을 말한다 (판정 R29-I2, AC73)
 */
function unitPriceMessage(basis: string): string {
  return `AI가 이 가격을 ${basis}당 가격으로 읽었어요. 묶음 전체 가격이 아니라서 채우지 않았어요. 사려는 묶음의 전체 가격과 용량·개수를 직접 입력해 주세요.`
}

/**
 * 확인 상자의 "채울 값" 줄. unit은 읽은 단위이거나 사용자가 고른 단위이고, 아직 모르면 null이다.
 * 고른 단위로 다시 만들면 그 단위를 읽은 것과 같은 줄이 된다 (총괄 판정 R8).
 * - 단위가 개: "가격 {가격} · {개수}개". 용량은 쓰지 않고, 계산용으로 넣은 1은 버리므로 개수는 읽은 값 또는 "모름"
 * - 그 밖: "가격 {가격} · {용량}{단위} × {개수}". 단위를 아직 모르면 용량 뒤에 "(단위 모름)"(용량도 모르면 그냥 "모름")
 */
export function fillLine(partial: BundlePartial, unit: Unit | null): string {
  const price = partial.price === '' ? UNKNOWN : formatWon(Number(partial.price))
  if (unit === 'ea') {
    const readCount = partial.countAssumed ? '' : partial.count
    return `채울 값: 가격 ${price} · ${readCount === '' ? UNKNOWN : `${readCount}개`}`
  }
  const count = partial.count === '' ? UNKNOWN : partial.countAssumed ? ASSUMED_ONE : `${partial.count}개`
  const size = partial.size === '' ? UNKNOWN : unit === null ? `${partial.size}(단위 모름)` : `${partial.size}${UNIT_LABEL[unit]}`
  return `채울 값: 가격 ${price} · ${size} × ${count}`
}

export function tagToBundle(item: TagItem): BundleFill {
  const basis = item.priceBasis?.trim()
  if (basis) return { ok: false, message: unitPriceMessage(basis) }

  const unit = item.unit
  // 단위가 개면 용량 칸은 비운다. 단위를 모르면 읽은 용량을 그대로 둔다(사용자가 단위를 고른다)
  const size = unit === 'ea' || item.size === null ? '' : String(item.size)
  // 개수를 모르고 용량이 있으면 계산용으로 1을 넣는다. 용량도 없으면 비운다
  const countAssumed = item.count === null && size !== ''
  const count = item.count !== null ? String(item.count) : countAssumed ? '1' : ''
  const partial: BundlePartial = { price: item.price === null ? '' : String(item.price), size, count, unit, countAssumed }

  const sizeLabel = item.sizeText?.trim()
  return {
    ok: true,
    partial,
    // 따옴표 안은 AI가 읽은 글이다. '포장 표기 없음'은 읽은 글이 아니라서 따옴표 밖에 둔다 (판정 R38-I8, AC77)
    read: `AI가 읽은 내용: ‘${item.name}’ · ${sizeLabel ? `‘${sizeLabel}’` : '포장 표기 없음'} · ${CHECK_TEXT}`,
    fill: fillLine(partial, unit),
  }
}

/**
 * 확인 상자에서 단위를 정한 뒤의 카드 칸 값. 단위가 개면 읽은 용량은 비우고, 계산용으로 넣은 개수 1도 비운다
 * (실제 개수는 사용자가 적는다, 총괄 판정 R9). 읽은 개수는 그대로 둔다.
 */
export function completeBundle(partial: BundlePartial, unit: Unit): BundleRawInput {
  const ea = unit === 'ea'
  return { price: partial.price, unit, size: ea ? '' : partial.size, count: ea && partial.countAssumed ? '' : partial.count }
}
