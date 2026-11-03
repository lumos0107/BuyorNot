import { useEffect, useId, useRef, useState } from 'react'
import { isLowestPriceResponse, isReadTagResponse, postJson } from '../../ai/client'
import { PHOTO_TIMEOUT_MS } from '../../ai/config'
import { blobToBase64, shrinkImage } from '../../ai/image'
import { aiFailureMessage, PHOTO_DECODE_FAILED, PHOTO_NOTICE } from '../../ai/messages'
import type { DanawaRow, LowestPriceRequest, LowestPriceResponse, TagItem, TagUnit } from '../../ai/types'
import type { PhotoDraft } from '../../logic/draft'
import { formatWon, MAX_WON, parseInteger } from '../../logic/number'
import { compareLines, NO_RESULTS_LINE, NOT_UNIT_PRICE, resultTopLine, rowLine, specCheck, unitPriceNotice, UNKNOWN_COUNT_NOTICE } from '../../logic/tagCompare'
import { Button } from '../../ui/Button'
import { EmptyIllustration } from '../../ui/EmptyIllustration'
import { TextField } from '../../ui/Field'
import { PhotoPicker } from './PhotoPicker'
import { PhotoPreview } from './PhotoPreview'
import { Progress } from './Progress'

// PRD F31 가격표 사진으로 온라인 가격 확인.
// 흐름: idle → reading(사진을 읽는 중) → read(읽은 상품) → checking(온라인 가격 확인 중) → result(다나와 결과)
// 요청은 한 번에 하나만 둔다. 새 요청·취소·새 사진·고른 상품 바꿈·칸 고침이면 앞 요청을 끊고(AbortController),
// 그래도 늦게 온 응답은 요청 번호가 마지막이 아니라서 버린다 (PRD 10장 앱 공통).
type Phase = 'idle' | 'reading' | 'read' | 'checking' | 'result'

type FieldKey = 'name' | 'price' | 'priceCondition' | 'sizeText' | 'count'

type FieldSpec = { key: FieldKey; label: string; numeric?: boolean }

// 늘 보이는 칸. 정상가 칸은 비교에 쓰지 않아 뺐다 (2026-11-03 제작자 "자동입력 되지도 않는데 있어야 하나?")
const MAIN_FIELDS: readonly FieldSpec[] = [
  { key: 'name', label: '상품명' },
  { key: 'price', label: '가격', numeric: true },
]
// 가격표에 적혀 있을 때만 채워지는 칸은 '규격·조건 고치기' 안에 접어 둔다
const MORE_FIELDS: readonly FieldSpec[] = [
  { key: 'sizeText', label: '포장 표기' },
  { key: 'count', label: '개수', numeric: true },
  { key: 'priceCondition', label: '가격 조건' },
]

// 읽은 상품 하나. form은 사용자가 고칠 수 있는 칸이고, 나머지는 칸으로 보이지 않는 읽은 값이다
type Product = {
  form: Record<FieldKey, string>
  /** 상품이 여러 개일 때 고르는 라디오의 이름 */
  readName: string
  brand: string | null
  /** 단가 가격표의 기준('100g' 등). 있으면 온라인 가격과 비교하지 않는다 */
  priceBasis: string | null
  priceUnread: boolean
  /** 읽은 포장 표기와 개당 용량·단위. 포장 표기 칸을 고치면 용량·단위는 보내지 않는다 */
  readSizeText: string
  size: number | null
  unit: TagUnit | null
}

const asText = (value: string | number | null) => (value === null ? '' : String(value))

// 상품명 칸의 글자 수 상한. 서버도 온라인 가격 확인에서 1~80자 상품명만 받는다 (PRD 10장 /api/lowest-price)
const MAX_NAME = 80

function fromTag(item: TagItem): Product {
  return {
    form: {
      name: item.name,
      price: asText(item.price),
      priceCondition: asText(item.priceCondition),
      sizeText: asText(item.sizeText),
      count: asText(item.count),
    },
    readName: item.name,
    brand: item.brand,
    priceBasis: item.priceBasis,
    priceUnread: item.price === null,
    readSizeText: asText(item.sizeText),
    size: item.size,
    unit: item.unit,
  }
}

// 상품을 하나도 못 찾았을 때 직접 적을 빈 칸 한 벌
const BLANK: Product = {
  form: { name: '', price: '', priceCondition: '', sizeText: '', count: '' },
  readName: '',
  brand: null,
  priceBasis: null,
  priceUnread: false,
  readSizeText: '',
  size: null,
  unit: null,
}

