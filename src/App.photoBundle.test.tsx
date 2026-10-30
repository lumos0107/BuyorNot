import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { TagItem } from './ai/types'
import { aiReply, mockAiServer, mockImagePipeline, mockObjectUrls, nextTask, type MockAiServer } from './test/aiMocks'

// PRD F32 두 상품 사진으로 묶음 비교 채우기 (AC55·AC56)와 10장 "앱 공통"의 사진 규칙(안내·대기 상한·취소·늦은 응답·숨은 화면·미리보기).
// 칸 값·확인 상자 문장의 계산은 src/logic/bundleFill.test.ts가 보고, 이 파일은 화면의 흐름과 동작을 본다.
// 계획 Task 11의 테스트 이름은 해당 it 위 `// plan:` 주석에 있다.
// 메뉴를 옮겨 다니는 시험(숨은 화면 포커스)이 있어 가격 비교 화면만이 아니라 App 전체를 그린다.
// 서버·사진·미리보기 주소 흉내는 src/test/aiMocks.ts의 것만 쓴다. 60초 상한과 "시간이 지나도 다시 보내지 않음" 시험만
// 가짜 setTimeout을 쓰므로(userEvent·waitFor·findBy가 멈춤) 사진·버튼 조작은 fireEvent와 settle()로 한다.
//
// PRD·계획에 글이 없어 정한 이름·값(가정):
// - 가정: 확인 상자는 접근 가능한 이름이 PRD가 부르는 이름 그대로 "확인 상자"인 묶음(role=group)이다.
// - 가정: 진행 문구는 사진을 읽는 동안 "읽는 중"(role=status). F31과 같다.
// - 가정: 상품이 여러 개면 라디오 이름은 읽은 상품명이다. 하나면 라디오 없이 그 상품을 고른 것으로 본다(F31과 같다).
// - 가정: 사진 미리보기는 alt가 빈 <img>이고 읽는 중과 확인 상자가 열려 있는 동안 보인다. 닫히면 주소를 해제한다.
// - 가정: 읽기가 끝나 확인 상자가 나타나면 확인 상자로 포커스를 옮긴다(보이는 화면이고, 포커스가 그 카드의 사진 흐름에 있거나 어디에도
//   없을 때만. 숨은 화면이거나 다른 칸에 적는 중이면 옮기지 않는다).
// - 가정: AC55 사례 3~6의 가격은 결과를 가르지 않는 4500, 사례 5의 포장 표기는 '6개입', 사례 6의 포장 표기는 '900'이다.
// - 가정: 상품을 하나도 못 찾았을 때 F32에는 문장이 없어 F31의 "상품이나 가격표를 찾지 못했어요…"를 쓴다.

// ---------------------------------------------------------------- PRD 문장 (글자 그대로)

const PHOTO_NOTICE =
  '사진은 읽기 위해 Google Gemini로 보내져요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있으니 얼굴이나 개인정보가 담기지 않게 해 주세요.'
const DECODE_FAILED = '이 사진을 열 수 없어요. 다른 사진을 고르거나 직접 입력해 주세요.'
const BUSY = '지금은 사용이 많아요. 잠시 뒤 다시 해 주세요.'
const PAUSED = 'AI 기능을 잠시 멈췄어요. 직접 입력해 주세요.'
const UNREADABLE = '지금은 읽지 못했어요. 직접 입력해 주세요.'
// PRD F32 단가 거절 (판정 R29-I2, AC73). 문장의 '100g'·'100mL' 자리는 읽은 priceBasis다
const UNIT_PRICE = 'AI가 이 가격을 100g당 가격으로 읽었어요. 묶음 전체 가격이 아니라서 채우지 않았어요. 사려는 묶음의 전체 가격과 용량·개수를 직접 입력해 주세요.'
const UNIT_PRICE_ML = 'AI가 이 가격을 100mL당 가격으로 읽었어요. 묶음 전체 가격이 아니라서 채우지 않았어요. 사려는 묶음의 전체 가격과 용량·개수를 직접 입력해 주세요.'
const NOT_FOUND = '상품이나 가격표를 찾지 못했어요. 다시 찍거나 직접 입력해 주세요.'
const FILL_BUTTON = '사진으로 채우기'

// 가정한 이름 (위 목록)
const READING = '읽는 중'
const BOX = '확인 상자'

// ---------------------------------------------------------------- 응답 견본 (서버가 돌려주는 모양: 칸이 모두 있다)

const BLANK: TagItem = {
  name: '세탁 세제',
  brand: null,
  price: null,
  priceCondition: null,
  regularPrice: null,
  priceBasis: null,
  sizeText: null,
  size: null,
  unit: null,
  count: null,
  tagReadable: true,
}
const item = (over: Partial<TagItem>): TagItem => ({ ...BLANK, ...over })

// AC55 사례 1: 가격 9900·개당 2.5·L·1개·표기 '2.5L'
const ITEM_L = item({ price: 9900, size: 2.5, unit: 'L', count: 1, sizeText: '2.5L' })
// AC55 사례 3: 4500·개당 1.5·g·50개·'75g(1.5g×50)'
const ITEM_TEA = item({ name: '티백', price: 4500, size: 1.5, unit: 'g', count: 50, sizeText: '75g(1.5g×50)' })
// AC55 사례 4: 개수 null·용량 75g·'75g'
const ITEM_NO_COUNT = item({ price: 4500, size: 75, unit: 'g', count: null, sizeText: '75g' })
// AC55 사례 5: 단위 '개'(6개, 용량 없음)
const ITEM_EA = item({ price: 4500, size: null, unit: 'ea', count: 6, sizeText: '6개입' })
// AC55 사례 6: 단위 null·용량 900
const ITEM_NO_UNIT = item({ price: 4500, size: 900, unit: null, count: null, sizeText: '900' })
// AC56 사례 1: 단가 가격표('100g')
const ITEM_UNIT_PRICE = item({ name: '세제 단가표', price: 430, priceBasis: '100g' })
// AC73 사례 1: 단가 가격표(가격 6480, priceBasis '100mL', 355mL·6개). 가정: 포장 표기 '355mL×6'은 결과를 가르지 않는다
const ITEM_UNIT_PRICE_ML = item({ price: 6480, priceBasis: '100mL', size: 355, unit: 'mL', count: 6, sizeText: '355mL×6' })

const readTag = (...items: TagItem[]) => aiReply.ok({ items, note: null })

// ---------------------------------------------------------------- 준비·정리

const BASE = 'https://ai.test'
const READ = '/api/read-tag'

type Setup = { server: MockAiServer; urls: ReturnType<typeof mockObjectUrls> }
let current: Setup | null = null

function setup(pipeline: { decode?: 'ok' | 'fail'; toBlob?: 'ok' | 'null' } = {}): Setup {
  localStorage.clear()
  vi.stubEnv('VITE_AI_SERVER_URL', BASE)
  const server = mockAiServer(BASE)
  mockImagePipeline({ decode: pipeline.decode ?? 'ok', toBlob: pipeline.toBlob ?? 'ok' })
  current = { server, urls: mockObjectUrls() }
  return current
}

afterEach(() => {
  // 순서: cleanup() → 미리보기 주소·요청 단언 → 가짜 전역 되돌리기(먼저 되돌리면 언마운트 때 jsdom에 없는 URL.revokeObjectURL을 부른다)
  try {
    cleanup()
    if (current) {
      expectPreviewUrlsHealthy(current.urls)
      expect(current.urls.revoked.toSorted(), '화면이 사라졌는데 해제하지 않은 주소').toEqual(current.urls.created.toSorted())
      expect(current.server.unexpected, '등록하지 않았거나 다 쓴 요청').toEqual([])
    }
  } finally {
    current = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  }
})

