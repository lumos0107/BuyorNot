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

// 말로 담기: 받아쓴 글과 담기 폼 칸. 말하지 않았거나 규칙에 맞지 않는 칸은 null이다.
export type VoiceFillResponse = {
  transcript: string
  name: string | null
  price: number | null
  reason: string | null
  desire: 1 | 2 | 3 | 4 | 5 | null
  periodDays: number | null
}

// 치수 읽기(F44 2단계): 캡처에 적힌 치수 표기 하나. 값은 적힌 그대로의 숫자이고 단위 환산·반올림은 앱이 한다.
// axes가 labeled면 축 이름(가로·깊이·높이)이 분명해 w·d·h에 넣은 것, order면 적힌 순서대로 넣은 것이다.
// unit이 mixed면 축마다 단위가 다르고, null이면 단위가 적혀 있지 않다.
export type SizeUnit = 'mm' | 'cm' | 'm'

export type SizeCandidate = {
  text: string
  label: string | null
  kind: 'product' | 'package' | 'unknown'
  axes: 'labeled' | 'order'
  w: number | null
  d: number | null
  h: number | null
  unit: SizeUnit | 'mixed' | null
}

export type ReadSizeResponse = {
  candidates: SizeCandidate[]
  note: string | null
}
