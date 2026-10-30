import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { DanawaRow, LowestPriceResponse, TagItem } from './ai/types'
import { STORAGE_KEY } from './logic/storage'
import { aiReply, mockAiServer, mockImagePipeline, mockObjectUrls, nextTask, type AiReply, type MockAiServer } from './test/aiMocks'

// PRD F31 가격표 사진으로 온라인 가격 확인 (AC51~AC54)와 10장 "앱 공통"의 사진 규칙(안내·대기 상한·취소·늦은 응답·숨은 화면·미리보기).
// 계획 Task 10의 테스트 이름은 해당 it 위 `// plan:` 주석에 있다.
// 메뉴를 옮겨 다니는 시험(숨은 화면 포커스, 고민 목록에 담기)이 있어 가격 비교 화면만이 아니라 App 전체를 그린다.
// 서버·사진·미리보기 주소 흉내는 src/test/aiMocks.ts의 것만 쓴다. 60초 상한과 "시간이 지나도 다시 보내지 않음" 시험만
// 가짜 setTimeout을 쓰므로(userEvent·waitFor·findBy가 멈춤) 사진·버튼 조작은 fireEvent와 settle()로 한다.
//
// PRD·계획에 글이 없어 정한 이름(가정):
// - 가정: 진행 문구는 PRD 흐름의 단계 이름 그대로, 사진을 읽는 동안 "읽는 중", 온라인 가격을 확인하는 동안 "확인 중"(role=status).
// - 가정: 결과 영역의 제목은 계획 Interfaces의 영역 이름과 같은 "온라인 가격 확인 결과".
// - 가정: 상품이 하나면 라디오 없이 그 상품을 고른 것으로 본다(PRD "하나면 자동 선택").
// - 가정: 상품이 여러 개면 상품마다 묶음(fieldset)이고, 묶음 이름과 라디오 이름은 읽은 상품명.
// - 가정: 사진 미리보기는 alt가 빈 <img> 하나(읽은 값은 칸에 글로 따로 보인다).
// - 가정: "가격을 읽지 못했어요"는 가격 칸의 안내 문장(접근 가능한 설명)이다.

// ---------------------------------------------------------------- PRD 문장 (글자 그대로)

const PHOTO_NOTICE =
  '사진은 읽기 위해 Google Gemini로 보내져요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있으니 얼굴이나 개인정보가 담기지 않게 해 주세요.'
const DECODE_FAILED = '이 사진을 열 수 없어요. 다른 사진을 고르거나 직접 입력해 주세요.'
const BUSY = '지금은 사용이 많아요. 잠시 뒤 다시 해 주세요.'
const PAUSED = 'AI 기능을 잠시 멈췄어요. 직접 입력해 주세요.'
const UNREADABLE = '지금은 읽지 못했어요. 직접 입력해 주세요.'
const NOT_FOUND = '상품이나 가격표를 찾지 못했어요. 다시 찍거나 직접 입력해 주세요.'
const PRICE_UNREAD = '가격을 읽지 못했어요'
const NEED_PRICE = '매장 가격을 적어 주세요'
const TOP_NOTE = '가격 차이는 필요 여부를 판단해 주지 않아요.'
const FOUND_HEAD = 'AI가 같은 상품으로 고른 다나와 상품'
const NOT_CONFIRMED_HEAD = '다나와 검색 결과 · 같은 상품인지 확인하지 못했어요'
const DANAWA_FAILED = '다나와 결과를 가져오지 못했어요.'
const DIRECT_LINK = '다나와에서 직접 보기'
const UNKNOWN_COUNT = '개수를 확인하지 못했어요. 상품명과 표기를 보고 같은 규격인지 확인해 주세요.'
const SAME_SPEC = '규격이 같아요'
const END_NOTE = '살지 말지 아직 모르겠다면 먼저 담아 두고 며칠 뒤 다시 생각해 보세요.'
const DRAFT_GUIDE = '가격표 사진에서 상품명과 가격을 가져왔어요. 사고 싶은 이유를 적고 담아 두세요.'

// 가정한 이름 (위 목록)
const READING = '읽는 중'
const CHECKING = '확인 중'
const RESULT = '온라인 가격 확인 결과'

// ---------------------------------------------------------------- 응답 견본 (서버가 돌려주는 모양: 칸이 모두 있다)

// AC51 상품 1개: 상품명 '농심 오징어짬뽕 소컵 6입', 가격 3980, 정상가 4980, 포장 표기 '67g×6', 개당 67g, 6개
const ITEM: TagItem = {
  name: '농심 오징어짬뽕 소컵 6입',
  brand: '농심',
  price: 3980,
  priceCondition: null,
  regularPrice: 4980,
  priceBasis: null,
  sizeText: '67g×6',
  size: 67,
  unit: 'g',
  count: 6,
  tagReadable: true,
}
// 가정: AC51 '상품 2개'의 둘째 상품. 값은 결과를 가르지 않는 평범한 컵라면
const ITEM_2: TagItem = {
  name: '신라면 컵 65g',
  brand: '농심',
  price: 1200,
  priceCondition: null,
  regularPrice: null,
  priceBasis: null,
  sizeText: '65g',
  size: 65,
  unit: 'g',
  count: 1,
  tagReadable: true,
}
// AC53 단가 가격표('100g')
const UNIT_PRICE_ITEM: TagItem = { ...ITEM, name: '오징어짬뽕 컵', price: 430, regularPrice: null, priceBasis: '100g', sizeText: null, size: null, unit: null, count: null }

const readTag = (...items: TagItem[]) => aiReply.ok({ items, note: null })

const SEARCH_URL = 'https://search.danawa.com/?query=%EB%86%8D%EC%8B%AC%20%EC%98%A4%EC%A7%95%EC%96%B4%EC%A7%AC%EB%BD%95'
const row = (name: string, packCount: number | null, price: number, malls: string): DanawaRow => ({ name, packCount, price, unitPriceText: null, malls })
const lowest = (status: LowestPriceResponse['status'], matches: DanawaRow[], candidates: DanawaRow[] = []) =>
  aiReply.ok({ status, searchUrl: SEARCH_URL, matches, candidates } satisfies LowestPriceResponse)

// AC52 줄 4,900원(6개 묶음, 판매처 573곳). 줄 표시는 PRD F31 "{상품명} · {묶음} · {가격}원 · 판매처 {n}곳"
const ROW_FOUND = row('농심 오징어짬뽕컵 67g', 6, 4900, '573')
const ROW_FOUND_LINE = '농심 오징어짬뽕컵 67g · 6개 묶음 · 4,900원 · 판매처 573곳'
// 늦게 온 응답에만 들어 있는 줄. 화면 어디에도 나오면 안 된다
const ROW_LATE = row('늦게 온 다른 상품 100g', 1, 1000, '7')
const ROW_LATE_LINE = '늦게 온 다른 상품 100g · 1개 묶음 · 1,000원 · 판매처 7곳'

