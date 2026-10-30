import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { SizeCandidate } from './ai/types'
import type { Fit } from './logic/fit'
import { STORAGE_KEY } from './logic/storage'
import type { WishItem } from './logic/wishlist'
import { FitCheck, type FitAiSlot } from './screens/FitCheck'
import { aiReply, mockAiServer, mockImagePipeline, mockObjectUrls, nextTask, type MockAiServer } from './test/aiMocks'

// PRD F44 놓을 자리 확인 2단계(AI 치수 읽기): 검증 사례 AC67 열여덟 경우와 10장 "앱 공통"의 사진 규칙
// (안내·대기 상한·취소·늦은 응답·숨은 화면·미리보기·실패 문구).
// 확인 상자 문장·칸 값·기준의 계산은 src/logic/sizeFill.test.ts가 보고, 이 파일은 화면의 흐름과 동작을 본다.
// 계획 Task 6의 테스트 이름은 해당 it 위 `// plan:` 주석에 있다.
// 총괄 판정: R18(aiSlot의 apply·active·current), R19(단위 mixed면 넣을 값·지울 칸·넣기 버튼 없음),
// Task 3 리뷰의 기준 30자 방어(FitCheck가 isFit에 맞지 않는 값을 저장하지 않음), 자리가 FitCheck의 <form> 안이라는 점
// (Enter로 저장되지 않음, 단위 선택이 첫 오류 칸 포커스를 가져가지 않음).
// 메뉴를 옮겨 다니는 시험(숨은 화면 포커스)과 결정하기가 있어 App 전체를 그린다.
// 서버·사진·미리보기 주소 흉내는 src/test/aiMocks.ts의 것만 쓴다. 60초 상한과 "시간이 지나도 다시 보내지 않음" 시험만
// 가짜 setTimeout을 쓰므로(userEvent·waitFor·findBy가 멈춤) 사진·버튼 조작은 fireEvent와 settle()로 한다.
//
// PRD·계획에 글이 없어 정한 이름·값(가정):
// - 가정: 확인 상자는 접근 가능한 이름이 PRD가 부르는 이름 그대로 "확인 상자"인 묶음(role=group)이고, 문장은 그 안의 알림 칸(role=status)에
//   AI가 읽은 내용 · 제품/포장 · 적힌 순서 · 넣을 값 · 지울 칸 차례로 한 줄씩 있다. F32와 같다.
// - 가정: 진행 문구는 "읽는 중"(role=status), 표기를 하나도 못 찾았을 때 문장은 알림 칸(role=status)이다. F31·F32와 같다.
// - 가정: 표기가 여러 개면 라디오 이름은 그 표기의 "AI가 읽은 내용" 줄에서 끝의 " · 사진과 같은지 확인해 주세요"를 뺀 것(PRD 문장, 판정 R29-I1)이다.
// - 가정: 읽기가 끝나 확인 상자가 나타나면 확인 상자로 포커스를 옮긴다(보이는 화면이고 포커스가 이 자리에 있거나 어디에도 없을 때만). F32와 같다.
// - 가정: 확인 상자의 '취소'는 상자를 닫고 "상품 페이지 캡처에서 치수 읽기"로 포커스를 돌린다. F32와 같다.
// - 가정: AC67이 적지 않은 놓을 곳은 AC64 첫 사례('싱크대 옆 칸' 40×30×50), 물건 칸의 처음 글자는 결과를 가르지 않는 40·40·40이다.
// - 가정: "캡처 크게 보기"는 고른 캡처의 작은 미리보기 바로 아래 접이식(<summary>)이고, 펼치면 대체 글 "고른 캡처"인 큰 사진이 보인다.
//   접힌 큰 사진은 DOM에 있든 없든 상관없이 "보이지 않는다"만 단언한다(expectLargeHidden).

// ---------------------------------------------------------------- PRD 문장 (글자 그대로)

const PICK = '상품 페이지 캡처에서 치수 읽기'
const PHOTO_NOTICE =
  '사진은 읽기 위해 Google Gemini로 보내져요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있으니 얼굴이나 개인정보가 담기지 않게 해 주세요.'
const DECODE_FAILED = '이 사진을 열 수 없어요. 다른 사진을 고르거나 직접 입력해 주세요.'
const BUSY = '지금은 사용이 많아요. 잠시 뒤 다시 해 주세요.'
const PAUSED = 'AI 기능을 잠시 멈췄어요. 직접 입력해 주세요.'
const UNREADABLE = '지금은 읽지 못했어요. 직접 입력해 주세요.'

const READ_TEXT = '제품 크기: 가로 32 x 깊이 25 x 높이 47cm'
const READ_LINE = 'AI가 읽은 내용: ‘제품 크기: 가로 32 x 깊이 25 x 높이 47cm’ · 사진과 같은지 확인해 주세요'
const PRODUCT = '제품 치수예요.'
const PACKAGE = '포장 치수예요. 실제 쓰는 상태의 크기와 다를 수 있어요.'
const UNKNOWN_KIND = '제품 치수인지 포장 치수인지 적혀 있지 않아요. 확인해 주세요.'
const ORDER = '축이 분명하지 않아 적힌 순서대로 가로·깊이·높이에 넣어요. 맞는지 확인해 주세요.'
const MIXED = '축마다 단위가 달라 자동으로 넣지 않아요. 직접 입력해 주세요.'
const CHOOSE_UNIT = '단위를 고르면 넣을 값을 cm로 보여 드려요.'
const FILL_FIRST = '넣을 값: 가로 32 · 깊이 25 · 높이 47cm'
const NOT_FOUND = '치수 표기를 찾지 못했어요. 직접 입력해 주세요.'
const NOT_CM = 'cm로 적어 주세요(예: 40 또는 40.5)'

// 가정한 이름 (위 목록)
const READING = '읽는 중'
const BOX = '확인 상자'
const ENLARGE = '캡처 크게 보기'
const LARGE = '고른 캡처'

// ---------------------------------------------------------------- 응답 견본 (서버가 돌려주는 모양: 칸이 모두 있다)

// AC67 첫 사례: 표기 1개(text '제품 크기: 가로 32 x 깊이 25 x 높이 47cm', product, labeled, 32·25·47, cm)
const FIRST: SizeCandidate = { text: READ_TEXT, label: null, kind: 'product', axes: 'labeled', w: 32, d: 25, h: 47, unit: 'cm' }
const size = (over: Partial<SizeCandidate> = {}): SizeCandidate => ({ ...FIRST, ...over })
const readSize = (...candidates: SizeCandidate[]) => aiReply.ok({ candidates, note: null })