/** 매장 가격: 1원~10억 원 정수만 쓴다. 비었거나 숫자가 아니면 null(확인 버튼을 막는다) */
function storePriceOf(raw: string): number | null {
  const value = parseInteger(raw)
  return value !== null && value >= 1 && value <= MAX_WON ? value : null
}

/** 개수 칸: 서버 규칙과 같은 1~9999 정수만, 아니면 모름 */
function countOf(raw: string): number | null {
  const value = parseInteger(raw)
  return value !== null && value >= 1 && value <= 9999 ? value : null
}

/** 비교에는 사용자가 고친 값을 쓴다. 포장 표기를 고쳤으면 읽은 개당 용량·단위는 비운다 (PRD F31) */
function lowestPriceRequest(product: Product): LowestPriceRequest {
  const sizeKept = product.form.sizeText === product.readSizeText
  const sizeText = product.form.sizeText.trim()
  return {
    name: product.form.name.trim(),
    brand: product.brand,
    sizeText: sizeText === '' ? null : sizeText,
    size: sizeKept ? product.size : null,
    unit: sizeKept ? product.unit : null,
    count: countOf(product.form.count),
  }
}

const SHOWN_ROWS = 3

/** 같은 상품으로 고른 줄이 있으면 낮은 가격 순 최대 3줄, 없으면 검색 결과 앞쪽 3줄. 다나와를 못 읽었거나 꺼 두었으면 줄 없음 */
function danawaRows(online: LowestPriceResponse): { heading: string; rows: DanawaRow[] } | null {
  if (online.status === 'found' && online.matches.length > 0) {
    const rows = [...online.matches].sort((a, b) => a.price - b.price).slice(0, SHOWN_ROWS)
    return { heading: 'AI가 같은 상품으로 고른 다나와 상품', rows }
  }
  if (online.status === 'found' || online.status === 'not_confirmed') {
    return { heading: '다나와 검색 결과 · 같은 상품인지 확인하지 못했어요', rows: online.candidates.slice(0, SHOWN_ROWS) }
  }
  return null
}

/** 서버가 준 검색 주소는 https일 때만 링크로 쓴다 */
function httpsUrl(raw: string): string | null {
  try {
    return new URL(raw).protocol === 'https:' ? raw : null
  } catch {
    return null
  }
}