// ---------------------------------------------------------------- 준비·정리

const BASE = 'https://ai.test'
const READ = '/api/read-tag'
const LOWEST = '/api/lowest-price'

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
      // 화면이 사라진 뒤에는 만든 미리보기 주소가 모두 한 번씩 해제돼 있어야 한다 (PRD 10장 "다 쓴 미리보기 주소는 바로 해제")
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
async function sent(path: string, n = 1) {
  await act(async () => {
    await current?.server.waitForCalls(path, n)
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

const panelEl = () => screen.getByRole('tabpanel', { name: '가격표 사진' })
const panel = () => within(panelEl())
const photoInput = () => panel().getByLabelText('가격표 사진 찍기')
const field = (label: string) => panel().getByLabelText(label)
const checkButton = () => panel().getByRole('button', { name: '온라인 가격 확인' })
const productsHeading = () => panel().queryByRole('heading', { name: '읽은 상품' })
const resultEl = () => panel().queryByRole('region', { name: RESULT })
const result = () => within(panel().getByRole('region', { name: RESULT }))
const rowButtons = () => result().queryAllByRole('button', { name: /판매처 \d+곳$/ })
const wishForm = () => within(screen.getByRole('form', { name: '물건 담기' }))

function openApp() {
  return render(<App />)
}
function goTo(tab: string) {
  fireEvent.click(screen.getByRole('tab', { name: tab }))
}
function openPhotoTab() {
  const view = openApp()
  goTo('가격 비교')
  goTo('가격표 사진')
  return view
}
function choosePhoto(name = 'tag.jpg') {
  const file = new File(['photo-bytes'], name, { type: 'image/jpeg' })
  fireEvent.change(photoInput(), { target: { files: [file] } })
  return file
}
// 사진을 고르고 n번째 읽기 요청이 갈 때까지 흘려 보낸다(답은 미리 server.on(READ, …)로 둔다)
async function readPhoto(n = 1) {
  choosePhoto()
  await sent(READ, n)
}
async function checkOnline(n = 1) {
  fireEvent.click(checkButton())
  await sent(LOWEST, n)
}
function edit(label: string, value: string) {
  fireEvent.change(field(label), { target: { value } })
}
function pickRow(line: string) {
  fireEvent.click(result().getByRole('button', { name: line }))
}
// 상품 하나를 읽고 온라인 확인까지 한 상태
async function readAndCheck(items: TagItem[], online: AiReply) {
  const s = setup()
  s.server.on(READ, readTag(...items))
  s.server.on(LOWEST, online)
  openPhotoTab()
  await readPhoto()
  await checkOnline()
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

// ================================================================ 서버 주소와 사진 고르기 (10장 앱 공통 · AC61)

describe('가격표 사진 탭과 사진 고르기 (10장 앱 공통)', () => {
  // plan: hides the 가격표 사진 tab without a server url
  it.each([
    ['빈', ''],
    ['없는', undefined],
  ])('AC61: 서버 주소가 %s 빌드에는 가격표 사진 탭·사진 고르기·안내가 없고 서버 요청도 없다', (_name, value) => {
    localStorage.clear()
    vi.stubEnv('VITE_AI_SERVER_URL', value)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    openApp()
    goTo('가격 비교')

    const tabs = within(screen.getByRole('tablist', { name: '가격 비교 종류' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['할인 비교', '묶음상품 비교'])
    expect(screen.queryByLabelText('가격표 사진 찍기')).not.toBeInTheDocument()
    expect(screen.queryByText(PHOTO_NOTICE)).not.toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('서버 주소가 있으면 가격 비교의 세 번째 탭이 가격표 사진이고, 사진 고르기 바로 아래 전송 안내가 누르기 전부터 보인다', () => {
    const s = setup()
    openApp()
    goTo('가격 비교')

    const tabs = within(screen.getByRole('tablist', { name: '가격 비교 종류' })).getAllByRole('tab')
    expect(tabs.map((tab) => tab.textContent)).toEqual(['할인 비교', '묶음상품 비교', '가격표 사진'])

    goTo('가격표 사진')
    const input = photoInput()
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('capture', 'environment')
    const label = input.closest('label')
    expect(label).toHaveTextContent('가격표 사진 찍기')
    const notice = panel().getByText(PHOTO_NOTICE)
    expect(notice).toBeVisible()
    // 버튼(레이블) 바로 다음이 안내다
    expect(label?.nextElementSibling).toBe(notice)
    expect(s.server.calls).toHaveLength(0)
  })

  it('고른 사진을 줄인 JPEG로 /api/read-tag에 한 번 보내고, 읽는 동안 진행 문구(role=status)와 취소를 보인다', async () => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(READ, held)
    openPhotoTab()

    await readPhoto()

    // 가짜 canvas가 만든 JPEG 4바이트(ff d8 ff e0)의 base64. 원래 사진('photo-bytes')이 아니다
    expect(s.server.callsTo(READ).map((call) => call.body)).toEqual([{ image: btoa('\xff\xd8\xff\xe0'), mimeType: 'image/jpeg' }])
    expect(panel().getByRole('status')).toHaveTextContent(READING)
    expect(panel().getByRole('button', { name: '취소' })).toBeInTheDocument()

    held.release(readTag(ITEM))
    await settle()

    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(panel().queryByRole('button', { name: '취소' })).not.toBeInTheDocument()
    expect(productsHeading()).toBeInTheDocument()
  })
})

// ================================================================ AC51 읽은 상품

describe('읽은 상품 (AC51)', () => {
  // plan: AC51 일곱 경우
  it('AC51: 상품 1개를 읽으면 칸을 채우고 정상가 4980을 보이며, 그 상품을 고른 채 "읽은 상품" 제목에 포커스를 둔다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM))
    openPhotoTab()

    await readPhoto()

    expect(field('상품명')).toHaveValue('농심 오징어짬뽕 소컵 6입')
    expect(field('가격')).toHaveValue('3980')
    expect(field('가격 조건')).toHaveValue('')
    expect(field('정상가')).toHaveValue('4980')
    expect(field('포장 표기')).toHaveValue('67g×6')
    expect(field('개수')).toHaveValue('6')
    // 가정: 하나면 라디오 없이 고른 상태(자동 선택)라 바로 확인할 수 있다
    expect(panel().queryAllByRole('radio')).toHaveLength(0)
    expect(checkButton()).toBeEnabled()
    expect(productsHeading()).toHaveFocus()
  })

  it('AC51: 상품 2개를 읽으면 라디오 2개가 나오고, 하나를 고르기 전에는 "온라인 가격 확인"이 비활성이다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM, ITEM_2))
    openPhotoTab()

    await readPhoto()

    const radios = panel().getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios.filter((radio) => (radio as HTMLInputElement).checked)).toHaveLength(0)
    expect(checkButton()).toBeDisabled()
    // 상품마다 고칠 수 있는 칸이 있다
    expect(within(panel().getByRole('group', { name: ITEM.name })).getByLabelText('가격')).toHaveValue('3980')
    expect(within(panel().getByRole('group', { name: ITEM_2.name })).getByLabelText('가격')).toHaveValue('1200')
    expect(productsHeading()).toHaveFocus()

    fireEvent.click(panel().getByRole('radio', { name: ITEM_2.name }))

    expect(panel().getByRole('radio', { name: ITEM_2.name })).toBeChecked()
    expect(checkButton()).toBeEnabled()
  })

  it('AC51: 상품을 하나도 못 찾으면 "상품이나 가격표를 찾지 못했어요…"와 빈 칸 한 벌을 보인다', async () => {
    const s = setup()
    s.server.on(READ, readTag())
    openPhotoTab()

    await readPhoto()

    expect(panel().getByText(NOT_FOUND)).toBeInTheDocument()
    for (const label of ['상품명', '가격', '가격 조건', '정상가', '포장 표기', '개수']) {
      expect(field(label), label).toHaveValue('')
    }
    expect(panel().getAllByLabelText('상품명')).toHaveLength(1)
    expect(panel().queryAllByRole('radio')).toHaveLength(0)
    expect(productsHeading()).toHaveFocus()
  })

  it('AC51: 가격을 못 읽은 상품은 가격 칸을 비우고 "가격을 읽지 못했어요"를 붙이며, 확인 버튼을 막고 "매장 가격을 적어 주세요"를 보인다', async () => {
    const s = setup()
    s.server.on(READ, readTag({ ...ITEM, price: null }))
    openPhotoTab()

    await readPhoto()

    expect(field('가격')).toHaveValue('')
    expect(field('가격')).toHaveAccessibleDescription(PRICE_UNREAD)
    expect(checkButton()).toBeDisabled()
    expect(panel().getByText(NEED_PRICE)).toBeInTheDocument()

    // 직접 적으면 확인할 수 있다
    edit('가격', '3980')

    expect(checkButton()).toBeEnabled()
    expect(panel().queryByText(NEED_PRICE)).not.toBeInTheDocument()
  })

  it('AC51: 가격 조건이 회원가로 읽히면 가격 조건 칸에 회원가를 둔다', async () => {
    const s = setup()
    s.server.on(READ, readTag({ ...ITEM, priceCondition: '회원가' }))
    openPhotoTab()

    await readPhoto()

    expect(field('가격 조건')).toHaveValue('회원가')
  })

  it('AC51: 같은 사진을 다시 고르면 다시 읽는다(요청 2번)', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM), readTag(ITEM))
    openPhotoTab()
    // userEvent.upload는 같은 파일이 이미 골라져 있으면 change를 보내지 않는다(브라우저와 같음). 고른 뒤 값을 비워야 다시 읽힌다
    const user = userEvent.setup()
    const file = new File(['photo-bytes'], 'tag.jpg', { type: 'image/jpeg' })

    await user.upload(photoInput(), file)
    await sent(READ, 1)
    await user.upload(photoInput(), file)
    await sent(READ, 2)

    expect(s.server.callsTo(READ)).toHaveLength(2)
    expect(field('상품명')).toHaveValue(ITEM.name)
  })

  // plan: shows the decode message and calls no server when the photo cannot be opened
  it.each([
    ['브라우저가 열 수 없는 사진', 'fail', 'ok'],
    ['JPEG로 다시 그리지 못한 사진', 'ok', 'null'],
  ] as const)('AC51: %s이면 "이 사진을 열 수 없어요…"를 알리고 서버에 보내지 않는다', async (_name, decode, toBlob) => {
    const s = setup({ decode, toBlob })
    openPhotoTab()

    choosePhoto()
    await settle()

    expect(panel().getByRole('alert')).toHaveTextContent(DECODE_FAILED)
    expect(s.server.calls).toHaveLength(0)
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(productsHeading()).not.toBeInTheDocument()
    // 열 수 없는 사진의 미리보기는 남기지 않는다(주소는 afterEach가 해제됐는지 본다)
    expect(previews()).toEqual([])
  })
})

// ================================================================ AC52 규격 확인과 비교 문장

describe('규격 확인과 비교 문장 (AC52)', () => {
  // plan: AC52 열한 경우
  it('AC52: 다나와 줄 4,900원(6개 묶음)을 누르면 매장·다나와 규격과 "규격이 같아요" 버튼을 보이고, 비교 문장은 아직 없다', async () => {
    await readAndCheck([ITEM], lowest('found', [ROW_FOUND]))

    pickRow(ROW_FOUND_LINE)

    expect(result().getByRole('button', { name: ROW_FOUND_LINE })).toHaveAttribute('aria-pressed', 'true')
    expect(result().getByText('매장: 농심 오징어짬뽕 소컵 6입 · 67g×6')).toBeInTheDocument()
    expect(result().getByText('다나와: 농심 오징어짬뽕컵 67g · 6개 묶음')).toBeInTheDocument()
    expect(result().getByRole('button', { name: SAME_SPEC })).toBeInTheDocument()
    expect(result().queryByText(UNKNOWN_COUNT)).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent('조회 시점')
  })

  it('AC52: 그 상태에서 "규격이 같아요"를 누르면 920원 높다는 문장과 가격 줄을 알림 칸(role=status)에 보인다', async () => {
    await readAndCheck([ITEM], lowest('found', [ROW_FOUND]))
    pickRow(ROW_FOUND_LINE)

    fireEvent.click(result().getByRole('button', { name: SAME_SPEC }))

    const status = within(result().getByRole('status'))
    expect(status.getByText('조회 시점 다나와 표시 상품가가 매장 가격보다 920원 높아요.')).toBeInTheDocument()
    expect(status.getByText('매장 3,980원 · 다나와 4,900원 · 배송비와 총 결제액은 확인하지 않았어요')).toBeInTheDocument()
  })

  it.each([
    ['4900', '조회 시점 다나와 표시 상품가와 매장 가격이 같아요.', '매장 4,900원 · 다나와 4,900원 · 배송비와 총 결제액은 확인하지 않았어요'],
    ['5500', '조회 시점 다나와 표시 상품가가 매장 가격보다 600원 낮아요.', '매장 5,500원 · 다나와 4,900원 · 배송비와 총 결제액은 확인하지 않았어요'],
  ])('AC52: 매장 가격을 %s원으로 고쳐 확인하면 고친 가격으로 비교한다', async (price, first, second) => {
    const s = setup()
    s.server.on(READ, readTag(ITEM))
    s.server.on(LOWEST, lowest('found', [ROW_FOUND]))
    openPhotoTab()
    await readPhoto()
    edit('가격', price)
    await checkOnline()
    pickRow(ROW_FOUND_LINE)

    fireEvent.click(result().getByRole('button', { name: SAME_SPEC }))

    const status = within(result().getByRole('status'))
    expect(status.getByText(first)).toBeInTheDocument()
    expect(status.getByText(second)).toBeInTheDocument()
  })

  it('AC52: 줄이 12개 묶음이고 매장이 6개면 묶음 개수가 다르다는 안내만 보이고 규격 버튼과 비교 문장이 없다', async () => {
    const row12 = row('농심 오징어짬뽕컵 67g', 12, 9500, '120')
    await readAndCheck([ITEM], lowest('found', [row12]))

    pickRow('농심 오징어짬뽕컵 67g · 12개 묶음 · 9,500원 · 판매처 120곳')

    expect(result().getByText('묶음 개수가 달라요(매장 6개 · 다나와 12개). 같은 규격끼리 비교해 주세요.')).toBeInTheDocument()
    expect(result().queryByRole('button', { name: SAME_SPEC })).not.toBeInTheDocument()
    expect(result().queryByText(/^매장: /)).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent('조회 시점')
  })

  it('AC52: 묶음 표시가 없는 줄을 누르면 개수를 확인하지 못했다는 안내를 "규격이 같아요" 위에 붙인다', async () => {
    const noPack = row('농심 오징어짬뽕컵 67g', null, 790, '88')
    await readAndCheck([ITEM], lowest('found', [noPack]))

    pickRow('농심 오징어짬뽕컵 67g · 묶음 표시 없음 · 790원 · 판매처 88곳')

    expect(result().getByText('다나와: 농심 오징어짬뽕컵 67g · 묶음 표시 없음')).toBeInTheDocument()
    const notice = result().getByText(UNKNOWN_COUNT)
    const button = result().getByRole('button', { name: SAME_SPEC })
    expect(notice.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('AC52: 매장 개수를 모르면 같은 안내와 "규격이 같아요" 버튼을 보인다', async () => {
    await readAndCheck([{ ...ITEM, count: null }], lowest('found', [ROW_FOUND]))

    pickRow(ROW_FOUND_LINE)

    expect(result().getByText(UNKNOWN_COUNT)).toBeInTheDocument()
    expect(result().getByRole('button', { name: SAME_SPEC })).toBeInTheDocument()
  })

  it('AC52: 가격 조건이 회원가면 비교 문장 둘째 줄 끝에 " · 매장 가격은 회원가 기준"을 붙인다', async () => {
    await readAndCheck([{ ...ITEM, priceCondition: '회원가' }], lowest('found', [ROW_FOUND]))
    pickRow(ROW_FOUND_LINE)

    fireEvent.click(result().getByRole('button', { name: SAME_SPEC }))

    expect(
      within(result().getByRole('status')).getByText('매장 3,980원 · 다나와 4,900원 · 배송비와 총 결제액은 확인하지 않았어요 · 매장 가격은 회원가 기준'),
    ).toBeInTheDocument()
  })

  it('AC52: 비교 뒤 매장 가격 칸을 고치면 결과와 비교 문장이 사라지고 다시 확인할 수 있다', async () => {
    await readAndCheck([ITEM], lowest('found', [ROW_FOUND]))
    pickRow(ROW_FOUND_LINE)
    fireEvent.click(result().getByRole('button', { name: SAME_SPEC }))

    edit('가격', '3900')

    expect(resultEl()).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent('조회 시점')
    expect(checkButton()).toBeEnabled()
  })

  it('AC52: 규격 확인 뒤 다른 줄을 누르면 비교 문장이 사라지고 새 줄의 규격 확인부터 다시 한다', async () => {
    const other = row('농심 오징어짬뽕 컵 67g 6입', 6, 5200, '42')
    const otherLine = '농심 오징어짬뽕 컵 67g 6입 · 6개 묶음 · 5,200원 · 판매처 42곳'
    await readAndCheck([ITEM], lowest('found', [ROW_FOUND, other]))
    pickRow(ROW_FOUND_LINE)
    fireEvent.click(result().getByRole('button', { name: SAME_SPEC }))
    expect(panelEl()).toHaveTextContent('조회 시점')

    pickRow(otherLine)

    expect(panelEl()).not.toHaveTextContent('조회 시점')
    expect(result().getByRole('button', { name: otherLine })).toHaveAttribute('aria-pressed', 'true')
    expect(result().getByRole('button', { name: ROW_FOUND_LINE })).toHaveAttribute('aria-pressed', 'false')
    expect(result().getByText('다나와: 농심 오징어짬뽕 컵 67g 6입 · 6개 묶음')).toBeInTheDocument()
    expect(result().getByRole('button', { name: SAME_SPEC })).toBeInTheDocument()
  })

  it('AC52: 확인 중에 포장 표기를 고치면 요청을 끊고 늦은 응답은 버리며, 다시 확인하면 개당 용량·단위 없이 보낸다', async () => {
    const late = aiReply.hold()
    const s = setup()
    s.server.on(READ, readTag(ITEM))
    s.server.on(LOWEST, late, lowest('found', [ROW_FOUND]))
    openPhotoTab()
    await readPhoto()
    await checkOnline(1)
    // 읽은 그대로면 개당 용량·단위까지 보낸다
    expect(s.server.callsTo(LOWEST)[0].body).toEqual({ name: ITEM.name, brand: '농심', sizeText: '67g×6', size: 67, unit: 'g', count: 6 })

    edit('포장 표기', '70g×6')
    await settle()

    expect(late.signal?.aborted).toBe(true)
    expect(panel().queryByText(CHECKING)).not.toBeInTheDocument()
    late.release(lowest('found', [ROW_LATE]))
    await settle()
    expect(resultEl()).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent(ROW_LATE_LINE)

    await checkOnline(2)

    // 개수는 칸 값 그대로
    expect(s.server.callsTo(LOWEST)[1].body).toEqual({ name: ITEM.name, brand: '농심', sizeText: '70g×6', size: null, unit: null, count: 6 })
    expect(rowButtons().map((button) => button.textContent)).toEqual([ROW_FOUND_LINE])
  })
})

// ================================================================ AC53 온라인 결과의 여러 경우와 실패

describe('온라인 가격 확인 결과와 실패 (AC53)', () => {
  // plan: AC53 아홉 경우
  it('AC53: 다나와가 같은 상품을 확인하지 못하면 안내 아래 검색 결과 앞쪽 3줄과 "다나와에서 직접 보기"(새 창)를 보인다', async () => {
    const candidates = [
      row('농심 오징어짬뽕컵 67g', 6, 4900, '573'),
      row('농심 오징어짬뽕 큰사발 115g', null, 1980, '210'),
      row('오뚜기 진짬뽕 컵 105g', 12, 14500, '88'),
      row('삼양 맛있는라면 컵 70g', 6, 900, '120'),
    ]
    await readAndCheck([ITEM], lowest('not_confirmed', [], candidates))

    expect(result().getByText(TOP_NOTE)).toBeInTheDocument()
    const head = result().getByText(NOT_CONFIRMED_HEAD)
    expect(result().queryByText(FOUND_HEAD)).not.toBeInTheDocument()
    // 앞쪽 3줄은 다나와가 준 순서 그대로(가격순이 아니다). 넷째 줄은 가격이 가장 낮아도 없다
    const buttons = rowButtons()
    expect(buttons.map((button) => button.textContent)).toEqual([
      '농심 오징어짬뽕컵 67g · 6개 묶음 · 4,900원 · 판매처 573곳',
      '농심 오징어짬뽕 큰사발 115g · 묶음 표시 없음 · 1,980원 · 판매처 210곳',
      '오뚜기 진짬뽕 컵 105g · 12개 묶음 · 14,500원 · 판매처 88곳',
    ])
    expect(head.compareDocumentPosition(buttons[0]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // "결과 맨 위"
    expect(result().getByText(TOP_NOTE).compareDocumentPosition(head) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const link = result().getByRole('link', { name: DIRECT_LINK })
    expect(link).toHaveAttribute('href', SEARCH_URL)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
  })

  it('AC53: 다나와를 읽지 못하면(unavailable) "다나와 결과를 가져오지 못했어요."와 링크를 보인다', async () => {
    await readAndCheck([ITEM], lowest('unavailable', []))

    expect(result().getByText(DANAWA_FAILED)).toBeInTheDocument()
    expect(result().getByRole('link', { name: DIRECT_LINK })).toHaveAttribute('href', SEARCH_URL)
    expect(rowButtons()).toHaveLength(0)
    expect(result().queryByText(FOUND_HEAD)).not.toBeInTheDocument()
    expect(result().queryByText(NOT_CONFIRMED_HEAD)).not.toBeInTheDocument()
  })

  it('AC53: 다나와 조회를 꺼 두었으면(off) 줄 없이 링크만 보인다', async () => {
    await readAndCheck([ITEM], lowest('off', []))

    expect(result().getByRole('link', { name: DIRECT_LINK })).toHaveAttribute('href', SEARCH_URL)
    expect(rowButtons()).toHaveLength(0)
    expect(result().queryByText(DANAWA_FAILED)).not.toBeInTheDocument()
    expect(result().queryByText(FOUND_HEAD)).not.toBeInTheDocument()
    expect(result().queryByText(NOT_CONFIRMED_HEAD)).not.toBeInTheDocument()
    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
  })

  it.each([
    [429, BUSY],
    [503, PAUSED],
  ])('AC53: 서버 %s이면 문구를 role=alert로 보이고, 시간이 지나도 다시 요청하지 않는다(fetch 횟수 그대로)', async (status, message) => {
    fakeClock()
    const s = await readAndCheck([ITEM], aiReply.status(status))

    expect(panel().getByRole('alert')).toHaveTextContent(message)
    expect(resultEl()).not.toBeInTheDocument()
    expect(panel().queryByText(CHECKING)).not.toBeInTheDocument()
    expect(s.server.calls).toHaveLength(2)

    await advance(120_000)

    expect(s.server.calls).toHaveLength(2)
  })

  it('AC53: 온라인 확인이 60초 안에 끝나지 않으면 59,999ms까지는 기다리고 60,000ms에 끊고 "지금은 읽지 못했어요"를 보인다', async () => {
    fakeClock()
    const s = await readAndCheck([ITEM], aiReply.hang())
    expect(panel().getByRole('status')).toHaveTextContent(CHECKING)

    await advance(59_999)

    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(panel().getByRole('status')).toHaveTextContent(CHECKING)
    expect(s.server.callsTo(LOWEST)[0].signal?.aborted).toBe(false)

    await advance(1)

    expect(panel().getByRole('alert')).toHaveTextContent(UNREADABLE)
    expect(panel().queryByText(CHECKING)).not.toBeInTheDocument()
    expect(s.server.callsTo(LOWEST)[0].signal?.aborted).toBe(true)
    await advance(120_000)
    expect(s.server.callsTo(LOWEST)).toHaveLength(1)
  })

  it.each([
    ['status가 모르는 값', { status: 'maybe', searchUrl: SEARCH_URL, matches: [], candidates: [] }],
    ['줄 목록이 없음', { status: 'found', searchUrl: SEARCH_URL }],
  ])('AC53: 모양이 다른 응답(%s)이면 "지금은 읽지 못했어요"를 보이고 결과는 없다', async (_name, body) => {
    await readAndCheck([ITEM], aiReply.ok(body))

    expect(panel().getByRole('alert')).toHaveTextContent(UNREADABLE)
    expect(resultEl()).not.toBeInTheDocument()
  })

  it('AC53: 단가 가격표(100g)는 "온라인 가격 확인" 버튼 대신 단위 가격 안내를 보이고 서버에 묻지 않는다', async () => {
    const s = setup()
    s.server.on(READ, readTag(UNIT_PRICE_ITEM))
    openPhotoTab()

    await readPhoto()

    expect(panel().getByText('100g당 가격처럼 단위 가격이라 온라인 가격과 비교하지 않아요.')).toBeInTheDocument()
    expect(panel().queryByRole('button', { name: '온라인 가격 확인' })).not.toBeInTheDocument()
    expect(s.server.callsTo(LOWEST)).toHaveLength(0)
  })

  it('AC53: 확인 중에 취소하면 요청을 끊고, 늦게 온 응답으로 결과가 생기지 않는다', async () => {
    const late = aiReply.hold()
    const s = await readAndCheck([ITEM], late)
    expect(panel().getByRole('status')).toHaveTextContent(CHECKING)

    fireEvent.click(panel().getByRole('button', { name: '취소' }))
    await settle()

    expect(late.signal?.aborted).toBe(true)
    expect(panel().queryByText(CHECKING)).not.toBeInTheDocument()
    expect(checkButton()).toBeEnabled()

    late.release(lowest('found', [ROW_LATE]))
    await settle()

    expect(resultEl()).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent(ROW_LATE_LINE)
    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(s.server.callsTo(LOWEST)).toHaveLength(1)
  })

  it('AC53: 취소하고 다시 확인한 뒤 앞 요청의 늦은 응답이 와도 새 결과가 그대로다', async () => {
    const late = aiReply.hold()
    const s = setup()
    s.server.on(READ, readTag(ITEM))
    s.server.on(LOWEST, late, lowest('found', [ROW_FOUND]))
    openPhotoTab()
    await readPhoto()
    await checkOnline(1)
    fireEvent.click(panel().getByRole('button', { name: '취소' }))
    await settle()
    await checkOnline(2)
    expect(rowButtons().map((button) => button.textContent)).toEqual([ROW_FOUND_LINE])

    late.release(lowest('not_confirmed', [], [ROW_LATE]))
    await settle()

    expect(result().getByText(FOUND_HEAD)).toBeInTheDocument()
    expect(rowButtons().map((button) => button.textContent)).toEqual([ROW_FOUND_LINE])
    expect(panelEl()).not.toHaveTextContent(ROW_LATE_LINE)
  })
})

// ================================================================ 결과 영역 (PRD F31 결과)

describe('온라인 가격 확인 결과 영역 (F31)', () => {
  it('같은 상품으로 고른 줄은 제목 아래 낮은 가격 순으로 최대 3줄이고, 결과가 나오면 결과 제목으로 포커스를 옮긴다', async () => {
    const matches = [
      row('농심 오징어짬뽕컵 67g 6개', 6, 5200, '42'),
      ROW_FOUND,
      row('오징어짬뽕 컵 6입', 6, 6100, '3'),
      row('농심 오징어짬뽕 소컵 6개입', 6, 4950, '15'),
    ]
    await readAndCheck([ITEM], lowest('found', matches))

    expect(result().getByText(TOP_NOTE)).toBeInTheDocument()
    expect(result().getByText(FOUND_HEAD)).toBeInTheDocument()
    expect(result().queryByText(NOT_CONFIRMED_HEAD)).not.toBeInTheDocument()
    expect(rowButtons().map((button) => button.textContent)).toEqual([
      ROW_FOUND_LINE,
      '농심 오징어짬뽕 소컵 6개입 · 6개 묶음 · 4,950원 · 판매처 15곳',
      '농심 오징어짬뽕컵 67g 6개 · 6개 묶음 · 5,200원 · 판매처 42곳',
    ])
    expect(rowButtons().every((button) => button.getAttribute('aria-pressed') === 'false')).toBe(true)
    expect(result().getByRole('heading', { name: RESULT })).toHaveFocus()
    // 끝: 기존 문구와 주 버튼
    expect(result().getByText(END_NOTE)).toBeInTheDocument()
    expect(result().getByRole('button', { name: '고민 목록에 담기' })).toBeInTheDocument()
  })

  it.each(['http://search.danawa.com/?query=x', 'javascript:alert(1)', '검색 주소'])(
    '검색 주소가 https 주소가 아니면(%s) "다나와에서 직접 보기" 링크를 만들지 않는다',
    async (searchUrl) => {
      await readAndCheck([ITEM], aiReply.ok({ status: 'off', searchUrl, matches: [], candidates: [] }))

      expect(result().getByText(TOP_NOTE)).toBeInTheDocument()
      expect(result().queryByRole('link')).not.toBeInTheDocument()
    },
  )

  it('온라인 가격 확인에는 사용자가 고친 상품명·개수를 보낸다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM))
    s.server.on(LOWEST, lowest('off', []))
    openPhotoTab()
    await readPhoto()
    edit('상품명', '오징어짬뽕 컵')
    edit('개수', '12')

    await checkOnline()

    expect(s.server.callsTo(LOWEST)[0].body).toEqual({ name: '오징어짬뽕 컵', brand: '농심', sizeText: '67g×6', size: 67, unit: 'g', count: 12 })
  })
})

// ================================================================ 사진 읽기 실패 (10장 앱 공통)

describe('사진 읽기가 실패하면 (10장 앱 공통 실패 문구)', () => {
  it.each([
    ['서버 제한 429', aiReply.status(429), BUSY],
    ['꺼짐 503', aiReply.status(503), PAUSED],
    ['서버 오류 500', aiReply.status(500), UNREADABLE],
    ['네트워크 오류', aiReply.network(), UNREADABLE],
    ['모양이 다른 응답', aiReply.ok({ items: 'none' }), UNREADABLE],
  ])('%s이면 문구를 role=alert로 보이고 시간이 지나도 다시 보내지 않는다', async (_name, reply, message) => {
    fakeClock()
    const s = setup()
    s.server.on(READ, reply)
    openPhotoTab()

    await readPhoto()

    expect(panel().getByRole('alert')).toHaveTextContent(message)
    expect(productsHeading()).not.toBeInTheDocument()
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    await advance(120_000)
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('사진 읽기는 59,999ms까지 기다리고 60,000ms에 끊고 "지금은 읽지 못했어요"를 보인다', async () => {
    fakeClock()
    const s = setup()
    s.server.on(READ, aiReply.hang())
    openPhotoTab()
    await readPhoto()

    await advance(59_999)

    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(panel().getByRole('status')).toHaveTextContent(READING)
    expect(s.server.callsTo(READ)[0].signal?.aborted).toBe(false)

    await advance(1)

    expect(panel().getByRole('alert')).toHaveTextContent(UNREADABLE)
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(s.server.callsTo(READ)[0].signal?.aborted).toBe(true)
  })
})

// ================================================================ 늦은 응답은 버린다 (10장 앱 공통 · F31)

describe('늦은 응답 (10장 앱 공통 · F31)', () => {
  // plan: a late response from an earlier photo or before an edit is discarded
  it('새 사진을 고르면 앞 사진의 읽기를 끊고, 늦게 온 앞 사진의 응답은 화면에 오르지 않는다', async () => {
    const lateA = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, readTag(ITEM_2))
    openPhotoTab()
    await readPhoto(1)

    await readPhoto(2)

    expect(lateA.signal?.aborted).toBe(true)
    expect(field('상품명')).toHaveValue(ITEM_2.name)

    lateA.release(readTag(ITEM))
    await settle()

    expect(field('상품명')).toHaveValue(ITEM_2.name)
    expect(panel().queryByDisplayValue(ITEM.name)).not.toBeInTheDocument()
    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(s.server.callsTo(READ)).toHaveLength(2)
  })

  it('새 사진을 읽는 중에 앞 사진의 늦은 응답이 와도 읽는 중 표시와 취소가 그대로다', async () => {
    const lateA = aiReply.hold()
    const heldB = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, heldB)
    openPhotoTab()
    await readPhoto(1)
    await readPhoto(2)

    lateA.release(readTag(ITEM))
    await settle()

    expect(productsHeading()).not.toBeInTheDocument()
    expect(panel().getByRole('status')).toHaveTextContent(READING)
    expect(panel().getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(heldB.signal?.aborted).toBe(false)

    heldB.release(readTag(ITEM_2))
    await settle()

    expect(field('상품명')).toHaveValue(ITEM_2.name)
    expect(s.server.callsTo(READ)).toHaveLength(2)
  })

  it.each([
    ['성공 응답', readTag(ITEM)],
    ['서버 제한 429', aiReply.status(429)],
    ['네트워크 오류', aiReply.network()],
  ])('읽는 중에 취소하면 요청을 끊고, 그 뒤 늦게 온 %s은 화면에 아무것도 올리지 않는다', async (_name, lateReply) => {
    const late = aiReply.hold()
    const s = setup()
    s.server.on(READ, late)
    openPhotoTab()
    await readPhoto()

    fireEvent.click(panel().getByRole('button', { name: '취소' }))
    await settle()

    expect(late.signal?.aborted).toBe(true)
    expect(panel().queryByText(READING)).not.toBeInTheDocument()

    late.release(lateReply)
    await settle()

    expect(productsHeading()).not.toBeInTheDocument()
    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it.each([
    ['상품명', '신라면 컵'],
    ['가격', '3500'],
    ['가격 조건', '카드 할인가'],
    ['정상가', '5000'],
    ['개수', '12'],
  ])('확인 중에 %s 칸을 고치면 요청을 끊고, 늦은 응답은 버린다', async (label, value) => {
    const late = aiReply.hold()
    const s = await readAndCheck([ITEM], late)

    edit(label, value)
    await settle()

    expect(late.signal?.aborted).toBe(true)
    expect(panel().queryByText(CHECKING)).not.toBeInTheDocument()

    late.release(lowest('found', [ROW_LATE]))
    await settle()

    expect(resultEl()).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent(ROW_LATE_LINE)
    expect(field(label)).toHaveValue(value)
    expect(s.server.callsTo(LOWEST)).toHaveLength(1)
  })

  it('확인 중에 고른 상품을 바꾸면 요청을 끊고, 늦은 응답은 버린다', async () => {
    const late = aiReply.hold()
    const s = setup()
    s.server.on(READ, readTag(ITEM, ITEM_2))
    s.server.on(LOWEST, late)
    openPhotoTab()
    await readPhoto()
    fireEvent.click(panel().getByRole('radio', { name: ITEM.name }))
    await checkOnline()

    fireEvent.click(panel().getByRole('radio', { name: ITEM_2.name }))
    await settle()

    expect(late.signal?.aborted).toBe(true)
    expect(panel().queryByText(CHECKING)).not.toBeInTheDocument()

    late.release(lowest('found', [ROW_LATE]))
    await settle()

    expect(resultEl()).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent(ROW_LATE_LINE)
    expect(panel().getByRole('radio', { name: ITEM_2.name })).toBeChecked()
    expect(s.server.callsTo(LOWEST)).toHaveLength(1)
  })

  it('결과가 나온 뒤 고른 상품을 바꾸면 결과·규격 확인·비교 문장을 지운다', async () => {
    const s = setup()
    s.server.on(READ, readTag(ITEM, ITEM_2))
    s.server.on(LOWEST, lowest('found', [ROW_FOUND]))
    openPhotoTab()
    await readPhoto()
    fireEvent.click(panel().getByRole('radio', { name: ITEM.name }))
    await checkOnline()
    pickRow(ROW_FOUND_LINE)
    fireEvent.click(result().getByRole('button', { name: SAME_SPEC }))

    fireEvent.click(panel().getByRole('radio', { name: ITEM_2.name }))

    expect(resultEl()).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent('조회 시점')
    expect(panelEl()).not.toHaveTextContent('매장: ')
  })

  it('확인 중에 새 사진을 고르면 확인 요청을 끊고, 늦은 확인 응답은 버린다', async () => {
    const late = aiReply.hold()
    const s = setup()
    s.server.on(READ, readTag(ITEM), readTag(ITEM_2))
    s.server.on(LOWEST, late)
    openPhotoTab()
    await readPhoto(1)
    await checkOnline()

    await readPhoto(2)

    expect(late.signal?.aborted).toBe(true)
    expect(field('상품명')).toHaveValue(ITEM_2.name)

    late.release(lowest('found', [ROW_LATE]))
    await settle()

    expect(resultEl()).not.toBeInTheDocument()
    expect(panelEl()).not.toHaveTextContent(ROW_LATE_LINE)
    expect(field('상품명')).toHaveValue(ITEM_2.name)
  })
})

// ================================================================ 숨은 화면에서 끝나면 포커스를 옮기지 않는다 (10장 앱 공통)

describe('다른 화면을 보는 동안 끝난 요청 (10장 앱 공통)', () => {
  // plan: does not move focus when reading finishes while another menu is shown
  it('읽는 중에 다른 메뉴로 가도 읽기는 계속되고, 거기서 끝나면 포커스를 옮기지 않으며 돌아오면 결과가 보인다', async () => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    openPhotoTab()
    await readPhoto()

    goTo('고민 중인 물건')
    const keep = wishForm().getByRole('button', { name: '담아 두기' })
    keep.focus()
    // jsdom은 숨은 요소의 focus()를 무시하므로, 포커스가 그대로인 것만으로는 숨김 검사가 빠진 구현을 잡지 못한다.
    // 그래서 가격 비교 화면 안의 어떤 요소에도 focus()를 부르지 않았는지도 본다(보이는 경우의 대조는 AC51 첫 시험)
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    held.release(readTag(ITEM))
    await settle()

    expect(keep).toHaveFocus()
    expect(focusedInside(focusSpy, panelOf('가격 비교'))).toEqual([])
    expect(held.signal?.aborted).toBe(false)

    goTo('가격 비교')

    expect(productsHeading()).toBeVisible()
    expect(field('상품명')).toHaveValue(ITEM.name)
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('온라인 확인이 가격 비교의 다른 탭을 보는 동안 끝나도 포커스를 옮기지 않고, 돌아오면 결과가 보인다', async () => {
    const held = aiReply.hold()
    await readAndCheck([ITEM], held)

    goTo('할인 비교')
    const example = within(screen.getByRole('tabpanel', { name: '할인 비교' })).getByRole('button', { name: '예시 넣기' })
    example.focus()
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    held.release(lowest('found', [ROW_FOUND]))
    await settle()

    expect(example).toHaveFocus()
    expect(focusedInside(focusSpy, panelOf('가격표 사진'))).toEqual([])

    goTo('가격표 사진')

    expect(result().getByText(FOUND_HEAD)).toBeVisible()
    expect(rowButtons().map((button) => button.textContent)).toEqual([ROW_FOUND_LINE])
  })
})

// ================================================================ 사진 미리보기 주소 (10장 앱 공통)

describe('사진 미리보기 주소 (10장 앱 공통)', () => {
  // plan: revokes every preview url it created
  it('사진을 바꾸고 취소하고 끝까지 읽고 늦은 응답이 와도, 보이는 주소는 두고 안 보이게 된 주소는 바로 한 번씩 해제한다', async () => {
    const lateA = aiReply.hold()
    const lateB = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, lateB, readTag(ITEM_2))
    const view = openPhotoTab()

    await readPhoto(1)
    expect(s.urls.created).toHaveLength(1)
    expect(previews()).toEqual([s.urls.created[0]])
    expect(s.urls.revoked).toEqual([])

    await readPhoto(2)
    expect(previews()).toEqual([s.urls.created[1]])
    expect(s.urls.revoked).toEqual([s.urls.created[0]])

    fireEvent.click(panel().getByRole('button', { name: '취소' }))
    await settle()
    expect(previews()).toEqual([])
    expect(s.urls.revoked).toEqual([s.urls.created[0], s.urls.created[1]])

    await readPhoto(3)
    expect(field('상품명')).toHaveValue(ITEM_2.name)
    // 읽은 상품을 고치는 동안 사진을 함께 볼 수 있게 미리보기를 남긴다
    expect(previews()).toEqual([s.urls.created[2]])

    lateA.release(readTag(ITEM))
    lateB.release(readTag(ITEM))
    await settle()
    // 늦은 응답은 주소를 새로 만들지도, 보이는 것을 해제하지도 않는다
    expect(s.urls.created).toHaveLength(3)
    expectPreviewUrlsHealthy(s.urls)

    view.unmount()

    expect(s.urls.revoked.toSorted()).toEqual(s.urls.created.toSorted())
  })

  it('화면이 사라질 때 읽는 중이던 사진의 미리보기 주소도 해제한다', async () => {
    const s = setup()
    s.server.on(READ, aiReply.hold())
    const view = openPhotoTab()
    await readPhoto()

    view.unmount()

    expect(s.urls.revoked).toEqual(s.urls.created)
    expect(s.urls.created).toHaveLength(1)
  })
})

// ================================================================ AC54 결과에서 고민 목록에 담기

describe('결과에서 고민 목록에 담기 (AC54)', () => {
  // 담기 폼이 있는 고민 목록 화면에서 시작해 가격표 사진 결과까지 간다
  async function reachResult() {
    goTo('가격 비교')
    goTo('가격표 사진')
    await readPhoto()
    await checkOnline()
  }
  function start() {
    const s = setup()
    s.server.on(READ, readTag(ITEM))
    s.server.on(LOWEST, lowest('found', [ROW_FOUND]))
    openApp()
    return s
  }

  // plan: AC54 (Task 8 계약이 화면에서 이어지는지)
  it('AC54: 담기 폼이 비어 있으면 결과에서 담을 때 고민 목록으로 가서 상품명·가격·다나와 검색 주소를 채우고 이유 칸에 포커스를 둔다', async () => {
    start()
    await reachResult()

    fireEvent.click(result().getByRole('button', { name: '고민 목록에 담기' }))

    expect(screen.getByRole('tab', { name: '고민 중인 물건', selected: true })).toBeInTheDocument()
    expect(wishForm().getByLabelText('상품명')).toHaveValue('농심 오징어짬뽕 소컵 6입')
    expect(wishForm().getByLabelText('가격')).toHaveValue('3980')
    expect(wishForm().getByLabelText('링크 (선택)')).toHaveValue(SEARCH_URL)
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveValue('')
    expect(wishForm().getByText(DRAFT_GUIDE)).toBeInTheDocument()
    expect(wishForm().queryByText(/이미 적은 칸은 그대로 뒀어요/)).not.toBeInTheDocument()
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveFocus()
  })

  it('AC54: 상품명 "라면"·가격 "4500"을 적어 둔 폼은 그대로 두고 링크만 채우며 안내 끝에 둔 칸을 알린다', async () => {
    start()
    fireEvent.change(wishForm().getByLabelText('상품명'), { target: { value: '라면' } })
    fireEvent.change(wishForm().getByLabelText('가격'), { target: { value: '4500' } })
    await reachResult()

    fireEvent.click(result().getByRole('button', { name: '고민 목록에 담기' }))

    expect(wishForm().getByLabelText('상품명')).toHaveValue('라면')
    expect(wishForm().getByLabelText('가격')).toHaveValue('4500')
    expect(wishForm().getByLabelText('링크 (선택)')).toHaveValue(SEARCH_URL)
    expect(wishForm().getByText(`${DRAFT_GUIDE} 이미 적은 칸은 그대로 뒀어요: 상품명·가격`)).toBeInTheDocument()
    expect(wishForm().getByLabelText('사고 싶은 이유')).toHaveFocus()
  })

  it('AC54: 이유를 비운 채 담아 두면 "사고 싶은 이유를 적어 주세요"가 나오고 담기지 않는다', async () => {
    start()
    await reachResult()
    fireEvent.click(result().getByRole('button', { name: '고민 목록에 담기' }))

    fireEvent.click(wishForm().getByRole('button', { name: '담아 두기' }))

    expect(wishForm().getByText('사고 싶은 이유를 적어 주세요')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: ITEM.name })).not.toBeInTheDocument()
  })

  it('AC54: 이유를 적고 담은 뒤 구매함을 누르면, 이유에 자동 비교 문장이 없어 사기 전 점검이 할인 근거로 세지 않는다', async () => {
    start()
    await reachResult()
    fireEvent.click(result().getByRole('button', { name: '고민 목록에 담기' }))
    const user = userEvent.setup()
    await user.type(wishForm().getByLabelText('사고 싶은 이유'), '집에 비상식량이 떨어져서')
    await user.click(wishForm().getByRole('button', { name: '담아 두기' }))

    // 저장된 이유는 사용자가 쓴 글뿐이다(가격 비교 문장이 붙지 않음). 저장 형식은 그대로
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as { schemaVersion: number; items: Record<string, unknown>[] }
    expect(saved.schemaVersion).toBe(1)
    expect(saved.items).toHaveLength(1)
    expect(saved.items[0]).toMatchObject({ name: ITEM.name, priceKrw: 3980, reason: '집에 비상식량이 떨어져서', url: SEARCH_URL })

    const card = within(screen.getByRole('article', { name: ITEM.name }))
    await user.click(card.getByRole('button', { name: '구매함' }))
    const check = within(card.getByRole('region', { name: '사기 전 점검' }))

    expect(check.queryByText(/할인이 없어도 살까요/)).not.toBeInTheDocument()
    // 할인 근거가 없으니 할인 질문은 "한 번 생각해 볼 질문"에 남는다(그 밖에 n개 안)
    await user.click(check.getByRole('button', { name: /^그 밖에 \d+개 보기$/ }))
    expect(within(check.getByRole('list', { name: '한 번 생각해 볼 질문' })).getByText('할인·한정 때문인가요?')).toBeInTheDocument()
  })
})