// ---------------------------------------------------------------- 저장 기록

const POT = '전기 포트'
const DAY = 24 * 60 * 60 * 1000
const NOW = Date.now()
const at = (days: number) => new Date(NOW + days * DAY).toISOString()
// 어제 담은 고민 중인 물건 (2일 남음)
const thing = (over: Record<string, unknown> = {}) => ({
  id: 'k1',
  name: POT,
  priceKrw: 32000,
  reason: '냄비로 물을 끓이기 번거로워서',
  url: null,
  createdAt: at(-1),
  updatedAt: at(-1),
  reviewAt: at(2),
  status: 'considering',
  decidedAt: null,
  ...over,
})
const savedItem = () => (JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items as Record<string, unknown>[]).find((item) => item.id === 'k1')
const savedFit = () => savedItem()?.fit as Fit | undefined

// ---------------------------------------------------------------- 준비·정리

const BASE = 'https://ai.test'
const READ = '/api/read-size'

type Setup = { server: MockAiServer; urls: ReturnType<typeof mockObjectUrls> }
let current: Setup | null = null

function setup(pipeline: { decode?: 'ok' | 'fail'; toBlob?: 'ok' | 'null' } = {}): Setup {
  localStorage.clear()
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [thing()] }))
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
    localStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  }
})

// 요청·응답 사이의 비동기 연결(promise, jsdom 작업, details의 toggle 이벤트)을 act 안에서 흘려 보낸다
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

const LABELS = {
  place: '놓을 곳 이름',
  sw: '놓을 곳 가로(cm)',
  sd: '놓을 곳 깊이(cm)',
  sh: '놓을 곳 높이(cm)',
  iw: '물건 가로(cm)',
  id: '물건 깊이(cm)',
  ih: '물건 높이(cm)',
} as const
type FieldKey = keyof typeof LABELS
// AC64 첫 사례의 놓을 곳
const SINK: Partial<Record<FieldKey, string>> = { place: '싱크대 옆 칸', sw: '40', sd: '30', sh: '50' }

const cardEl = () => screen.getByRole('article', { name: POT })
const summaryEl = () =>
  within(cardEl()).getByText((_: string, el: Element | null) => el?.tagName === 'SUMMARY' && /^놓을 자리 확인/.test(el.textContent ?? ''))
const detailsEl = () => summaryEl().closest('details') as HTMLDetailsElement
const panel = () => within(detailsEl())
const field = (key: FieldKey) => panel().getByLabelText(LABELS[key]) as HTMLInputElement
const itemValues = () => [field('iw').value, field('id').value, field('ih').value]
const saveButton = () => panel().getByRole('button', { name: '확인하고 저장' })
const photoInput = () => panel().getByLabelText(PICK)
const queryBox = () => panel().queryByRole('group', { name: BOX })
const boxEl = () => panel().getByRole('group', { name: BOX })
const box = () => within(boxEl())
/** 확인 상자 알림 칸의 줄 */
const boxLines = () => Array.from(box().getByRole('status').children).map((child) => child.textContent)

