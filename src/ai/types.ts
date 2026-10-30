// 앱과 AI 서버가 함께 쓰는 타입. 타입만 두고 실행 코드는 넣지 않는다.

export type TagUnit = 'g' | 'kg' | 'mL' | 'L' | 'ea'

export type TagItem = {
  name: string
  brand: string | null
  price: number | null
  priceCondition: string | null
  regularPrice: number | null
  priceBasis: string | null
  sizeText: string | null
  size: number | null
  unit: TagUnit | null
  count: number | null
  tagReadable: boolean
}

export type ReadTagResponse = {
  items: TagItem[]
  note: string | null
}

// 다나와 검색 결과에서 뽑은 한 줄. packCount가 null이면 묶음 표시가 없어 개수를 모른다.
export type DanawaRow = {
  name: string
  packCount: number | null
  price: number
  unitPriceText: string | null
  malls: string
}

export type LowestPriceRequest = {
  name: string
  brand?: string | null
  sizeText?: string | null
  size?: number | null
  unit?: TagUnit | null
  count?: number | null
}

// found: 같은 상품으로 고른 줄(matches) · not_confirmed: 고르지 못해 앞쪽 줄(candidates)
// unavailable: 다나와를 읽지 못함 · off: 다나와 조회를 꺼 둠. searchUrl은 늘 채운다.
export type LowestPriceResponse = {
  status: 'found' | 'not_confirmed' | 'unavailable' | 'off'
  searchUrl: string
  matches: DanawaRow[]
  candidates: DanawaRow[]
}