// 요청·응답 사이의 비동기 연결(promise, jsdom 작업)을 act 안에서 흘려 보낸다
async function settle(turns = 10) {
  for (let i = 0; i < turns; i += 1) {
    await act(async () => {
      await nextTask()
    })
  }
}
async function sent(n = 1) {
  await act(async () => {
    await current?.server.waitForCalls(READ, n)
  })
  await settle()
}
// 60초 상한 시험용. 이 파일에서 가짜 타이머는 setTimeout·clearTimeout만 바꾼다
const fakeClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
  await settle()
}

// ---------------------------------------------------------------- 화면 조작·조회

const A = '상품 A'
const B = '상품 B'

const bundlePanel = () => within(screen.getByRole('tabpanel', { name: '묶음상품 비교' }))
const cardEl = (name: string) => bundlePanel().getByRole('group', { name })
const card = (name: string) => within(cardEl(name))
const photoInput = (name: string) => card(name).getByLabelText(FILL_BUTTON)
const boxEl = (name: string) => card(name).getByRole('group', { name: BOX })
const box = (name: string) => within(boxEl(name))
const queryBox = (name: string) => card(name).queryByRole('group', { name: BOX })
const confirmButton = (name: string) => box(name).getByRole('button', { name: '채우기' })
const result = () => within(bundlePanel().getByRole('region', { name: '묶음상품 비교 결과' }))
const queryResult = () => bundlePanel().queryByRole('region', { name: '묶음상품 비교 결과' })

type CardValues = { price: string; unit: string; size: string | null; count: string }
// 카드의 단위 칸. 확인 상자가 열려 단위 선택이 하나 더 있어도 카드 것만 고른다
const cardUnit = (name: string) =>
  card(name)
    .getAllByLabelText('단위')
    .find((select) => select.closest('[role="group"]')?.getAttribute('aria-label') !== BOX) as HTMLSelectElement
// 카드의 네 칸 값. 단위가 개면 용량 칸이 없어 null
function values(name: string): CardValues {
  const c = card(name)
  const input = (label: string) => (c.getByLabelText(label) as HTMLInputElement).value
  const size = c.queryByLabelText('개당 무게·용량') as HTMLInputElement | null
  return { price: input('가격'), unit: cardUnit(name).value, size: size?.value ?? null, count: input('묶음 개수') }
}
// 칸에 직접 적는다(단위부터 정해야 용량 칸이 나온다)
function enter(name: string, v: Partial<{ price: string; unit: string; size: string; count: string }>) {
  const c = card(name)
  const change = (element: HTMLElement, value: string) => fireEvent.change(element, { target: { value } })
  if (v.unit !== undefined) change(cardUnit(name), v.unit)
  if (v.price !== undefined) change(c.getByLabelText('가격'), v.price)
  if (v.size !== undefined) change(c.getByLabelText('개당 무게·용량'), v.size)
  if (v.count !== undefined) change(c.getByLabelText('묶음 개수'), v.count)
}

function goTo(tab: string) {
  fireEvent.click(screen.getByRole('tab', { name: tab }))
}
function openBundle() {
  const view = render(<App />)
  goTo('가격 비교')
  goTo('묶음상품 비교')
  return view
}
function choosePhoto(name: string, fileName = 'tag.jpg') {
  const file = new File(['photo-bytes'], fileName, { type: 'image/jpeg' })
  fireEvent.change(photoInput(name), { target: { files: [file] } })
  return file
}
// 사진을 고르고 n번째 읽기 요청이 갈 때까지 흘려 보낸다(답은 미리 server.on(READ, …)로 둔다)
async function readPhoto(name: string, n = 1) {
  choosePhoto(name)
  await sent(n)
}
// 상품 하나를 읽어 확인 상자까지 연 상태
async function openBox(name: string, ...items: TagItem[]) {
  const s = setup()
  s.server.on(READ, readTag(...items))
  openBundle()
  await readPhoto(name)
  return s
}

// 미리보기 주소 규칙: 보이는 것은 해제하지 않고, 더 안 보이면 해제했고, 같은 주소를 두 번 해제하지 않는다
const previews = () => Array.from(document.querySelectorAll('img')).map((img) => img.getAttribute('src') ?? '')
function expectPreviewUrlsHealthy(urls: Setup['urls']) {
  const shown = previews()
  expect(urls.revoked.filter((url) => shown.includes(url)), '보이는 미리보기 주소를 해제했어요').toEqual([])
  expect(urls.created.filter((url) => !urls.revoked.includes(url) && !shown.includes(url)), '더 쓰지 않는데 해제하지 않은 주소').toEqual([])
  expect(urls.revoked.length, '같은 주소를 두 번 해제했어요').toBe(new Set(urls.revoked).size)
  expect(urls.revoked.filter((url) => !urls.created.includes(url)), '만들지 않은 주소를 해제했어요').toEqual([])
}

// 숨은 패널은 접근 가능한 이름으로 찾을 수 없어 탭의 aria-controls로 찾는다
function panelOf(tab: string): HTMLElement {
  const id = screen.getByRole('tab', { name: tab }).getAttribute('aria-controls')
  const element = id === null ? null : document.getElementById(id)
  if (element === null) throw new Error(`${tab} 패널을 찾지 못했어요`)
  return element
}
// focus()가 불린 요소 가운데 container 안에 있는 것
const focusedInside = (spy: { mock: { contexts: unknown[] } }, container: HTMLElement) =>
  spy.mock.contexts.filter((el): el is Node => el instanceof Node && container.contains(el))

// ================================================================ 서버 주소와 전송 안내 (10장 앱 공통 · AC61)