function enter(values: Partial<Record<FieldKey, string>>) {
  for (const [key, value] of Object.entries(values) as [FieldKey, string][]) fireEvent.change(field(key), { target: { value } })
}
function goTo(tab: string) {
  fireEvent.click(screen.getByRole('tab', { name: tab }))
}
// 접이식을 펼친다(toggle 이벤트는 jsdom 작업으로 온다)
async function togglePanel() {
  fireEvent.click(summaryEl())
  await settle()
}
async function openApp() {
  const view = render(<App />)
  await togglePanel()
  return view
}
function choosePhoto(fileName = 'capture.png') {
  const file = new File(['capture-bytes'], fileName, { type: 'image/png' })
  fireEvent.change(photoInput(), { target: { files: [file] } })
  return file
}
// 사진을 고르고 n번째 읽기 요청이 갈 때까지 흘려 보낸다(답은 미리 server.on(READ, …)로 둔다)
async function readPhoto(n = 1) {
  choosePhoto()
  await sent(n)
}
// 표기들을 읽어 확인 상자까지 연 상태. 물건 칸에 미리 적을 글자가 있으면 사진을 고르기 전에 적는다
async function openBox(candidates: SizeCandidate[], before: Partial<Record<FieldKey, string>> = {}) {
  const s = setup()
  s.server.on(READ, readSize(...candidates))
  await openApp()
  enter(before)
  await readPhoto()
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

// 캡처 크게 보기: 접이식을 누르고(toggle 이벤트는 jsdom 작업으로 온다) 큰 사진을 찾는다
async function toggleEnlarge() {
  fireEvent.click(panel().getByText(ENLARGE, { selector: 'summary' }))
  await settle()
}
const largeImage = () => panel().getByRole('img', { name: LARGE })
// 접혔거나 아직 없으면 큰 사진은 보이지 않는다(접힌 안의 요소를 DOM에 두든 두지 않든 같다)
function expectLargeHidden() {
  const large = panel().queryByRole('img', { name: LARGE, hidden: true })
  if (large !== null) expect(large).not.toBeVisible()
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

// ================================================================ 버튼과 전송 안내 (F44 2단계 · 10장 앱 공통 · AC67)

describe('캡처에서 치수 읽기 버튼과 전송 안내 (F44 2단계, 10장 앱 공통)', () => {
  it.each([
    ['빈', ''],
    ['없는', undefined],
  ])('AC67: 서버 주소가 %s 빌드에는 치수 읽기 버튼·안내가 없지만 놓을 자리 확인(직접 입력)은 그대로 있고 서버 요청도 없다', async (_name, value) => {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items: [thing()] }))
    vi.stubEnv('VITE_AI_SERVER_URL', value)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    await openApp()

    expect(screen.queryByLabelText(PICK)).not.toBeInTheDocument()
    expect(screen.queryByText(PHOTO_NOTICE)).not.toBeInTheDocument()
    expect(field('iw')).toBeInTheDocument()
    expect(saveButton()).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('서버 주소가 있으면 물건 치수 칸 위에 치수 읽기 버튼이 있고, 바로 아래 전송 안내가 누르기 전부터 보인다', async () => {
    const s = setup()
    await openApp()

    const input = photoInput()
    expect(input).toHaveAttribute('type', 'file')
    expect(input).toHaveAttribute('accept', 'image/*')
    // 갤러리에서 고르기도 되게 capture를 두지 않는다(총괄 판정 R7)
    expect(input).not.toHaveAttribute('capture')
    const label = input.closest('label') as HTMLElement
    expect(label).toHaveTextContent(PICK)
    const notice = panel().getByText(PHOTO_NOTICE)
    expect(label.nextElementSibling).toBe(notice)
    expect(notice).toBeVisible()
    // 놓을 곳 칸 다음, 물건 치수 칸 위
    expect(field('sh').compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(input.compareDocumentPosition(field('iw')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(s.server.calls).toHaveLength(0)
  })

  it('고른 사진을 줄인 JPEG로 /api/read-size에 한 번 보내고, 읽는 동안 진행 문구(role=status)와 취소를 보인다', async () => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(READ, held)
    await openApp()

    await readPhoto()

    // 가짜 canvas가 만든 JPEG 4바이트(ff d8 ff e0)의 base64. 원래 캡처('capture-bytes')가 아니다
    expect(s.server.callsTo(READ).map((call) => call.body)).toEqual([{ image: btoa('\xff\xd8\xff\xe0'), mimeType: 'image/jpeg' }])
    expect(panel().getByText(READING)).toHaveAttribute('role', 'status')
    expect(panel().getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(previews()).toHaveLength(1)

    held.release(readSize(FIRST))
    await settle()

    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(queryBox()).toBeInTheDocument()
  })

  it.each([
    ['브라우저가 열 수 없는 사진', 'fail', 'ok'],
    ['JPEG로 다시 그리지 못한 사진', 'ok', 'null'],
  ] as const)('AC67: %s이면 "이 사진을 열 수 없어요…"를 알리고 서버에 보내지 않는다', async (_name, decode, toBlob) => {
    const s = setup({ decode, toBlob })
    await openApp()

    choosePhoto()
    await settle()

    expect(panel().getByRole('alert')).toHaveTextContent(DECODE_FAILED)
    expect(s.server.calls).toHaveLength(0)
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(queryBox()).not.toBeInTheDocument()
    expect(previews()).toEqual([])
  })
})

// ================================================================ AC67 확인 상자와 넣기

describe('읽은 치수를 확인 상자에서 확인하고 넣는다 (F44 2단계, AC67)', () => {
  // plan: AC67 열여덟 경우
  it("AC67: 표기 1개(제품·축 이름 분명·cm)면 AI가 읽은 내용·제품 치수·넣을 값을 보이고, 넣기를 누르면 물건 칸이 32·25·47이 되어 '확인하고 저장'에 포커스가 가며 아직 저장하지 않는다", async () => {
    await openBox([FIRST])

    expect(box().queryAllByRole('radio')).toHaveLength(0)
    expect(boxLines()).toEqual([READ_LINE, PRODUCT, FILL_FIRST])
    expect(box().queryByLabelText('단위')).not.toBeInTheDocument()

    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['32', '25', '47'])
    expect(saveButton()).toHaveFocus()
    expect(queryBox()).not.toBeInTheDocument()
    expect(savedFit()).toBeUndefined()
    expect(previews()).toEqual([])
  })

  it("AC67: 표기 2개(label '접었을 때'·'펼쳤을 때')면 라디오 2개를 보이고 고르기 전에는 넣기가 막히며, 고르면 '접었을 때 · '가 붙은 AI가 읽은 내용과 함께 넣을 수 있다", async () => {
    const folded = size({ label: '접었을 때', text: '접었을 때 30 x 20 x 10cm', w: 30, d: 20, h: 10 })
    const unfolded = size({ label: '펼쳤을 때', text: '펼쳤을 때 60 x 40 x 10cm', w: 60, d: 40, h: 10 })
    await openBox([folded, unfolded])

    const radios = box().getAllByRole('radio')
    expect(radios).toHaveLength(2)
    expect(radios[0]).toHaveAccessibleName('접었을 때 · AI가 읽은 내용: ‘접었을 때 30 x 20 x 10cm’')
    expect(radios[1]).toHaveAccessibleName('펼쳤을 때 · AI가 읽은 내용: ‘펼쳤을 때 60 x 40 x 10cm’')
    expect(box().getByRole('button', { name: '넣기' })).toBeDisabled()
    expect(boxLines()).toEqual([])

    fireEvent.click(radios[0])

    expect(boxLines()).toEqual(['접었을 때 · AI가 읽은 내용: ‘접었을 때 30 x 20 x 10cm’ · 사진과 같은지 확인해 주세요', PRODUCT, '넣을 값: 가로 30 · 깊이 20 · 높이 10cm'])
    expect(box().getByRole('button', { name: '넣기' })).toBeEnabled()

    fireEvent.click(radios[1])
    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['60', '40', '10'])
  })

  it("AC67: 단위를 못 읽었으면(null) '단위' 선택을 두고 넣을 값 대신 단위를 고르라는 줄을 보이며, 고르기 전에는 넣기가 막힌다", async () => {
    await openBox([size({ unit: null, w: 320, d: 250, h: 470 })])

    const select = box().getByLabelText('단위') as HTMLSelectElement
    expect(Array.from(select.options).map((option) => [option.value, option.textContent])).toEqual([
      ['', '단위 고르기'],
      ['mm', 'mm'],
      ['cm', 'cm'],
      ['m', 'm'],
    ])
    expect(select).toHaveValue('')
    expect(boxLines()).toEqual([READ_LINE, PRODUCT, CHOOSE_UNIT])
    expect(box().queryByText(/^넣을 값/)).not.toBeInTheDocument()
    expect(box().getByRole('button', { name: '넣기' })).toBeDisabled()

    fireEvent.change(select, { target: { value: 'mm' } })

    expect(boxLines()).toEqual([READ_LINE, PRODUCT, FILL_FIRST])
    expect(box().getByRole('button', { name: '넣기' })).toBeEnabled()

    // 단위 고르기로 돌리면 다시 막힌다
    fireEvent.change(select, { target: { value: '' } })
    expect(boxLines()).toEqual([READ_LINE, PRODUCT, CHOOSE_UNIT])
    expect(box().getByRole('button', { name: '넣기' })).toBeDisabled()

    fireEvent.change(select, { target: { value: 'mm' } })
    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['32', '25', '47'])
  })

  it("AC67: 축이 분명하지 않으면(order) 적힌 순서 문장과 '적힌 순서대로 넣기' 버튼이고, 넣고 확인하고 저장하면 기준 '적힌 순서로 넣은 치수'를 저장한다", async () => {
    await openBox([size({ axes: 'order' })], SINK)

    expect(boxLines()).toEqual([READ_LINE, PRODUCT, ORDER, FILL_FIRST])
    expect(box().queryByRole('button', { name: '넣기' })).not.toBeInTheDocument()

    fireEvent.click(box().getByRole('button', { name: '적힌 순서대로 넣기' }))
    await settle()
    fireEvent.click(saveButton())
    await settle()

    expect(savedFit()).toMatchObject({ item: { w: 320, d: 250, h: 470 }, basis: '적힌 순서로 넣은 치수' })
  })

  it('AC67: 단위가 mixed면 AI가 읽은 내용과 "축마다 단위가 달라…"만 보이고 넣을 값·지울 칸·넣기 버튼은 없다', async () => {
    // 물건 칸이 채워져 있고 모르는 값이 있어도 지울 칸 줄을 보이지 않는다(넣지 않으니까)
    await openBox([size({ unit: 'mixed', axes: 'order', h: null })], { iw: '40', id: '40', ih: '40' })

    expect(boxLines()).toEqual([READ_LINE, MIXED])
    expect(box().queryByText(/넣을 값/)).not.toBeInTheDocument()
    expect(box().queryByText(/모름인 칸은/)).not.toBeInTheDocument()
    expect(box().queryByRole('button', { name: '넣기' })).not.toBeInTheDocument()
    expect(box().queryByRole('button', { name: '적힌 순서대로 넣기' })).not.toBeInTheDocument()
    expect(box().queryByLabelText('단위')).not.toBeInTheDocument()

    // 취소로 닫을 수 있고 칸은 그대로다
    fireEvent.click(box().getByRole('button', { name: '취소' }))
    await settle()
    expect(queryBox()).not.toBeInTheDocument()
    expect(itemValues()).toEqual(['40', '40', '40'])
  })

  it("AC67: 포장 치수면 포장 문장을 보이고, 넣고 확인하고 저장하면 기준 '포장 치수'를 저장하며 결과 첫 줄 끝에 ' (포장 치수 기준)'이 붙는다", async () => {
    await openBox([size({ kind: 'package' })], SINK)

    expect(boxLines()).toEqual([READ_LINE, PACKAGE, FILL_FIRST])

    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()
    fireEvent.click(saveButton())
    await settle()

    expect(savedFit()).toMatchObject({ place: '싱크대 옆 칸', space: { w: 400, d: 300, h: 500 }, item: { w: 320, d: 250, h: 470 }, basis: '포장 치수' })
    const result = panel().getByRole('status', { name: '저장한 치수로 본 결과' })
    expect(result.children[1]).toHaveTextContent(/^입력 치수상 싱크대 옆 칸에 들어가요\. \(포장 치수 기준\)$/)
  })

  it('AC67: 포장 치수를 넣어 저장한 뒤 물건 가로를 고치고 저장하면 기준을 저장하지 않는다', async () => {
    await openBox([size({ kind: 'package' })], SINK)
    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()
    fireEvent.click(saveButton())
    await settle()
    expect(savedFit()?.basis).toBe('포장 치수')

    enter({ iw: '33' })
    fireEvent.click(saveButton())
    await settle()

    expect(savedFit()).toMatchObject({ item: { w: 330, d: 250, h: 470 } })
    expect(savedFit()).not.toHaveProperty('basis')
  })

  it("AC67: 표기 없음 + 적힌 순서 + label 20자를 넣고 저장하면 기준은 앞의 두 말(29자)에 label 앞 1자를 붙인 30자다", async () => {
    const label = '가나다라마바사아자차카타파하거너더러머버'
    expect(label).toHaveLength(20)
    await openBox([size({ kind: 'unknown', axes: 'order', label })], SINK)

    fireEvent.click(box().getByRole('button', { name: '적힌 순서대로 넣기' }))
    await settle()
    fireEvent.click(saveButton())
    await settle()

    expect(savedFit()?.basis).toBe('제품·포장 표기 없음 · 적힌 순서로 넣은 치수 · 가')
    expect(savedFit()?.basis).toHaveLength(30)
  })

  it('AC67: 제품·포장 표기가 없으면 "제품 치수인지 포장 치수인지 적혀 있지 않아요…"를 보인다', async () => {
    await openBox([size({ kind: 'unknown' })])

    expect(boxLines()).toEqual([READ_LINE, UNKNOWN_KIND, FILL_FIRST])
  })

  it('AC67: mm 320·250·470.5를 넣으면 물건 칸이 32·25·47.1이다', async () => {
    await openBox([size({ unit: 'mm', w: 320, d: 250, h: 470.5 })])

    expect(boxLines()[2]).toBe('넣을 값: 가로 32 · 깊이 25 · 높이 47.1cm')
    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['32', '25', '47.1'])
  })

  it('AC67: m 0.35·0.2·1.2를 넣으면 물건 칸이 35·20·120이다', async () => {
    await openBox([size({ unit: 'm', w: 0.35, d: 0.2, h: 1.2 })])

    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['35', '20', '120'])
  })

  it("AC67: 가로 20000mm면 가로가 '모름'이고, 넣으면 가로 칸의 지금 값을 지우고 가로 칸에 포커스가 간다", async () => {
    await openBox([size({ unit: 'mm', w: 20000, d: 250, h: 470 })], { iw: '40', id: '40', ih: '40' })

    expect(boxLines()).toEqual([READ_LINE, PRODUCT, '넣을 값: 가로 모름 · 깊이 25 · 높이 47cm', '모름인 칸은 지금 값을 지워요: 가로'])
    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['', '25', '47'])
    expect(field('iw')).toHaveFocus()
  })

  it("AC67: 가로 0.99mm·높이 10000.4mm면 가로·높이가 '모름'이다", async () => {
    await openBox([size({ unit: 'mm', w: 0.99, d: 250, h: 10000.4 })])

    expect(boxLines()).toEqual([READ_LINE, PRODUCT, '넣을 값: 가로 모름 · 깊이 25 · 높이 모름'])
    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['', '25', ''])
    expect(field('iw')).toHaveFocus()
  })

  it('AC67: 치수 표기를 하나도 못 찾으면 "치수 표기를 찾지 못했어요…"를 보이고 확인 상자도 칸 변경도 없다', async () => {
    const s = setup()
    s.server.on(READ, aiReply.ok({ candidates: [], note: '치수 표기가 없어요' }))
    await openApp()
    enter({ iw: '40', id: '40', ih: '40' })
    await readPhoto()

    expect(panel().getByText(NOT_FOUND)).toHaveAttribute('role', 'status')
    expect(queryBox()).not.toBeInTheDocument()
    expect(itemValues()).toEqual(['40', '40', '40'])
    expect(previews()).toEqual([])
  })

  it("AC67: 물건 칸이 채워진 상태에서 높이 null이면 '모름인 칸은 지금 값을 지워요: 높이'를 누르기 전에 보이고, 넣으면 아는 칸은 덮어쓰고 높이 칸은 비우며 높이 칸에 포커스가 간다", async () => {
    await openBox([size({ h: null })], { iw: '40', id: '40', ih: '40' })

    expect(boxLines()).toEqual([READ_LINE, PRODUCT, '넣을 값: 가로 32 · 깊이 25 · 높이 모름', '모름인 칸은 지금 값을 지워요: 높이'])
    // 누르기 전에는 칸이 그대로다
    expect(itemValues()).toEqual(['40', '40', '40'])

    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['32', '25', ''])
    expect(field('ih')).toHaveFocus()
    expect(savedFit()).toBeUndefined()
  })

  it('확인 상자를 연 채 물건 칸을 고치면 상자는 그대로이고 지울 칸 줄을 지금 칸 글자로 다시 만든다', async () => {
    await openBox([size({ h: null })])
    expect(boxLines()).toEqual([READ_LINE, PRODUCT, '넣을 값: 가로 32 · 깊이 25 · 높이 모름'])

    enter({ ih: '50' })
    expect(boxLines()).toEqual([READ_LINE, PRODUCT, '넣을 값: 가로 32 · 깊이 25 · 높이 모름', '모름인 칸은 지금 값을 지워요: 높이'])

    enter({ ih: '' })
    expect(boxLines()).toEqual([READ_LINE, PRODUCT, '넣을 값: 가로 32 · 깊이 25 · 높이 모름'])
    expect(queryBox()).toBeInTheDocument()
  })

  it("확인 상자에서 취소하면 물건 칸과 저장 기록은 그대로이고 '상품 페이지 캡처에서 치수 읽기'로 포커스가 돌아간다", async () => {
    await openBox([size({ h: null })], { iw: '40', id: '40', ih: '40' })

    fireEvent.click(box().getByRole('button', { name: '취소' }))
    await settle()

    expect(queryBox()).not.toBeInTheDocument()
    expect(itemValues()).toEqual(['40', '40', '40'])
    expect(photoInput()).toHaveFocus()
    expect(savedFit()).toBeUndefined()
    expect(previews()).toEqual([])
  })

  it('읽기가 끝나 확인 상자가 나타나면 확인 상자로 포커스를 옮긴다', async () => {
    await openBox([FIRST])

    expect(boxEl()).toHaveFocus()
  })

  it('읽는 중에 사용자가 다른 칸에 적고 있으면 읽기가 끝나도 포커스를 빼앗지 않는다', async () => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    await openApp()
    await readPhoto()

    field('place').focus()
    held.release(readSize(FIRST))
    await settle()

    expect(field('place')).toHaveFocus()
    expect(queryBox()).toBeInTheDocument()
  })
})