export function TagPhotoCheck({ onAdd }: { onAdd?: (draft: PhotoDraft) => void }) {
  const [phase, setPhase] = useState<Phase>('idle')
  const [photo, setPhoto] = useState<File | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [notFound, setNotFound] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [online, setOnline] = useState<LowestPriceResponse | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const [sameSpec, setSameSpec] = useState(false)
  const [error, setError] = useState<{ at: 'photo' | 'check'; message: string } | null>(null)
  // 읽기·확인이 끝난 뒤 옮길 포커스. 새 객체로 바꿔야 같은 곳으로 다시 옮긴다
  const [focusTo, setFocusTo] = useState<{ target: 'products' | 'result' } | null>(null)
  const focusCheckNext = useRef(false)

  const productsTitleId = useId()
  const radioName = useId()
  const needNameId = useId()
  const needPriceId = useId()
  const productsHeading = useRef<HTMLHeadingElement>(null)
  const resultHeading = useRef<HTMLHeadingElement>(null)
  // 취소한 뒤 포커스를 돌릴 곳: 읽는 중이면 사진 고르기, 확인 중이면 '온라인 가격 확인' (applying-ai-results 규칙 6)
  const pickerInput = useRef<HTMLInputElement>(null)
  const checkButton = useRef<HTMLButtonElement>(null)

  // 요청 번호와 지금 요청의 취소. 번호가 바뀐 뒤 온 응답은 늦은 응답이다
  const requestId = useRef(0)
  const inFlight = useRef<AbortController | null>(null)
  const stopRequest = () => {
    requestId.current += 1
    inFlight.current?.abort()
    inFlight.current = null
  }
  const startRequest = () => {
    stopRequest()
    const controller = new AbortController()
    inFlight.current = controller
    return { id: requestId.current, signal: controller.signal }
  }
  const isLatest = (id: number) => id === requestId.current
  // 화면이 사라지면 진행 중인 요청을 끊는다
  useEffect(
    () => () => {
      requestId.current += 1
      inFlight.current?.abort()
    },
    [],
  )

  // 다른 메뉴·탭을 보는 동안 끝났으면(숨은 화면) 포커스를 옮기지 않는다. 돌아오면 결과는 그대로 보인다 (PRD 10장 앱 공통)
  useEffect(() => {
    if (focusTo === null) return
    const heading = (focusTo.target === 'products' ? productsHeading : resultHeading).current
    if (heading && !heading.closest('[hidden]')) heading.focus()
  }, [focusTo])

  const clearOnline = () => {
    setOnline(null)
    setPicked(null)
    setSameSpec(false)
  }

  const pick = async (file: File) => {
    const { id, signal } = startRequest()
    setPhoto(file)
    setPhase('reading')
    setProducts([])
    setNotFound(false)
    setSelected(null)
    clearOnline()
    setError(null)

    let image: string
    try {
      image = await blobToBase64(await shrinkImage(file))
    } catch {
      // 브라우저가 열 수 없는 사진(예: 일부 HEIC)은 서버로 보내지 않는다
      if (!isLatest(id)) return
      inFlight.current = null
      setPhoto(null)
      setPhase('idle')
      setError({ at: 'photo', message: PHOTO_DECODE_FAILED })
      return
    }
    if (!isLatest(id)) return
    const result = await postJson('/api/read-tag', { image, mimeType: 'image/jpeg' }, { timeoutMs: PHOTO_TIMEOUT_MS, signal, guard: isReadTagResponse })
    if (!isLatest(id)) return
    inFlight.current = null
    if (!result.ok) {
      setPhoto(null)
      setPhase('idle')
      if (result.error !== 'cancelled') setError({ at: 'photo', message: aiFailureMessage(result.error) })
      return
    }
    const items = result.data.items
    setProducts(items.length > 0 ? items.map(fromTag) : [BLANK])
    setNotFound(items.length === 0)
    // 하나면 자동으로 고르고, 여러 개면 사용자가 고른다
    setSelected(items.length > 1 ? null : 0)
    setPhase('read')
    setFocusTo({ target: 'products' })
  }

  const current = selected === null ? null : (products[selected] ?? null)
  const storePrice = current ? storePriceOf(current.form.price) : null

  const check = async () => {
    if (current === null) return
    const body = lowestPriceRequest(current)
    const { id, signal } = startRequest()
    setPhase('checking')
    clearOnline()
    setError(null)
    const result = await postJson('/api/lowest-price', body, { timeoutMs: PHOTO_TIMEOUT_MS, signal, guard: isLowestPriceResponse })
    if (!isLatest(id)) return
    inFlight.current = null
    if (!result.ok) {
      setPhase('read')
      if (result.error !== 'cancelled') setError({ at: 'check', message: aiFailureMessage(result.error) })
      return
    }
    setOnline(result.data)
    setPhase('result')
    setFocusTo({ target: 'result' })
  }

  // '취소'는 사라지므로 그 흐름을 시작한 곳으로 포커스를 돌린다. 둘 다 취소 뒤에도 그대로 보이는 요소다
  const cancel = () => {
    stopRequest()
    if (phase === 'reading') {
      setPhoto(null)
      setPhase('idle')
      pickerInput.current?.focus()
    } else if (phase === 'checking') {
      setPhase('read')
      checkButton.current?.focus()
    }
  }

  // 고른 상품을 바꾸거나 그 칸을 고치면 진행 중인 확인을 끊고 온라인 결과·규격 확인·비교 문장을 지운다 (PRD F31)
  const resetCheck = () => {
    if (phase === 'checking') stopRequest()
    if (phase === 'checking' || phase === 'result') setPhase('read')
    clearOnline()
  }

  const choose = (index: number) => {
    if (index === selected) return
    setSelected(index)
    resetCheck()
  }

  // 다른 줄을 누르면 규격 확인부터 다시 받는다
  const pickRow = (index: number) => {
    setPicked(index)
    setSameSpec(false)
  }

  // 단가 가격표가 아니라고 고르면 그 상품의 가격 기준을 지우고, 나타난 '온라인 가격 확인'으로 포커스를 옮긴다
  const clearBasis = (index: number) => {
    focusCheckNext.current = true
    setProducts((list) => list.map((product, i) => (i === index ? { ...product, priceBasis: null } : product)))
  }
  // 버튼이 그려진 뒤에 포커스를 옮긴다
  useEffect(() => {
    if (!focusCheckNext.current) return
    focusCheckNext.current = false
    checkButton.current?.focus()
  })

  const edit = (index: number, key: FieldKey, value: string) => {
    setProducts((list) => list.map((product, i) => (i === index ? { ...product, form: { ...product.form, [key]: value } } : product)))
    if (index === selected) resetCheck()
  }

  const view = online && phase === 'result' ? danawaRows(online) : null
  const row = view && picked !== null ? (view.rows[picked] ?? null) : null
  const spec =
    current && row ? specCheck({ name: current.form.name.trim(), sizeText: current.form.sizeText.trim(), count: countOf(current.form.count) }, row) : null
  // 매장 가격이 비면 확인 버튼이 막히고 칸을 고치면 결과가 지워지므로, 결과가 있으면 storePrice도 있다
  const lines = sameSpec && spec?.kind === 'confirm' && row && current && storePrice !== null ? compareLines(storePrice, row, current.form.priceCondition) : null
  const link = online ? httpsUrl(online.searchUrl) : null
  // 결과 제목 바로 아래 줄. 다나와를 못 읽었으면 없고, 아래의 "다나와 결과를 가져오지 못했어요."가 맨 위 줄이 된다
  const topLine = online ? resultTopLine(online.status) : null
  // 상품명이나 매장 가격이 비면 확인을 막고 무엇을 적을지 알린다 (PRD F31)
  const needName = current !== null && current.form.name.trim() === ''
  const needPrice = current !== null && storePrice === null
  const needDescribedBy = [needName ? needNameId : '', needPrice ? needPriceId : ''].filter(Boolean).join(' ') || undefined

  return (
    <div className="stack">
      <h3 className="section-title">가격표 사진</h3>
      <div className="card stack">
        {phase === 'idle' && products.length === 0 ? <div className="photo-entry-hero">
          <EmptyIllustration kind="photo" />
          <p>가격표를 찍고 상품명·매장 가격을 확인해 보세요.</p>
        </div> : null}
        {/* 찍기는 폰에서 카메라를 바로 열고, 이미 찍어 둔 사진은 앨범에서 고른다 (F31, AC224, 2026-11-03 제작자 "진짜 찍어도 작동하게") */}
        <div className="btn-row photo-pick-row">
          <PhotoPicker label="가격표 사진 찍기" capture="environment" inputRef={pickerInput} onPick={(file) => void pick(file)} />
          <PhotoPicker label="앨범에서 고르기" onPick={(file) => void pick(file)} />
        </div>
        {phase === 'idle' && products.length === 0 ? <p className="note">다나와 자동 조회는 꺼져 있을 수 있어요. 그때는 검색 링크를 보여 줘요.</p> : null}
        <p className="note">{PHOTO_NOTICE}</p>
        {photo ? <PhotoPreview file={photo} /> : null}
        {phase === 'reading' ? <Progress text="읽는 중" onCancel={cancel} /> : null}
        {error?.at === 'photo' ? (
          <p className="field-error" role="alert">
            {error.message}
          </p>
        ) : null}
      </div>

      {products.length > 0 ? (
        <section className="card stack" aria-labelledby={productsTitleId}>
          <h4 id={productsTitleId} className="card-title" tabIndex={-1} ref={productsHeading}>
            읽은 상품
          </h4>
          {notFound ? <p>상품이나 가격표를 찾지 못했어요. 다시 찍거나 직접 입력해 주세요.</p> : null}
          {/* 여러 개면 '상품명 · 가격' 카드에서 하나를 고르고, 고른 상품의 칸만 펼친다
              (2026-11-03 제작자 "고르는게 직관적이지 못해 골라야되는지 한참 찾음", 전: 상품마다 칸 6개를 모두 펼침) */}
          {products.length > 1 ? (
            <fieldset className="product-choices">
              <legend className="field-label">비교할 상품을 골라 주세요</legend>
              {products.map((product, index) => {
                const price = storePriceOf(product.form.price)
                return (
                  <label key={index} className={selected === index ? 'product-choice-card is-selected' : 'product-choice-card'}>
                    <input type="radio" name={radioName} checked={selected === index} onChange={() => choose(index)} aria-labelledby={`${radioName}-name-${index}`} aria-describedby={`${radioName}-price-${index}`} />
                    <span className="product-choice-name" id={`${radioName}-name-${index}`}>{product.readName}</span>
                    <span className="product-choice-price" id={`${radioName}-price-${index}`}>
                      {price === null ? '가격 없음' : formatWon(price)}
                    </span>
                  </label>
                )
              })}
            </fieldset>
          ) : null}
          {current && selected !== null ? <ProductFields key={selected} product={current} onEdit={(key, value) => edit(selected, key, value)} /> : null}
          {current?.priceBasis && selected !== null ? (
            <>
              <p>{unitPriceNotice(current.priceBasis)}</p>
              {/* AI가 판매가 아래 작은 단위가격 안내를 보고 잘못 고르는 일이 있어, 사용자가 되돌릴 수 있게 한다
                  (2026-11-03 제작자 "온라인비교버튼이 없어졌는데?") */}
              <div className="btn-row">
                <Button onClick={() => clearBasis(selected)}>{NOT_UNIT_PRICE}</Button>
              </div>
            </>
          ) : (
            <>
              <div className="btn-row">
                <Button ref={checkButton} disabled={storePrice === null || needName} aria-describedby={needDescribedBy} onClick={() => void check()}>
                  온라인 가격 확인
                </Button>
              </div>
              {needName ? (
                <p className="note" id={needNameId}>
                  상품명을 적어 주세요
                </p>
              ) : null}
              {needPrice ? (
                <p className="note" id={needPriceId}>
                  매장 가격을 적어 주세요
                </p>
              ) : null}
            </>
          )}
          {phase === 'checking' ? <Progress text="확인 중" onCancel={cancel} /> : null}
          {error?.at === 'check' ? (
            <p className="field-error" role="alert">
              {error.message}
            </p>
          ) : null}
        </section>
      ) : null}

      {online && phase === 'result' ? (
        <section className="card stack" aria-label="온라인 가격 확인 결과">
          <h4 className="card-title" tabIndex={-1} ref={resultHeading}>
            온라인 가격 확인 결과
          </h4>
          {topLine ? <p>{topLine}</p> : null}
          {view ? (
            <>
              <p className="field-label">{view.heading}</p>
              <ul className="plain-list">
                {view.rows.map((danawaRow, index) => (
                  <li key={index}>
                    <Button className="row-choice" aria-pressed={picked === index} onClick={() => pickRow(index)}>
                      {rowLine(danawaRow)}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {online.status === 'unavailable' ? <p>다나와 결과를 가져오지 못했어요.</p> : null}
          {online.status === 'no_results' ? <p>{NO_RESULTS_LINE}</p> : null}
          {spec?.kind === 'mismatch' ? <p>{spec.line}</p> : null}
          {spec?.kind === 'confirm' ? (
            <div className="stack">
              <p>{spec.store}</p>
              <p>{spec.online}</p>
              {spec.unknownCount ? <p className="note">{UNKNOWN_COUNT_NOTICE}</p> : null}
              <div className="btn-row">
                <Button onClick={() => setSameSpec(true)}>규격이 같아요</Button>
              </div>
            </div>
          ) : null}
          {/* 비교 문장은 "규격이 같아요"를 누른 뒤에만 나온다. 알림 칸은 미리 두어 나타날 때 읽히게 한다 */}
          <div role="status">
            {lines ? (
              <>
                <p className="price">{lines[0]}</p>
                <p className="note">{lines[1]}</p>
              </>
            ) : null}
          </div>
          {link ? (
            <p>
              <a href={link} target="_blank" rel="noopener noreferrer">
                다나와에서 직접 보기
              </a>
            </p>
          ) : null}
          <p>살지 말지 아직 모르겠다면 먼저 담아 두고 며칠 뒤 다시 생각해 보세요.</p>
          {onAdd && current && storePrice !== null ? (
            <div className="btn-row">
              <Button variant="primary" onClick={() => onAdd({ name: current.form.name.trim(), price: storePrice, url: link ?? '' })}>
                고민 목록에 담기
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  )
}

function ProductFields({ product, onEdit }: { product: Product; onEdit: (key: FieldKey, value: string) => void }) {
  const field = ({ key, label, numeric }: FieldSpec) => (
    <TextField
      key={key}
      label={label}
      inputMode={numeric ? 'numeric' : undefined}
      maxLength={key === 'name' ? MAX_NAME : undefined}
      hint={key === 'price' && product.priceUnread ? '가격을 읽지 못했어요' : undefined}
      value={product.form[key]}
      onChange={(event) => onEdit(key, event.target.value)}
    />
  )
  // 접힌 칸에 적힌 값은 버튼 이름에 붙여 열지 않아도 보이게 한다
  const filled = MORE_FIELDS.map(({ key, label }) => (product.form[key].trim() === '' ? null : `${label} ${product.form[key].trim()}`)).filter(Boolean)
  return (
    <>
      {MAIN_FIELDS.map(field)}
      <details className="button-disclosure">
        <summary className="field-label">{filled.length > 0 ? `규격·조건 고치기 · ${filled.join(' · ')}` : '규격·조건 고치기 (선택)'}</summary>
        <div className="stack">{MORE_FIELDS.map(field)}</div>
      </details>
    </>
  )
}
