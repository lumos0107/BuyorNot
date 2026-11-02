// 물건 분류(선택). 카드의 동그란 표식에 첫 글자 대신 분류 아이콘을 그린다 (F85, 2026-11-03 제작자 요청 "취미·식비 이런 거 하나 선택해서 아이콘으로")
export const ITEM_CATEGORIES = ['hobby', 'food', 'living', 'fashion', 'digital', 'study', 'other'] as const
export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export const ITEM_CATEGORY_LABEL: Record<ItemCategory, string> = {
  hobby: '취미',
  food: '식비',
  living: '생활용품',
  fashion: '옷·잡화',
  digital: '전자기기',
  study: '공부',
  other: '기타',
}

export function isItemCategory(v: unknown): v is ItemCategory {
  return typeof v === 'string' && (ITEM_CATEGORIES as readonly string[]).includes(v)
}

// 카드 이름 앞 표식에 쓰는 첫 글자. '(예시) '는 빼고 센다
export function nameInitial(name: string): string {
  return name.replace(/^\(예시\)\s*/, '').slice(0, 1)
}