// ================================================================ FitCheck의 <form> 안에 있는 자리

describe('치수 읽기 자리는 놓을 자리 확인 폼 안에 있다 (판정: Enter·첫 오류 칸 포커스)', () => {
  it("치수 읽기의 라디오·단위 선택·넣기에서 Enter를 눌러도 '확인하고 저장'이 눌리지 않는다", async () => {
    const two = [size({ unit: null, w: 320, d: 250, h: 470 }), size({ label: '펼쳤을 때', unit: null, w: 600, d: 400, h: 100 })]
    await openBox(two, { ...SINK, iw: '40', id: '40', ih: '40' })
    const user = userEvent.setup()

    // 대조: 칸이 모두 올바라 이 폼이 제출되면 저장된다
    const radio = box().getAllByRole('radio')[0]
    await user.click(radio)
    expect(radio).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(savedFit()).toBeUndefined()

    const select = box().getByLabelText('단위')
    await user.selectOptions(select, 'mm')
    select.focus()
    await user.keyboard('{Enter}')
    expect(savedFit()).toBeUndefined()

    box().getByRole('button', { name: '넣기' }).focus()
    await user.keyboard('{Enter}')
    await settle()
    // Enter는 넣기만 누른다: 칸이 바뀌고 저장은 하지 않는다
    expect(itemValues()).toEqual(['32', '25', '47'])
    expect(savedFit()).toBeUndefined()

    // 대조: 저장 버튼은 그대로 저장한다
    await user.click(saveButton())
    expect(savedFit()).toMatchObject({ item: { w: 320, d: 250, h: 470 } })
  })

  it('확인 상자가 열린 채 저장에 실패해도 첫 오류 칸(물건 가로)으로 포커스가 가고, 단위 선택은 오류로 표시되지 않는다', async () => {
    await openBox([size({ unit: null })], SINK)
    const select = box().getByLabelText('단위')

    fireEvent.click(saveButton())
    await settle()

    expect(field('iw')).toHaveAccessibleDescription(NOT_CM)
    expect(field('iw')).toHaveFocus()
    expect(select).not.toHaveAttribute('aria-invalid')
    expect(savedFit()).toBeUndefined()
  })
})

