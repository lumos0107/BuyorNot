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
