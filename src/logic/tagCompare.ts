// 가격표 사진 탭의 규격 확인과 비교 문장. (PRD F31)
// 다나와 줄을 눌렀을 때 먼저 같은 규격인지 확인하고, 확인한 뒤에만 비교 문장을 만든다.
import type { DanawaRow, LowestPriceResponse } from '../ai/types'
import { formatWon } from './number'

/** 어느 한쪽 개수를 모를 때 '규격이 같아요' 버튼 위에 붙이는 안내(PRD F31) */
export const UNKNOWN_COUNT_NOTICE = '개수를 확인하지 못했어요. 상품명과 표기를 보고 같은 규격인지 확인해 주세요.'

/** 묶음 개수를 아는 줄은 '6개 묶음', 묶음 표시가 없으면 '묶음 표시 없음' (1개로 보지 않는다) */
export function packLabel(row: DanawaRow): string {
  return row.packCount === null ? '묶음 표시 없음' : `${row.packCount}개 묶음`
}

/** '농심 오징어짬뽕컵 67g · 6개 묶음 · 4,900원 · 판매처 573곳' */
export function rowLine(row: DanawaRow): string {
  return `${row.name} · ${packLabel(row)} · ${formatWon(row.price)} · 판매처 ${row.malls}곳`
}

export type SpecCheck =
  | { kind: 'mismatch'; line: string }
  | { kind: 'confirm'; store: string; online: string; unknownCount: boolean }

/**
 * 두 개수를 모두 알고 서로 다를 때만 mismatch. 한쪽이라도 모르면(묶음 표시 없음 포함)
 * 다르다고 하지 않고 confirm에 unknownCount를 켜서 사용자가 보고 확인하게 한다.
 */
export function specCheck(
  store: { name: string; sizeText: string | null; count: number | null },
  row: DanawaRow,
): SpecCheck {
  if (store.count !== null && row.packCount !== null && store.count !== row.packCount) {
    return {
      kind: 'mismatch',
      line: `묶음 개수가 달라요(매장 ${store.count}개 · 다나와 ${row.packCount}개). 같은 규격끼리 비교해 주세요.`,
    }
  }
  const sizeText = store.sizeText?.trim() ? store.sizeText : '표기 없음'
  return {
    kind: 'confirm',
    store: `매장: ${store.name} · ${sizeText}`,
    online: `다나와: ${row.name} · ${packLabel(row)}`,
    unknownCount: store.count === null || row.packCount === null,
  }
}

/** 다나와 표시 상품가를 매장 가격과 견주는 두 줄. 가격 조건이 있으면 둘째 줄 끝에 붙인다. */
export function compareLines(storePrice: number, row: DanawaRow, priceCondition: string | null): [string, string] {
  const diff = row.price - storePrice
  const first =
    diff === 0
      ? '조회 시점 다나와 표시 상품가와 매장 가격이 같아요.'
      : `조회 시점 다나와 표시 상품가가 매장 가격보다 ${formatWon(Math.abs(diff))} ${diff > 0 ? '높아요' : '낮아요'}.`
  const condition = priceCondition?.trim()
  const tail = condition ? ` · 매장 가격은 ${condition} 기준` : ''
  const second = `매장 ${formatWon(storePrice)} · 다나와 ${formatWon(row.price)} · 배송비와 총 결제액은 확인하지 않았어요${tail}`
  return [first, second]
}

/** 단가 가격표(100g당 등)는 온라인 가격과 비교하지 않는다. basis 자리에는 읽은 값('100g')이 온다. */
export function unitPriceNotice(basis: string): string {
  return `${basis}당 가격처럼 단위 가격이라 온라인 가격과 비교하지 않아요.`
}

/** 다나와 검색 결과를 읽었을 때(found·not_confirmed) 결과 맨 위 줄 (PRD F31, 판정 R29-I2) */
export const PRICE_GAP_NOTE = '가격 차이로는 필요한 물건인지 알 수 없어요.'

/** 다나와 조회를 꺼 두었을 때(off) 결과 맨 위 줄. 가격 칸이 없는 이유와 할 일을 말한다 (PRD F31, 판정 R29-I2) */
export const DANAWA_OFF_NOTE = '지금은 다나와 가격을 자동으로 가져오지 않아요. 가격은 다나와에서 직접 확인해 주세요.'

/**
 * 결과 제목 바로 아래 줄. 다나와를 못 읽었으면(unavailable) 따로 없어서 null이고,
 * 화면의 "다나와 결과를 가져오지 못했어요."가 맨 위 줄이 된다.
 */
export function resultTopLine(status: LowestPriceResponse['status']): string | null {
  switch (status) {
    case 'found':
    case 'not_confirmed':
      return PRICE_GAP_NOTE
    case 'off':
      return DANAWA_OFF_NOTE
    case 'unavailable':
      return null
  }
}