// ================================================================ 기준 30자 방어 (Task 3 리뷰)

describe('기준이 30자를 넘으면 저장하지 않는다 (F44 basis, Task 3 리뷰)', () => {
  const item = (): WishItem => thing() as WishItem
  function renderFit(basis: string) {
    const onSave = vi.fn((_id: string, _fit: Fit | null) => true)
    const aiSlot = (slot: FitAiSlot): ReactNode => (
      <button type="button" onClick={() => slot.apply({ w: '32', d: '25', h: '47' }, basis)}>
        치수 넣기(시험)
      </button>
    )
    const target = item()
    render(<FitCheck item={target} items={[target]} onSave={onSave} aiSlot={aiSlot} />)
    return { onSave }
  }
  async function applyAndSave() {
    fireEvent.click(screen.getByText(/^놓을 자리 확인/))
    await settle()
    for (const [key, value] of Object.entries(SINK) as [FieldKey, string][]) {
      fireEvent.change(screen.getByLabelText(LABELS[key]), { target: { value } })
    }
    fireEvent.click(screen.getByRole('button', { name: '치수 넣기(시험)' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '확인하고 저장' }))
    await settle()
  }

  it('31자 기준을 넘겨받으면 onSave를 부르지 않고 칸과 결과를 그대로 둔다', async () => {
    const { onSave } = renderFit('가'.repeat(31))
    await applyAndSave()

    expect(onSave).not.toHaveBeenCalled()
    expect((screen.getByLabelText(LABELS.iw) as HTMLInputElement).value).toBe('32')
    expect(screen.queryByText('저장한 치수로 본 결과')).not.toBeInTheDocument()
  })

  it('대조: 30자 기준은 그대로 저장한다', async () => {
    const { onSave } = renderFit('가'.repeat(30))
    await applyAndSave()

    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.lastCall?.[1]).toMatchObject({ basis: '가'.repeat(30), item: { w: 320, d: 250, h: 470 } })
  })
})