describe('사진으로 채우기 버튼과 전송 안내 (10장 앱 공통)', () => {
  it.each([
    ['빈', ''],
    ['없는', undefined],
  ])('AC61: 서버 주소가 %s 빌드에는 두 카드 모두 사진으로 채우기·안내가 없고 서버 요청도 없다', (_name, value) => {
    localStorage.clear()
    vi.stubEnv('VITE_AI_SERVER_URL', value)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    openBundle()

    expect(screen.queryByLabelText(FILL_BUTTON)).not.toBeInTheDocument()
    expect(screen.queryByText(PHOTO_NOTICE)).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it.each([A, B])('서버 주소가 있으면 %s 카드 제목 아래 사진으로 채우기가 있고, 바로 아래 전송 안내가 누르기 전부터 보인다', (name) => {
    const s = setup()
    openBundle()

    const input = photoInput(name)
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/*')
    // PRD F31 "갤러리에서 고르기도 됨" — capture가 있으면 폰에서 카메라만 열림(총괄 판정 R7)
    expect(input).not.toHaveAttribute('capture')
    // 같은 이름의 버튼이 두 개라 어느 카드의 것인지 설명으로 구분한다
    expect(input).toHaveAccessibleDescription(name)
    const label = input.closest('label')
    expect(label).toHaveTextContent(FILL_BUTTON)
    const notice = card(name).getByText(PHOTO_NOTICE)
    expect(notice).toBeVisible()
    // 버튼(레이블) 바로 다음이 안내다
    expect(label?.nextElementSibling).toBe(notice)
    // 카드 제목(legend) 다음이 사진으로 채우기다
    expect(cardEl(name).querySelector('legend')?.nextElementSibling).toContainElement(input)
    expect(s.server.calls).toHaveLength(0)
  })

  it('고른 사진을 줄인 JPEG로 /api/read-tag에 한 번 보내고, 읽는 동안 진행 문구(role=status)와 취소를 보인다', async () => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(READ, held)
    openBundle()

    await readPhoto(B)

    // 가짜 canvas가 만든 JPEG 4바이트(ff d8 ff e0)의 base64. 원래 사진('photo-bytes')이 아니다
    expect(s.server.callsTo(READ).map((call) => call.body)).toEqual([{ image: btoa('\xff\xd8\xff\xe0'), mimeType: 'image/jpeg' }])
    expect(card(B).getByRole('status')).toHaveTextContent(READING)
    expect(card(B).getByRole('button', { name: '취소' })).toBeInTheDocument()
    // 읽는 동안 다른 카드는 조용하다
    expect(card(A).queryByRole('status')).not.toBeInTheDocument()

    held.release(readTag(ITEM_L))
    await settle()

    expect(card(B).queryByText(READING)).not.toBeInTheDocument()
    expect(queryBox(B)).toBeInTheDocument()
  })

  it('같은 사진을 다시 골라도 다시 읽는다(요청 2번)', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_L), readTag(ITEM_L))
    openBundle()
    // userEvent.upload는 같은 파일이 이미 골라져 있으면 change를 보내지 않는다(브라우저와 같음). 고른 뒤 값을 비워야 다시 읽힌다
    const user = userEvent.setup()
    const file = new File(['photo-bytes'], 'tag.jpg', { type: 'image/jpeg' })

    await user.upload(photoInput(B), file)
    await sent(1)
    await user.upload(photoInput(B), file)
    await sent(2)

    expect(s.server.callsTo(READ)).toHaveLength(2)
    expect(box(B).getByText('AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
  })

  it.each([
    ['브라우저가 열 수 없는 사진', 'fail', 'ok'],
    ['JPEG로 다시 그리지 못한 사진', 'ok', 'null'],
  ] as const)('%s이면 "이 사진을 열 수 없어요…"를 알리고 서버에 보내지 않는다', async (_name, decode, toBlob) => {
    const s = setup({ decode, toBlob })
    openBundle()

    choosePhoto(B)
    await settle()

    expect(card(B).getByRole('alert')).toHaveTextContent(DECODE_FAILED)
    expect(s.server.calls).toHaveLength(0)
    expect(card(B).queryByText(READING)).not.toBeInTheDocument()
    expect(queryBox(B)).not.toBeInTheDocument()
    // 열 수 없는 사진의 미리보기는 남기지 않는다(주소는 afterEach가 해제됐는지 본다)
    expect(previews()).toEqual([])
  })
})

// ================================================================ AC55 읽은 값을 확인하고 채우기

describe('읽은 값을 확인 상자에서 확인하고 채운다 (AC55)', () => {
  // plan: AC55 일곱 경우
  it('AC55: 상품 B에 9900·개당 2.5·L·1개·표기 2.5L을 읽으면 확인 상자를 보이고, 채우기를 누르면 B 칸이 9900·L·2.5·1이 되어 결과가 다시 계산되고 가격 칸에 포커스가 간다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_L))
    openBundle()
    // 앱은 예시 값(A 18,900원·3L×2 / B 9,900원·2.5L×1)이 채워진 채 시작한다. B를 다른 값으로 바꿔 두어
    // 채운 뒤 결과가 다시 계산되는 것을 본다
    enter(B, { price: '5000' })
    expect(result().getByText('200.00원')).toBeInTheDocument()
    expect(result().getByText('상품 B의 단가가 36.5% 더 낮아요')).toBeInTheDocument()

    await readPhoto(B)

    // 확인 상자: 읽은 내용과 채울 값. 하나라서 라디오도 단위 선택도 없다. 누르기 전에는 칸이 그대로다
    expect(box(B).getByText('AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
    expect(box(B).getByText('채울 값: 가격 9,900원 · 2.5L × 1개')).toBeInTheDocument()
    expect(box(B).queryAllByRole('radio')).toHaveLength(0)
    expect(box(B).queryByLabelText('단위')).not.toBeInTheDocument()
    expect(confirmButton(B)).toBeEnabled()
    expect(values(B)).toEqual({ price: '5000', unit: 'L', size: '2.5', count: '1' })
    expect(result().getByText('200.00원')).toBeInTheDocument()

    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '9900', unit: 'L', size: '2.5', count: '1' })
    expect(queryBox(B)).not.toBeInTheDocument()
    expect(result().getByText('396.00원')).toBeInTheDocument()
    expect(result().getByText('상품 A의 단가가 20.5% 더 낮아요')).toBeInTheDocument()
    expect(card(B).getByLabelText('가격')).toHaveFocus()
    // 상품 A는 건드리지 않는다
    expect(values(A)).toEqual({ price: '18900', unit: 'L', size: '3', count: '2' })
  })

  it('AC55: 확인 상자에서 취소하면 칸이 그대로이고 "사진으로 채우기"에 포커스가 간다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_L))
    openBundle()
    // 상품 A(L)와 같은 종류의 단위(mL)로 적어 두어 처음부터 오류 표시가 없다
    enter(B, { unit: 'mL', price: '1234', size: '400', count: '3' })
    const before = values(B)
    expect(cardEl(B).querySelector('[aria-invalid="true"]')).toBeNull()

    await readPhoto(B)
    expect(values(B)).toEqual(before)
    fireEvent.click(box(B).getByRole('button', { name: '취소' }))

    expect(queryBox(B)).not.toBeInTheDocument()
    expect(values(B)).toEqual(before)
    expect(photoInput(B)).toHaveFocus()
    expect(photoInput(A)).not.toHaveFocus()
    // 채운 것이 아니므로 칸에 오류 표시도 생기지 않는다
    expect(cardEl(B).querySelector('[aria-invalid="true"]')).toBeNull()
    expect(previews()).toEqual([])
  })

  it('AC55: 응답 4500·개당 1.5·g·50개·"75g(1.5g×50)"을 채우면 B 칸이 4500·g·1.5·50이 된다', async () => {
    await openBox(B, ITEM_TEA)
    expect(box(B).getByText('AI가 읽은 내용: ‘티백’ · ‘75g(1.5g×50)’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
    expect(box(B).getByText('채울 값: 가격 4,500원 · 1.5g × 50개')).toBeInTheDocument()

    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '4500', unit: 'g', size: '1.5', count: '50' })
  })

  it('AC55: 개수 null·용량 75g·"75g"을 채우면 75·g·1이 되고 확인 상자에 "× 1개(계산용 1묶음)"이 적힌다', async () => {
    await openBox(B, ITEM_NO_COUNT)
    expect(box(B).getByText('채울 값: 가격 4,500원 · 75g × 1개(계산용 1묶음)')).toBeInTheDocument()

    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '4500', unit: 'g', size: '75', count: '1' })
  })

  it('AC55: 단위 "개"(6개, 용량 없음)를 채우면 단위 개·개수 6이 되고 확인 상자에 "가격 4,500원 · 6개"가 적힌다. 전에 있던 용량은 지운다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_EA))
    openBundle()
    enter(B, { unit: 'g', price: '700', size: '250', count: '2' })

    await readPhoto(B)
    expect(box(B).getByText('AI가 읽은 내용: ‘세탁 세제’ · ‘6개입’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
    expect(box(B).getByText('채울 값: 가격 4,500원 · 6개')).toBeInTheDocument()
    fireEvent.click(confirmButton(B))

    // 단위가 개면 용량 칸이 없다
    expect(values(B)).toEqual({ price: '4500', unit: 'ea', size: null, count: '6' })
    // 그 칸의 기존 값(250)도 지웠다: 단위를 g로 돌리면 용량 칸이 비어 있다
    enter(B, { unit: 'g' })
    expect(values(B)).toEqual({ price: '4500', unit: 'g', size: '', count: '6' })
  })

  it('AC55: 단위 null·용량 900이면 확인 상자에서 g를 고르기 전에는 채우기가 막히고, 고른 뒤 채우면 900·g이 된다', async () => {
    await openBox(B, ITEM_NO_UNIT)
    expect(box(B).getByText('채울 값: 가격 4,500원 · 900(단위 모름) × 1개(계산용 1묶음)')).toBeInTheDocument()
    expect(confirmButton(B)).toBeDisabled()

    fireEvent.change(box(B).getByLabelText('단위'), { target: { value: 'g' } })

    expect(confirmButton(B)).toBeEnabled()
    fireEvent.click(confirmButton(B))
    expect(values(B)).toEqual({ price: '4500', unit: 'g', size: '900', count: '1' })
  })

  it('AC55: 상품 A를 채우면 상품 A 칸만 바뀌고 상품 B 칸은 그대로다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_L))
    openBundle()
    // 가정: 두 상품의 단위 종류가 같아야 채운 뒤 오류가 없어 가격 칸으로 포커스가 간다(종류가 다르면 위의 단위 칸 시험)
    enter(B, { unit: 'mL', price: '1234', size: '400', count: '3' })
    const beforeB = values(B)
    expect(beforeB).toEqual({ price: '1234', unit: 'mL', size: '400', count: '3' })

    await readPhoto(A)
    // 읽는 카드는 A뿐이다
    expect(queryBox(B)).not.toBeInTheDocument()
    expect(s.server.callsTo(READ)).toHaveLength(1)
    fireEvent.click(confirmButton(A))

    expect(values(A)).toEqual({ price: '9900', unit: 'L', size: '2.5', count: '1' })
    expect(card(A).getByLabelText('가격')).toHaveFocus()
    expect(values(B)).toEqual(beforeB)
    // B에는 오류 표시도 새로 생기지 않았다
    expect(cardEl(B).querySelector('[aria-invalid="true"]')).toBeNull()
  })

  it('B 카드를 채워도 상품 A 칸은 그대로다(두 카드는 서로 모른다)', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_TEA))
    openBundle()
    enter(A, { unit: 'g', price: '2000', size: '100', count: '10' })
    const beforeA = values(A)

    await readPhoto(B)
    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '4500', unit: 'g', size: '1.5', count: '50' })
    expect(values(A)).toEqual(beforeA)
    expect(card(B).getByLabelText('가격')).toHaveFocus()
  })

  it('AC55: 채울 상품이 B와 다른 종류의 단위(g)이고 A는 부피 단위이면, 오류가 표시된 B의 단위 칸으로 포커스가 간다', async () => {
    // 가정: PRD는 "오류가 있는 첫 칸(없으면 가격 칸)"으로 옮긴다고만 적는다. 두 상품의 단위 종류가 다르면(F05) 두 단위 칸이
    // aria-invalid이므로, 가격 칸이 멀쩡할 때 B의 단위 칸이 그 첫 칸이다
    await openBox(B, ITEM_TEA)

    fireEvent.click(confirmButton(B))

    expect(card(B).getByLabelText('단위')).toHaveAttribute('aria-invalid', 'true')
    expect(card(B).getByLabelText('가격')).not.toHaveAttribute('aria-invalid')
    expect(card(B).getByLabelText('단위')).toHaveFocus()
  })

  it('읽기가 끝나 확인 상자가 나타나면 확인 상자로 포커스를 옮긴다', async () => {
    // 가정: 읽는 중에 포커스가 있던 취소 버튼이 사라지므로 확인 상자로 옮긴다(숨은 화면에서 끝나면 옮기지 않는 시험은 아래)
    await openBox(B, ITEM_L)

    expect(boxEl(B)).toHaveFocus()
  })

  it('읽는 중에 사용자가 다른 칸에 적고 있으면 읽기가 끝나도 포커스를 빼앗지 않는다', async () => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    openBundle()
    await readPhoto(B)
    const price = card(A).getByLabelText('가격')
    price.focus()

    held.release(readTag(ITEM_L))
    await settle()

    expect(queryBox(B)).toBeInTheDocument()
    expect(price).toHaveFocus()
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('상품 A·B를 한 화면에서 차례로 읽어 각자 채울 수 있다(요청 2번)', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_L), readTag(ITEM_TEA))
    openBundle()

    await readPhoto(A, 1)
    fireEvent.click(confirmButton(A))
    await readPhoto(B, 2)
    fireEvent.click(confirmButton(B))

    expect(values(A)).toEqual({ price: '9900', unit: 'L', size: '2.5', count: '1' })
    expect(values(B)).toEqual({ price: '4500', unit: 'g', size: '1.5', count: '50' })
    expect(s.server.callsTo(READ)).toHaveLength(2)
  })
})

// ================================================================ AC56 단가 가격표 · 모두 모름 · 상품 여러 개

describe('단가 가격표, 모두 모르는 값, 상품 여러 개 (AC56)', () => {
  // plan: AC56 세 경우
  it('AC56·AC73: 단가 가격표(100g)를 읽으면 칸은 그대로이고 "AI가 이 가격을 100g당 가격으로 읽었어요…"를 보이며 채우기가 없다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_UNIT_PRICE))
    openBundle()
    enter(B, { unit: 'kg', price: '1234', size: '4', count: '3' })
    const before = values(B)

    await readPhoto(B)

    expect(box(B).getByText(UNIT_PRICE)).toBeInTheDocument()
    // 채울 값을 만들지 않는다
    expect(box(B).queryByText(/^채울 값:/)).not.toBeInTheDocument()
    expect(box(B).queryByText(/^읽은 내용:/)).not.toBeInTheDocument()
    expect(box(B).queryByRole('button', { name: '채우기' })).toBeNull()
    expect(values(B)).toEqual(before)

    fireEvent.click(box(B).getByRole('button', { name: '취소' }))

    expect(values(B)).toEqual(before)
    expect(photoInput(B)).toHaveFocus()
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('AC73: 100mL당 단가 가격표(6480원·355mL·6개)면 새 문장과 취소만 보이고 칸은 그대로다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_UNIT_PRICE_ML))
    openBundle()
    enter(B, { unit: 'kg', price: '1234', size: '4', count: '3' })
    const before = values(B)

    await readPhoto(B)

    // 문장의 '100mL' 자리는 응답의 priceBasis다
    expect(box(B).getByText(UNIT_PRICE_ML)).toBeInTheDocument()
    expect(box(B).queryByText(UNIT_PRICE)).not.toBeInTheDocument()
    // 상자의 버튼은 '취소'뿐이다('채우기' 없음). 채울 값 줄도 없다
    expect(box(B).getAllByRole('button').map((button) => button.textContent)).toEqual(['취소'])
    expect(box(B).queryByRole('button', { name: '채우기' })).toBeNull()
    expect(box(B).queryByText(/^채울 값:/)).not.toBeInTheDocument()
    expect(values(B)).toEqual(before)
    // 옛 문장은 없다
    expect(card(B).queryByText(/가격표라 묶음 비교에 넣지 않았어요/)).not.toBeInTheDocument()
  })

  it('AC73: 그 상자에서 취소하면 사진으로 채우기로 포커스가 돌아간다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_UNIT_PRICE_ML))
    openBundle()
    enter(B, { unit: 'kg', price: '1234', size: '4', count: '3' })
    const before = values(B)
    await readPhoto(B)

    fireEvent.click(box(B).getByRole('button', { name: '취소' }))

    expect(queryBox(B)).not.toBeInTheDocument()
    expect(values(B)).toEqual(before)
    expect(photoInput(B)).toHaveFocus()
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('AC56: 가격·개수·용량이 모두 null이고 단위를 읽었으면, 채우면 가격·용량·개수 칸을 비우고 오류를 표시하며 가격 칸에 포커스가 간다', async () => {
    // 가정: AC가 단위를 적지 않았다. 단위를 읽은 경우(g)와 못 읽은 경우(아래 시험)를 모두 본다
    const s = setup()
    s.server.on(READ, readTag(item({ unit: 'g' })))
    openBundle()
    enter(A, { unit: 'g' })
    enter(B, { unit: 'g', price: '1234', size: '4', count: '3' })

    await readPhoto(B)
    expect(box(B).getByText('채울 값: 가격 모름 · 모름 × 모름')).toBeInTheDocument()
    expect(confirmButton(B)).toBeEnabled()
    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '', unit: 'g', size: '', count: '' })
    expect(card(B).getByText('가격을 숫자로 입력해 주세요')).toBeInTheDocument()
    expect(card(B).getByText('개당 용량을 숫자로 입력해 주세요')).toBeInTheDocument()
    expect(card(B).getByText('묶음 개수를 정수로 입력해 주세요')).toBeInTheDocument()
    expect(card(B).getByLabelText('가격')).toHaveAttribute('aria-invalid', 'true')
    expect(card(B).getByLabelText('가격')).toHaveFocus()
    // 상품 B가 비어 결과는 없다
    expect(queryResult()).not.toBeInTheDocument()
  })

  it('AC56: 가격·개수·용량과 단위까지 모두 null이면 단위를 고른 뒤에야 채울 수 있고, 채우면 세 칸을 비우고 가격 칸에 포커스가 간다', async () => {
    const s = setup()
    s.server.on(READ, readTag(BLANK))
    openBundle()
    enter(B, { unit: 'g', price: '1234', size: '4', count: '3' })

    await readPhoto(B)
    expect(confirmButton(B)).toBeDisabled()
    expect(box(B).getByText('채울 값: 가격 모름 · 모름 × 모름')).toBeInTheDocument()
    fireEvent.change(box(B).getByLabelText('단위'), { target: { value: 'g' } })
    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '', unit: 'g', size: '', count: '' })
    expect(card(B).getByText('가격을 숫자로 입력해 주세요')).toBeInTheDocument()
    expect(card(B).getByText('개당 용량을 숫자로 입력해 주세요')).toBeInTheDocument()
    expect(card(B).getByText('묶음 개수를 정수로 입력해 주세요')).toBeInTheDocument()
    expect(card(B).getByLabelText('가격')).toHaveFocus()
  })

  it('AC56: 상품이 2개이면 라디오 2개를 보이고 하나를 고르기 전에는 채우기가 막히며, 고른 상품의 값만 채운다', async () => {
    await openBox(B, ITEM_L, ITEM_TEA)

    const radios = box(B).getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(0)
    expect(confirmButton(B)).toBeDisabled()
    // 고르기 전에는 어느 상품의 확인 문장도 없다
    expect(box(B).queryByText(/^채울 값:/)).not.toBeInTheDocument()

    fireEvent.click(box(B).getByRole('radio', { name: ITEM_TEA.name }))

    expect(box(B).getByRole('radio', { name: ITEM_TEA.name })).toBeChecked()
    expect(box(B).getByText('채울 값: 가격 4,500원 · 1.5g × 50개')).toBeInTheDocument()
    expect(confirmButton(B)).toBeEnabled()

    // 다른 상품으로 바꾸면 그 상품의 확인 문장으로 바뀐다
    fireEvent.click(box(B).getByRole('radio', { name: ITEM_L.name }))
    expect(box(B).getByText('채울 값: 가격 9,900원 · 2.5L × 1개')).toBeInTheDocument()
    expect(box(B).queryByText('채울 값: 가격 4,500원 · 1.5g × 50개')).not.toBeInTheDocument()

    fireEvent.click(box(B).getByRole('radio', { name: ITEM_TEA.name }))
    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '4500', unit: 'g', size: '1.5', count: '50' })
  })

  it('AC56·AC73: 고른 상품이 단가 가격표이면 채우기가 없고, 채울 수 있는 상품으로 바꾸면 다시 보인다', async () => {
    await openBox(B, ITEM_UNIT_PRICE, ITEM_L)

    fireEvent.click(box(B).getByRole('radio', { name: ITEM_UNIT_PRICE.name }))
    expect(box(B).getByText(UNIT_PRICE)).toBeInTheDocument()
    expect(box(B).queryByRole('button', { name: '채우기' })).toBeNull()

    fireEvent.click(box(B).getByRole('radio', { name: ITEM_L.name }))
    expect(box(B).queryByText(UNIT_PRICE)).not.toBeInTheDocument()
    expect(confirmButton(B)).toBeEnabled()
    // AC73: 채울 수 있는 상품으로 바꾸면 "채울 값:"으로 시작하는 줄도 다시 보인다
    expect(box(B).getByText(/^채울 값:/)).toBeInTheDocument()
  })

  it('상품을 하나도 못 찾으면 "상품이나 가격표를 찾지 못했어요…"를 보이고 확인 상자도 칸 변경도 없다', async () => {
    const s = setup()
    s.server.on(READ, readTag())
    openBundle()
    enter(B, { unit: 'kg', price: '1234', size: '4', count: '3' })
    const before = values(B)

    await readPhoto(B)

    expect(card(B).getByText(NOT_FOUND)).toBeInTheDocument()
    expect(queryBox(B)).not.toBeInTheDocument()
    expect(card(B).queryByText(READING)).not.toBeInTheDocument()
    expect(values(B)).toEqual(before)
    expect(previews()).toEqual([])
  })
})

// ================================================================ AC77 확인 상자 첫 줄이 상자의 설명

describe('확인 상자 첫 줄은 AI가 읽은 내용이고 상자의 설명이다 (AC77)', () => {
  const FIRST_L = 'AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요'
  const FIRST_TEA = 'AI가 읽은 내용: ‘티백’ · ‘75g(1.5g×50)’ · 사진과 같은지 확인해 주세요'
  const FIRST_NO_LABEL = 'AI가 읽은 내용: ‘세탁 세제’ · 포장 표기 없음 · 사진과 같은지 확인해 주세요'
  // 설명으로 이은 요소가 있으면 그 요소를 돌려준다(없으면 null)
  const describedElement = (name: string) => {
    const id = boxEl(name).getAttribute('aria-describedby')
    return id === null ? null : document.getElementById(id)
  }

  it('AC77: 상품 B를 읽으면 확인 상자 첫 줄이 AI가 읽은 내용이고 상자의 설명도 같은 문장이다', async () => {
    await openBox(B, ITEM_L)

    expect(box(B).getByText(FIRST_L)).toBeInTheDocument()
    expect(boxEl(B)).toHaveAccessibleDescription(FIRST_L)
    // 상자 이름은 그대로 '확인 상자'다
    expect(boxEl(B)).toHaveAccessibleName(BOX)
    expect(box(B).queryByText(/^읽은 내용:/)).not.toBeInTheDocument()
    // 설명으로 이은 요소는 알림 칸의 첫 줄 그 자체다
    expect(describedElement(B)).toBe(box(B).getByRole('status').firstElementChild)
  })

  it('AC77: 포장 표기가 없으면 첫 줄과 상자 설명에서 포장 표기 없음이 따옴표 밖에 있다', async () => {
    await openBox(B, item({ price: 9900, size: 2.5, unit: 'L', count: 1, sizeText: null }))

    expect(box(B).getByText(FIRST_NO_LABEL)).toBeInTheDocument()
    expect(boxEl(B)).toHaveAccessibleDescription(FIRST_NO_LABEL)
    expect(box(B).queryByText(/‘포장 표기 없음’/)).not.toBeInTheDocument()
  })

  it('AC77: 단가 가격표면 상자의 설명이 AC73 거절 문장이다', async () => {
    await openBox(B, ITEM_UNIT_PRICE_ML)

    expect(box(B).getByText(UNIT_PRICE_ML)).toBeInTheDocument()
    expect(boxEl(B)).toHaveAccessibleDescription(UNIT_PRICE_ML)
    expect(boxEl(B)).toHaveAccessibleName(BOX)
    expect(describedElement(B)).toBe(box(B).getByRole('status').firstElementChild)
    // 거절한 상자에는 'AI가 읽은 내용' 줄이 없다
    expect(box(B).queryByText(/읽은 내용:/)).not.toBeInTheDocument()
  })

  it('AC77: 상품이 둘이면 고르기 전에는 상자 설명이 없고, 고르면 고른 상품의 첫 줄이 설명이다', async () => {
    await openBox(B, ITEM_L, ITEM_TEA)

    // 고르기 전에는 첫 줄이 없다. 없는 요소를 가리키는 연결도 두지 않는다
    expect(boxEl(B)).toHaveAccessibleName(BOX)
    expect(boxEl(B)).not.toHaveAccessibleDescription()
    expect(boxEl(B)).not.toHaveAttribute('aria-describedby')

    fireEvent.click(box(B).getByRole('radio', { name: ITEM_TEA.name }))

    expect(boxEl(B)).toHaveAccessibleDescription(FIRST_TEA)

    // 다른 상품을 고르면 설명도 그 상품의 첫 줄로 바뀐다
    fireEvent.click(box(B).getByRole('radio', { name: ITEM_L.name }))

    expect(boxEl(B)).toHaveAccessibleDescription(FIRST_L)
  })

  it('AC77: 상품 A와 B의 확인 상자가 함께 열리면 설명이 각자 자기 첫 줄이다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_L), readTag(ITEM_TEA))
    openBundle()

    await readPhoto(A, 1)
    await readPhoto(B, 2)

    expect(queryBox(A)).toBeInTheDocument()
    expect(queryBox(B)).toBeInTheDocument()
    expect(boxEl(A)).toHaveAccessibleDescription(FIRST_L)
    expect(boxEl(B)).toHaveAccessibleDescription(FIRST_TEA)
    // 두 상자가 가리키는 요소는 서로 다르고 각자 자기 상자 안의 첫 줄이다
    const first = describedElement(A)
    const second = describedElement(B)
    expect(first).not.toBeNull()
    expect(second).not.toBeNull()
    expect(first).not.toBe(second)
    expect(boxEl(A)).toContainElement(first)
    expect(boxEl(B)).toContainElement(second)
    expect(s.server.callsTo(READ)).toHaveLength(2)
  })
})

// ================================================================ 확인 상자의 단위 선택

describe('확인 상자의 단위 선택 (F32)', () => {
  // plan: unit select in the confirm box blocks 채우기 until a unit is chosen
  it('단위를 못 읽으면 확인 상자에 처음 값이 "단위 고르기"인 단위 선택(g·kg·mL·L·개)을 두고, 고르기 전에는 채우기를 막는다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_NO_UNIT))
    openBundle()
    const before = values(B)

    await readPhoto(B)

    const select = box(B).getByLabelText('단위') as HTMLSelectElement
    expect(select).toHaveDisplayValue('단위 고르기')
    expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['단위 고르기', 'g', 'kg', 'mL', 'L', '개'])
    expect(confirmButton(B)).toBeDisabled()
    // 막힌 동안 눌러도 칸은 바뀌지 않는다
    fireEvent.click(confirmButton(B))
    expect(queryBox(B)).toBeInTheDocument()
    expect(values(B)).toEqual(before)

    fireEvent.change(select, { target: { value: 'kg' } })
    expect(confirmButton(B)).toBeEnabled()
    // 다시 '단위 고르기'로 돌리면 다시 막힌다
    fireEvent.change(select, { target: { value: '' } })
    expect(confirmButton(B)).toBeDisabled()
    fireEvent.change(select, { target: { value: 'kg' } })
    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '4500', unit: 'kg', size: '900', count: '1' })
  })

  it('단위를 읽었으면 단위 선택이 없고, 단위를 못 읽어 개로 고르면 읽은 용량도 계산용으로 넣은 개수 1도 비운다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_L), readTag(ITEM_NO_UNIT))
    openBundle()
    await readPhoto(A, 1)
    expect(box(A).queryByLabelText('단위')).not.toBeInTheDocument()
    fireEvent.click(box(A).getByRole('button', { name: '취소' }))

    await readPhoto(A, 2)
    fireEvent.change(box(A).getByLabelText('단위'), { target: { value: 'ea' } })
    fireEvent.click(confirmButton(A))

    // R9: 개수는 읽은 값이 아니라 계산용으로 넣은 1이었으므로 단위를 개로 고르면 비운다
    expect(values(A)).toEqual({ price: '4500', unit: 'ea', size: null, count: '' })
  })

  it('R9: 단위 null·용량 900·개수 null에서 개를 골라 채우면 용량과 개수 칸을 비우고, 개수 오류를 보이며 그 칸에 포커스가 간다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_NO_UNIT))
    openBundle()
    // 상품 A도 개 단위여야 두 단위 칸에 종류 오류가 없어, 첫 오류 칸이 B의 묶음 개수다
    enter(A, { unit: 'ea' })
    await readPhoto(B)
    expect(box(B).getByText('채울 값: 가격 4,500원 · 900(단위 모름) × 1개(계산용 1묶음)')).toBeInTheDocument()

    fireEvent.change(box(B).getByLabelText('단위'), { target: { value: 'ea' } })
    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '4500', unit: 'ea', size: null, count: '' })
    expect(card(B).getByText('묶음 개수를 정수로 입력해 주세요')).toBeInTheDocument()
    expect(card(B).getByLabelText('묶음 개수')).toHaveAttribute('aria-invalid', 'true')
    expect(card(B).getByLabelText('묶음 개수')).toHaveFocus()
    // 가격은 읽은 값이라 오류가 없다. 개수를 모르니 "1개당 4,500원" 같은 결과도 없다
    expect(card(B).getByLabelText('가격')).not.toHaveAttribute('aria-invalid')
    expect(queryResult()).not.toBeInTheDocument()
  })

  it('R9: 읽은 개수가 있으면 단위를 개로 골라도 그 개수는 남고 용량만 비운다', async () => {
    const s = setup()
    s.server.on(READ, readTag({ ...ITEM_NO_UNIT, count: 2 }))
    openBundle()
    enter(A, { unit: 'ea' })
    await readPhoto(B)

    fireEvent.change(box(B).getByLabelText('단위'), { target: { value: 'ea' } })
    fireEvent.click(confirmButton(B))

    expect(values(B)).toEqual({ price: '4500', unit: 'ea', size: null, count: '2' })
    expect(card(B).getByLabelText('가격')).toHaveFocus()
    expect(result().getByText('2,250.00원')).toBeInTheDocument()
  })

  it('R8: 단위를 고르면 "채울 값" 줄을 고른 단위로 다시 만들고, 단위 고르기로 돌리면 읽은 줄로 돌아간다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM_NO_UNIT))
    openBundle()
    await readPhoto(B)
    const original = '채울 값: 가격 4,500원 · 900(단위 모름) × 1개(계산용 1묶음)'
    const select = box(B).getByLabelText('단위')
    expect(box(B).getByText(original)).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'g' } })
    expect(box(B).getByText('채울 값: 가격 4,500원 · 900g × 1개(계산용 1묶음)')).toBeInTheDocument()
    expect(box(B).queryByText(original)).not.toBeInTheDocument()
    expect(box(B).queryByText(/단위 모름/)).not.toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'kg' } })
    expect(box(B).getByText('채울 값: 가격 4,500원 · 900kg × 1개(계산용 1묶음)')).toBeInTheDocument()

    // 개를 고르면 용량 없이 개수만 적고, 계산용 1은 버리므로 "모름"이다
    fireEvent.change(select, { target: { value: 'ea' } })
    expect(box(B).getByText('채울 값: 가격 4,500원 · 모름')).toBeInTheDocument()

    fireEvent.change(select, { target: { value: '' } })
    expect(box(B).getByText(original)).toBeInTheDocument()
    // 읽은 내용 줄은 바뀌지 않는다
    expect(box(B).getByText('AI가 읽은 내용: ‘세탁 세제’ · ‘900’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
  })

  it('R8: 용량도 모르는 상품은 단위를 고르기 전 "(단위 모름)" 없이 "모름"이다', async () => {
    const s = setup()
    s.server.on(READ, readTag(BLANK))
    openBundle()
    await readPhoto(B)

    expect(box(B).getByText('채울 값: 가격 모름 · 모름 × 모름')).toBeInTheDocument()
    expect(box(B).queryByText(/단위 모름/)).not.toBeInTheDocument()
  })
})

// ================================================================ 사진 읽기가 실패하면 (10장 앱 공통 실패 문구)

describe('사진 읽기가 실패하면 (10장 앱 공통 실패 문구)', () => {
  it.each([
    ['서버 제한 429', aiReply.status(429), BUSY],
    ['꺼짐 503', aiReply.status(503), PAUSED],
    ['서버 오류 500', aiReply.status(500), UNREADABLE],
    ['네트워크 오류', aiReply.network(), UNREADABLE],
    ['모양이 다른 응답', aiReply.ok({ items: 'none' }), UNREADABLE],
  ])('%s이면 문구를 role=alert로 보이고 칸은 그대로이며 시간이 지나도 다시 보내지 않는다', async (_name, reply, message) => {
    fakeClock()
    const s = setup()
    s.server.on(READ, reply)
    openBundle()
    enter(B, { unit: 'kg', price: '1234', size: '4', count: '3' })
    const before = values(B)

    await readPhoto(B)

    expect(card(B).getByRole('alert')).toHaveTextContent(message)
    expect(queryBox(B)).not.toBeInTheDocument()
    expect(card(B).queryByText(READING)).not.toBeInTheDocument()
    expect(values(B)).toEqual(before)
    await advance(120_000)
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('사진 읽기는 59,999ms까지 기다리고 60,000ms에 끊고 "지금은 읽지 못했어요"를 보인다', async () => {
    fakeClock()
    const s = setup()
    s.server.on(READ, aiReply.hang())
    openBundle()
    await readPhoto(B)

    await advance(59_999)

    expect(card(B).queryByRole('alert')).not.toBeInTheDocument()
    expect(card(B).getByRole('status')).toHaveTextContent(READING)
    expect(s.server.callsTo(READ)[0].signal?.aborted).toBe(false)

    await advance(1)

    expect(card(B).getByRole('alert')).toHaveTextContent(UNREADABLE)
    expect(card(B).queryByText(READING)).not.toBeInTheDocument()
    expect(s.server.callsTo(READ)[0].signal?.aborted).toBe(true)
  })

  it('실패한 뒤 다시 사진을 고르면 앞의 실패 문구가 사라지고 새로 읽는다', async () => {
    const s = setup()
    s.server.on(READ, aiReply.status(500), readTag(ITEM_L))
    openBundle()
    await readPhoto(B, 1)
    expect(card(B).getByRole('alert')).toHaveTextContent(UNREADABLE)

    await readPhoto(B, 2)

    expect(card(B).queryByRole('alert')).not.toBeInTheDocument()
    expect(box(B).getByText('채울 값: 가격 9,900원 · 2.5L × 1개')).toBeInTheDocument()
  })
})

// ================================================================ 늦은 응답은 버린다 (10장 앱 공통)

describe('취소와 늦은 응답 (10장 앱 공통)', () => {
  it.each([
    ['성공 응답', readTag(ITEM_L)],
    ['서버 제한 429', aiReply.status(429)],
    ['네트워크 오류', aiReply.network()],
  ])('읽는 중에 취소하면 요청을 끊고 사진으로 채우기에 포커스를 돌리며, 그 뒤 늦게 온 %s은 화면에 아무것도 올리지 않는다', async (_name, lateReply) => {
    const late = aiReply.hold()
    const s = setup()
    s.server.on(READ, late)
    openBundle()
    enter(B, { unit: 'kg', price: '1234', size: '4', count: '3' })
    const before = values(B)
    await readPhoto(B)

    fireEvent.click(card(B).getByRole('button', { name: '취소' }))
    await settle()

    expect(late.signal?.aborted).toBe(true)
    expect(card(B).queryByText(READING)).not.toBeInTheDocument()
    expect(photoInput(B)).toHaveFocus()

    late.release(lateReply)
    await settle()

    expect(queryBox(B)).not.toBeInTheDocument()
    expect(card(B).queryByRole('alert')).not.toBeInTheDocument()
    expect(card(B).queryByText(READING)).not.toBeInTheDocument()
    expect(values(B)).toEqual(before)
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('새 사진을 고르면 앞 사진의 읽기를 끊고, 늦게 온 앞 사진의 응답은 확인 상자를 바꾸지 않는다', async () => {
    const lateA = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, readTag(ITEM_TEA))
    openBundle()
    await readPhoto(B, 1)

    await readPhoto(B, 2)

    expect(lateA.signal?.aborted).toBe(true)
    expect(box(B).getByText('AI가 읽은 내용: ‘티백’ · ‘75g(1.5g×50)’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()

    lateA.release(readTag(ITEM_L))
    await settle()

    expect(box(B).getByText('AI가 읽은 내용: ‘티백’ · ‘75g(1.5g×50)’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
    expect(box(B).queryByText('AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요')).not.toBeInTheDocument()
    expect(card(B).queryByRole('alert')).not.toBeInTheDocument()
    expect(s.server.callsTo(READ)).toHaveLength(2)
  })

  it('새 사진을 읽는 중에 앞 사진의 늦은 응답이 와도 읽는 중 표시와 취소가 그대로다', async () => {
    const lateA = aiReply.hold()
    const heldB = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, heldB)
    openBundle()
    await readPhoto(B, 1)
    await readPhoto(B, 2)

    lateA.release(readTag(ITEM_L))
    await settle()

    expect(queryBox(B)).not.toBeInTheDocument()
    expect(card(B).getByRole('status')).toHaveTextContent(READING)
    expect(card(B).getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(heldB.signal?.aborted).toBe(false)

    heldB.release(readTag(ITEM_TEA))
    await settle()

    expect(box(B).getByText('AI가 읽은 내용: ‘티백’ · ‘75g(1.5g×50)’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
  })

  it('확인 상자가 열려 있을 때 새 사진을 고르면 앞의 확인 상자는 닫히고 읽는 중이 된다', async () => {
    const heldB = aiReply.hold()
    const s = setup()
    s.server.on(READ, readTag(ITEM_L), heldB)
    openBundle()
    await readPhoto(B, 1)
    expect(queryBox(B)).toBeInTheDocument()

    await readPhoto(B, 2)

    expect(queryBox(B)).not.toBeInTheDocument()
    expect(card(B).getByRole('status')).toHaveTextContent(READING)
    heldB.release(readTag(ITEM_TEA))
    await settle()
    expect(box(B).getByText('AI가 읽은 내용: ‘티백’ · ‘75g(1.5g×50)’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
  })

  it('상품 A를 취소해도 상품 B의 읽기는 이어지고, B의 응답이 오면 B 카드만 확인 상자가 열린다', async () => {
    const heldA = aiReply.hold()
    const heldB = aiReply.hold()
    const s = setup()
    s.server.on(READ, heldA, heldB)
    openBundle()
    await readPhoto(A, 1)
    await readPhoto(B, 2)

    fireEvent.click(card(A).getByRole('button', { name: '취소' }))
    await settle()

    expect(heldA.signal?.aborted).toBe(true)
    expect(heldB.signal?.aborted).toBe(false)
    expect(card(B).getByRole('status')).toHaveTextContent(READING)

    heldA.release(readTag(ITEM_TEA))
    heldB.release(readTag(ITEM_L))
    await settle()

    expect(queryBox(A)).not.toBeInTheDocument()
    expect(box(B).getByText('AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요')).toBeInTheDocument()
    expect(photoInput(A)).toHaveFocus()
  })
})

// ================================================================ 숨은 화면에서 끝나면 포커스를 옮기지 않는다 (10장 앱 공통)

describe('다른 화면을 보는 동안 끝난 읽기 (10장 앱 공통)', () => {
  it.each([
    ['다른 메뉴의 버튼에 포커스가 있어도', true],
    ['포커스가 어디에도 없어도', false],
  ])('읽는 중에 다른 메뉴로 가면 읽기는 계속되고, %s 거기서 끝나면 포커스를 옮기지 않으며 돌아오면 확인 상자가 보인다', async (_name, keepFocus) => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    openBundle()
    await readPhoto(B)

    goTo('고민 중인 물건')
    const keep = within(screen.getByRole('form', { name: '물건 담기' })).getByRole('button', { name: '담아 두기' })
    if (keepFocus) keep.focus()
    else (document.activeElement as HTMLElement | null)?.blur()
    // jsdom은 숨은 요소의 focus()를 무시하므로, 포커스가 그대로인 것만으로는 숨김 검사가 빠진 구현을 잡지 못한다.
    // 그래서 가격 비교 화면 안의 어떤 요소에도 focus()를 부르지 않았는지도 본다(보이는 경우의 대조는 위의 "확인 상자로 포커스를 옮긴다").
    // 포커스가 어디에도 없을 때는 "다른 칸에 적는 중이면 옮기지 않는" 규칙이 걸리지 않아, 숨김 검사만 홀로 시험된다
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    held.release(readTag(ITEM_L))
    await settle()

    if (keepFocus) expect(keep).toHaveFocus()
    else expect(document.body).toHaveFocus()
    expect(focusedInside(focusSpy, panelOf('가격 비교'))).toEqual([])
    expect(held.signal?.aborted).toBe(false)

    goTo('가격 비교')

    expect(boxEl(B)).toBeVisible()
    expect(box(B).getByText('채울 값: 가격 9,900원 · 2.5L × 1개')).toBeInTheDocument()
    expect(s.server.callsTo(READ)).toHaveLength(1)

    // 돌아와서 채울 수 있다
    fireEvent.click(confirmButton(B))
    expect(values(B)).toEqual({ price: '9900', unit: 'L', size: '2.5', count: '1' })
  })

  it('읽는 중에 가격 비교의 다른 탭(할인 비교)으로 가도 끝났을 때 포커스를 옮기지 않고, 돌아오면 확인 상자가 보인다', async () => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    openBundle()
    await readPhoto(B)

    goTo('할인 비교')
    const example = within(screen.getByRole('tabpanel', { name: '할인 비교' })).getByRole('button', { name: '예시 넣기' })
    example.focus()
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    held.release(readTag(ITEM_L))
    await settle()

    expect(example).toHaveFocus()
    expect(focusedInside(focusSpy, panelOf('묶음상품 비교'))).toEqual([])

    goTo('묶음상품 비교')

    expect(boxEl(B)).toBeVisible()
  })
})

// ================================================================ 사진 미리보기 주소 (10장 앱 공통)

describe('사진 미리보기 주소 (10장 앱 공통)', () => {
  it('사진을 바꾸고 취소하고 끝까지 읽고 늦은 응답이 와도, 보이는 주소는 두고 안 보이게 된 주소는 바로 한 번씩 해제한다', async () => {
    const lateA = aiReply.hold()
    const lateB = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, lateB, readTag(ITEM_L))
    const view = openBundle()

    await readPhoto(B, 1)
    expect(s.urls.created).toHaveLength(1)
    expect(previews()).toEqual([s.urls.created[0]])
    expect(s.urls.revoked).toEqual([])

    await readPhoto(B, 2)
    expect(previews()).toEqual([s.urls.created[1]])
    expect(s.urls.revoked).toEqual([s.urls.created[0]])

    fireEvent.click(card(B).getByRole('button', { name: '취소' }))
    await settle()
    expect(previews()).toEqual([])
    expect(s.urls.revoked).toEqual([s.urls.created[0], s.urls.created[1]])

    await readPhoto(B, 3)
    // 확인 상자를 보는 동안 사진을 함께 볼 수 있게 미리보기를 남긴다
    expect(previews()).toEqual([s.urls.created[2]])

    lateA.release(readTag(ITEM_TEA))
    lateB.release(readTag(ITEM_TEA))
    await settle()
    // 늦은 응답은 주소를 새로 만들지도, 보이는 것을 해제하지도 않는다
    expect(s.urls.created).toHaveLength(3)
    expectPreviewUrlsHealthy(s.urls)

    view.unmount()

    expect(s.urls.revoked.toSorted()).toEqual(s.urls.created.toSorted())
  })

  it.each([
    ['채우기', '채우기'],
    ['취소', '취소'],
  ])('확인 상자에서 %s를 누르면 미리보기 주소를 바로 한 번 해제하고 사진은 사라진다', async (_name, buttonName) => {
    const s = await openBox(B, ITEM_L)
    expect(previews()).toEqual([s.urls.created[0]])
    expect(s.urls.revoked).toEqual([])

    fireEvent.click(box(B).getByRole('button', { name: buttonName }))

    expect(previews()).toEqual([])
    expect(s.urls.revoked).toEqual([s.urls.created[0]])
  })

  it('화면이 사라질 때 읽는 중이던 사진의 미리보기 주소도 해제하고 요청도 끊는다', async () => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    const view = openBundle()
    await readPhoto(B)

    view.unmount()

    expect(s.urls.revoked).toEqual(s.urls.created)
    expect(s.urls.created).toHaveLength(1)
    expect(held.signal?.aborted).toBe(true)
  })

  it('상품 A·B가 각자 읽는 중이면 미리보기도 각자 하나씩이고, 한쪽이 끝나도 다른 쪽 주소는 그대로다', async () => {
    const s = setup()
    s.server.on(READ, aiReply.hold(), readTag(ITEM_L))
    openBundle()
    await readPhoto(A, 1)
    await readPhoto(B, 2)
    expect(previews()).toEqual([s.urls.created[0], s.urls.created[1]])

    fireEvent.click(box(B).getByRole('button', { name: '취소' }))

    expect(previews()).toEqual([s.urls.created[0]])
    expect(s.urls.revoked).toEqual([s.urls.created[1]])
    // 남은 A의 읽기는 화면이 사라질 때 끊고 afterEach가 주소가 모두 해제됐는지 본다
  })
})