// ================================================================ 실패 문구 (10장 앱 공통)

describe('치수 읽기가 실패하면 (10장 앱 공통 실패 문구)', () => {
  // plan: 429 and 503 show the shared failure messages and send nothing more
  it.each([
    ['서버 제한 429', aiReply.status(429), BUSY],
    ['꺼짐 503', aiReply.status(503), PAUSED],
    ['서버 오류 500', aiReply.status(500), UNREADABLE],
    ['네트워크 오류', aiReply.network(), UNREADABLE],
  ])('%s이면 문구를 role=alert로 보이고 칸은 그대로이며 시간이 지나도 다시 보내지 않는다', async (_name, reply, message) => {
    fakeClock()
    const s = setup()
    s.server.on(READ, reply)
    await openApp()
    enter({ iw: '40', id: '40', ih: '40' })

    await readPhoto()

    expect(panel().getByRole('alert')).toHaveTextContent(message)
    expect(queryBox()).not.toBeInTheDocument()
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(itemValues()).toEqual(['40', '40', '40'])
    expect(previews()).toEqual([])
    await advance(120_000)
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  const { label: _label, ...noLabel } = FIRST
  it.each([
    ['candidates가 배열이 아님', { candidates: 'none', note: null }],
    ['note가 없음', { candidates: [FIRST] }],
    ['label 칸이 없음', { candidates: [noLabel], note: null }],
    ['text가 null', { candidates: [{ ...FIRST, text: null }], note: null }],
    ["kind가 'box'", { candidates: [{ ...FIRST, kind: 'box' }], note: null }],
    ["axes가 'xyz'", { candidates: [{ ...FIRST, axes: 'xyz' }], note: null }],
    ["unit이 'CM'", { candidates: [{ ...FIRST, unit: 'CM' }], note: null }],
    ["w가 문자열 '320mm'", { candidates: [{ ...FIRST, w: '320mm' }], note: null }],
  ])('응답 모양이 다르면(%s) "지금은 읽지 못했어요"를 보인다', async (_name, body) => {
    const s = setup()
    s.server.on(READ, aiReply.ok(body))
    await openApp()

    await readPhoto()

    expect(panel().getByRole('alert')).toHaveTextContent(UNREADABLE)
    expect(queryBox()).not.toBeInTheDocument()
  })

  it('치수 읽기는 59,999ms까지 기다리고 60,000ms에 끊고 "지금은 읽지 못했어요"를 보인다', async () => {
    fakeClock()
    const s = setup()
    s.server.on(READ, aiReply.hang())
    await openApp()
    await readPhoto()

    await advance(59_999)

    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(panel().getByText(READING)).toBeInTheDocument()
    expect(s.server.callsTo(READ)[0].signal?.aborted).toBe(false)

    await advance(1)

    expect(panel().getByRole('alert')).toHaveTextContent(UNREADABLE)
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(s.server.callsTo(READ)[0].signal?.aborted).toBe(true)
  })

  it('실패한 뒤 다시 사진을 고르면 앞의 실패 문구가 사라지고 새로 읽는다', async () => {
    const s = setup()
    s.server.on(READ, aiReply.status(500), readSize(FIRST))
    await openApp()
    await readPhoto(1)
    expect(panel().getByRole('alert')).toHaveTextContent(UNREADABLE)

    await readPhoto(2)

    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(boxLines()).toEqual([READ_LINE, PRODUCT, FILL_FIRST])
  })
})

// ================================================================ 늦은 응답은 버린다 (F44 · 10장 앱 공통)

describe('취소와 늦은 응답 (F44 2단계, 10장 앱 공통)', () => {
  // plan: a late size response after the item was decided or the panel was closed is discarded
  it('AC67: 읽는 중 그 물건을 결정하면 읽기를 끊고, 늦게 온 응답은 버려 포커스도 그대로다', async () => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    await openApp()
    await readPhoto()

    fireEvent.click(within(cardEl()).getByRole('button', { name: '구매함' }))
    await settle()
    fireEvent.click(screen.getByRole('button', { name: '구매함 확인' }))
    await settle()

    expect(held.signal?.aborted).toBe(true)
    expect(savedItem()?.status).toBe('purchased')
    const focused = document.activeElement
    expect(focused).toHaveTextContent('고민 중인 물건')
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    held.release(readSize(FIRST))
    await settle()

    expect(document.activeElement).toBe(focused)
    expect(focusSpy).not.toHaveBeenCalled()
    expect(screen.queryByRole('group', { name: BOX })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(savedFit()).toBeUndefined()
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it.each([
    ['성공 응답', readSize(FIRST)],
    ['서버 제한 429', aiReply.status(429)],
    ['네트워크 오류', aiReply.network()],
  ])('읽는 중 놓을 자리 확인을 접으면 읽기를 끊고, 늦게 온 %s은 다시 펼쳐도 아무것도 올리지 않는다', async (_name, lateReply) => {
    const late = aiReply.hold()
    const s = setup()
    s.server.on(READ, late)
    await openApp()
    enter({ iw: '40', id: '40', ih: '40' })
    await readPhoto()

    await togglePanel()

    expect(detailsEl().open).toBe(false)
    expect(late.signal?.aborted).toBe(true)

    late.release(lateReply)
    await settle()
    await togglePanel()

    expect(queryBox()).not.toBeInTheDocument()
    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(itemValues()).toEqual(['40', '40', '40'])
    expect(previews()).toEqual([])
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('확인 상자가 열린 채 놓을 자리 확인을 접으면 상자를 닫고, 다시 펼쳐도 상자 없이 칸은 그대로다', async () => {
    await openBox([size({ h: null })], { iw: '40', id: '40', ih: '40' })

    await togglePanel()
    await togglePanel()

    expect(queryBox()).not.toBeInTheDocument()
    expect(itemValues()).toEqual(['40', '40', '40'])
    expect(previews()).toEqual([])
  })

  it.each([
    ['성공 응답', readSize(FIRST)],
    ['서버 제한 429', aiReply.status(429)],
    ['네트워크 오류', aiReply.network()],
  ])("읽는 중에 취소하면 요청을 끊고 치수 읽기 버튼에 포커스를 돌리며, 그 뒤 늦게 온 %s은 화면에 아무것도 올리지 않는다", async (_name, lateReply) => {
    const late = aiReply.hold()
    const s = setup()
    s.server.on(READ, late)
    await openApp()
    enter({ iw: '40', id: '40', ih: '40' })
    await readPhoto()

    fireEvent.click(panel().getByRole('button', { name: '취소' }))
    await settle()

    expect(late.signal?.aborted).toBe(true)
    expect(panel().queryByText(READING)).not.toBeInTheDocument()
    expect(photoInput()).toHaveFocus()

    late.release(lateReply)
    await settle()

    expect(queryBox()).not.toBeInTheDocument()
    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(itemValues()).toEqual(['40', '40', '40'])
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('새 사진을 고르면 앞 사진의 읽기를 끊고, 늦게 온 앞 사진의 응답은 확인 상자를 바꾸지 않는다', async () => {
    const lateA = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, readSize(size({ kind: 'package' })))
    await openApp()
    await readPhoto(1)

    await readPhoto(2)

    expect(lateA.signal?.aborted).toBe(true)
    expect(boxLines()).toEqual([READ_LINE, PACKAGE, FILL_FIRST])

    lateA.release(readSize(FIRST))
    await settle()

    expect(boxLines()).toEqual([READ_LINE, PACKAGE, FILL_FIRST])
    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(s.server.callsTo(READ)).toHaveLength(2)
  })

  it('새 사진을 읽는 중에 앞 사진의 늦은 실패가 와도 읽는 중 표시와 취소가 그대로다', async () => {
    const lateA = aiReply.hold()
    const heldB = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, heldB)
    await openApp()
    await readPhoto(1)
    await readPhoto(2)

    lateA.release(aiReply.status(429))
    await settle()

    expect(panel().queryByRole('alert')).not.toBeInTheDocument()
    expect(panel().getByText(READING)).toBeInTheDocument()
    expect(panel().getByRole('button', { name: '취소' })).toBeInTheDocument()
    expect(heldB.signal?.aborted).toBe(false)

    heldB.release(readSize(FIRST))
    await settle()

    expect(boxLines()).toEqual([READ_LINE, PRODUCT, FILL_FIRST])
  })

  it('확인 상자가 열려 있을 때 새 사진을 고르면 앞의 확인 상자는 닫히고 읽는 중이 된다', async () => {
    const heldB = aiReply.hold()
    const s = setup()
    s.server.on(READ, readSize(FIRST), heldB)
    await openApp()
    await readPhoto(1)
    expect(queryBox()).toBeInTheDocument()

    await readPhoto(2)

    expect(queryBox()).not.toBeInTheDocument()
    expect(panel().getByText(READING)).toBeInTheDocument()
    heldB.release(readSize(size({ kind: 'unknown' })))
    await settle()
    expect(boxLines()).toEqual([READ_LINE, UNKNOWN_KIND, FILL_FIRST])
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
    await openApp()
    await readPhoto()

    goTo('가격 비교')
    const tab = screen.getByRole('tab', { name: '가격 비교' })
    if (keepFocus) tab.focus()
    else (document.activeElement as HTMLElement | null)?.blur()
    // jsdom은 숨은 요소의 focus()를 무시하므로 고민 중인 물건 화면 안의 어떤 요소에도 focus()를 부르지 않았는지 본다
    // (보이는 경우의 대조는 위의 "확인 상자로 포커스를 옮긴다")
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    held.release(readSize(FIRST))
    await settle()

    if (keepFocus) expect(tab).toHaveFocus()
    else expect(document.body).toHaveFocus()
    expect(focusedInside(focusSpy, panelOf('고민 중인 물건'))).toEqual([])
    expect(held.signal?.aborted).toBe(false)

    goTo('고민 중인 물건')

    expect(boxEl()).toBeVisible()
    expect(boxLines()).toEqual([READ_LINE, PRODUCT, FILL_FIRST])
    expect(s.server.callsTo(READ)).toHaveLength(1)

    // 돌아와서 넣을 수 있다
    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()
    expect(itemValues()).toEqual(['32', '25', '47'])
  })
})

// ================================================================ 사진 미리보기 주소 (10장 앱 공통)

describe('캡처 미리보기 주소 (10장 앱 공통)', () => {
  it('읽는 중과 확인 상자에서는 미리보기가 보이고, 사진을 바꾸거나 넣으면 앞 주소를 바로 한 번씩 해제한다', async () => {
    const lateA = aiReply.hold()
    const s = setup()
    s.server.on(READ, lateA, readSize(FIRST))
    await openApp()

    await readPhoto(1)
    expect(previews()).toEqual([s.urls.created[0]])

    await readPhoto(2)
    expect(previews()).toEqual([s.urls.created[1]])
    expect(s.urls.revoked).toEqual([s.urls.created[0]])
    expect(queryBox()).toBeInTheDocument()

    lateA.release(readSize(FIRST))
    await settle()
    expect(previews()).toEqual([s.urls.created[1]])

    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()
    expect(previews()).toEqual([])
    expect(s.urls.revoked.toSorted()).toEqual(s.urls.created.toSorted())
  })

  it('화면이 사라질 때 읽는 중이던 캡처의 미리보기 주소도 해제하고 요청도 끊는다', async () => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    const view = await openApp()
    await readPhoto()

    view.unmount()

    expect(held.signal?.aborted).toBe(true)
    expect(s.urls.revoked.toSorted()).toEqual(s.urls.created.toSorted())
    held.release(readSize(FIRST))
    await settle()
  })
})

// ================================================================ 확인 상자 문장과 캡처 크게 보기 (F44 2단계, AC71)

describe('AI가 읽은 내용을 사진과 대조한다 (F44 2단계, AC71)', () => {
  it('AC71: 확인 상자 첫 줄은 "AI가 읽은 내용…사진과 같은지 확인해 주세요"이고 "적힌 내용"으로 시작하는 줄은 없다', async () => {
    await openBox([FIRST])

    expect(boxLines()[0]).toBe('AI가 읽은 내용: ‘제품 크기: 가로 32 x 깊이 25 x 높이 47cm’ · 사진과 같은지 확인해 주세요')
    expect(boxLines().filter((line) => line?.startsWith('적힌 내용'))).toEqual([])
    expect(box().queryByText(/^적힌 내용/)).not.toBeInTheDocument()
  })

  it('AC71: 응답을 받은 뒤 캡처 크게 보기를 누르면 같은 주소의 큰 사진이 보이고 새 주소·요청은 없다', async () => {
    const s = await openBox([FIRST])
    expect(s.urls.created).toHaveLength(1)
    expectLargeHidden()

    await toggleEnlarge()

    const large = largeImage()
    expect(large).toBeVisible()
    // previews()는 문서 순서대로 [작은 미리보기, 큰 사진]이다
    expect(previews()).toEqual([s.urls.created[0], s.urls.created[0]])
    expect(large).toHaveAttribute('src', s.urls.created[0])
    expect(s.urls.created).toHaveLength(1)
    expect(s.urls.revoked).toEqual([])
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('AC71: 다시 누르면 큰 사진이 접힌다', async () => {
    const s = await openBox([FIRST])
    await toggleEnlarge()
    expect(largeImage()).toBeVisible()

    await toggleEnlarge()

    expectLargeHidden()
    // 작은 미리보기는 그대로 있고 주소도 해제하지 않는다
    expect(previews()[0]).toBe(s.urls.created[0])
    expect(s.urls.created).toHaveLength(1)
    expect(s.urls.revoked).toEqual([])
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('AC71: 크게 본 채로 넣으면 미리보기와 큰 사진이 함께 사라지고 주소가 해제된다', async () => {
    const s = await openBox([FIRST])
    await toggleEnlarge()
    expect(largeImage()).toBeVisible()

    fireEvent.click(box().getByRole('button', { name: '넣기' }))
    await settle()

    expect(itemValues()).toEqual(['32', '25', '47'])
    expect(previews()).toEqual([])
    expect(panel().queryByRole('img', { name: LARGE, hidden: true })).not.toBeInTheDocument()
    expect(panel().queryByText(ENLARGE, { selector: 'summary' })).not.toBeInTheDocument()
    expect(s.urls.created).toHaveLength(1)
    expect(s.urls.revoked).toEqual(s.urls.created)
  })

  it('AC71: 읽는 중에도 캡처 크게 보기로 큰 사진을 볼 수 있고 요청은 1번이다', async () => {
    const held = aiReply.hold()
    const s = setup()
    s.server.on(READ, held)
    await openApp()
    await readPhoto()
    expect(panel().getByText(READING)).toBeInTheDocument()

    await toggleEnlarge()

    expect(largeImage()).toBeVisible()
    expect(largeImage()).toHaveAttribute('src', s.urls.created[0])
    expect(s.urls.created).toHaveLength(1)
    expect(s.server.callsTo(READ)).toHaveLength(1)

    // 응답이 와도 같은 사진이고 요청은 늘지 않는다
    held.release(readSize(FIRST))
    await settle()
    expect(queryBox()).toBeInTheDocument()
    expect(largeImage()).toHaveAttribute('src', s.urls.created[0])
    expect(s.urls.created).toHaveLength(1)
    expect(s.server.callsTo(READ)).toHaveLength(1)
  })

  it('AC71: 크게 본 채로 새 캡처를 고르면 앞 주소를 한 번만 해제하고 큰 사진도 새 주소를 쓴다', async () => {
    const s = setup()
    s.server.on(READ, readSize(FIRST), readSize(FIRST))
    await openApp()
    await readPhoto(1)
    await toggleEnlarge()
    expect(largeImage()).toHaveAttribute('src', s.urls.created[0])

    await readPhoto(2)

    expect(s.urls.created).toHaveLength(2)
    expect(s.urls.revoked).toEqual([s.urls.created[0]])
    expect(largeImage()).toBeVisible()
    expect(largeImage()).toHaveAttribute('src', s.urls.created[1])
    expect(previews()).toEqual([s.urls.created[1], s.urls.created[1]])
  })
})

// ================================================================ 확인 상자 첫 줄이 상자의 설명 (F44 2단계, AC77)

describe('확인 상자의 설명은 AI가 읽은 내용 첫 줄이다 (F44 2단계, AC77)', () => {
  it('AC77: 표기 하나를 읽으면 확인 상자의 설명이 AI가 읽은 내용 첫 줄이다', async () => {
    await openBox([FIRST])

    // 상자 이름은 그대로 '확인 상자'이고, 설명이 첫 줄과 같은 문장이다
    expect(boxEl()).toHaveAccessibleName(BOX)
    expect(boxEl()).toHaveAccessibleDescription(READ_LINE)
    // 설명으로 이은 요소는 알림 칸의 첫 줄 그 자체다
    const describedBy = boxEl().getAttribute('aria-describedby')
    expect(describedBy).not.toBeNull()
    expect(document.getElementById(describedBy ?? '')).toBe(box().getByRole('status').firstElementChild)
    expect(box().getByRole('status').firstElementChild).toHaveTextContent(READ_LINE)
  })

  it('AC77: 표기가 둘이면 고르기 전에는 설명이 없고 첫 표기를 고르면 그 첫 줄이 설명이다', async () => {
    const folded = size({ label: '접었을 때', text: '접었을 때 30 x 20 x 10cm', w: 30, d: 20, h: 10 })
    const unfolded = size({ label: '펼쳤을 때', text: '펼쳤을 때 60 x 40 x 10cm', w: 60, d: 40, h: 10 })
    await openBox([folded, unfolded])

    // 고르기 전에는 첫 줄이 없다. 없는 요소를 가리키는 연결도 두지 않는다
    expect(boxLines()).toEqual([])
    expect(boxEl()).toHaveAccessibleName(BOX)
    expect(boxEl()).not.toHaveAccessibleDescription()
    expect(boxEl()).not.toHaveAttribute('aria-describedby')

    const radios = box().getAllByRole('radio')
    fireEvent.click(radios[0])

    expect(boxEl()).toHaveAccessibleName(BOX)
    expect(boxEl()).toHaveAccessibleDescription('접었을 때 · AI가 읽은 내용: ‘접었을 때 30 x 20 x 10cm’ · 사진과 같은지 확인해 주세요')

    // 다른 표기를 고르면 설명도 그 표기의 첫 줄로 바뀐다
    fireEvent.click(radios[1])

    expect(boxEl()).toHaveAccessibleDescription('펼쳤을 때 · AI가 읽은 내용: ‘펼쳤을 때 60 x 40 x 10cm’ · 사진과 같은지 확인해 주세요')
  })

  it('AC77: 단위가 mixed여도 첫 줄이 설명이다', async () => {
    await openBox([size({ unit: 'mixed', axes: 'order' })])

    // mixed는 첫 줄과 단위 문장만 보인다. 설명은 그중 첫 줄이다
    expect(boxLines()).toEqual([READ_LINE, MIXED])
    expect(boxEl()).toHaveAccessibleDescription(READ_LINE)
    expect(boxEl().getAttribute('aria-describedby')).toBe(box().getByRole('status').firstElementChild?.id)
  })
})
