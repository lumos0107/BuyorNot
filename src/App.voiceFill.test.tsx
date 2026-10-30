import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { VoiceFillResponse } from './ai/types'
import { aiReply, FakeMediaRecorder, mockAiServer, mockMicrophone, nextTask, type AiReply, type MockAiServer } from './test/aiMocks'

// PRD F33 말로 담기 (AC57·AC58)와 10장 "앱 공통"의 녹음 규칙(안내·대기 상한·취소·늦은 응답·메뉴 이동·숨은 화면).
// 응답을 칸에 합치는 계산과 안내 줄은 src/logic/voiceFill.test.ts가, 녹음기의 끝 방식은 src/screens/ai/useRecorder.test.tsx가 보고,
// 이 파일은 담기 폼 화면의 흐름과 동작을 본다. 계획 Task 14의 테스트 이름은 해당 it 위 `// plan:` 주석에 있다.
// 메뉴를 옮겨 다니는 시험이 있어 App 전체를 그린다. 마이크·녹음기·서버 흉내는 src/test/aiMocks.ts의 것만 쓴다.
// 가짜 타이머: 녹음 길이(Date), 20초 자동 멈춤·60초 상한(setTimeout), 남은 초(setInterval)를 모두 시험하므로
// Date·setTimeout·clearTimeout·setInterval·clearInterval을 가짜로 둔다(훅 테스트와 같다). 그래서 userEvent·waitFor·findBy 대신
// fireEvent와 settle()(실제 setImmediate로 한 턴씩 넘김)로 진행한다.
//
// PRD·계획에 글이 없어 정한 것(가정):
// - 가정: 남은 시간 "듣는 중 · {n}초 남음"은 role=timer(기본 aria-live off)로 둔다. 1초마다 읽어 주면 그 소리가 녹음에 섞이기 때문이다.
// - 가정: 마이크 권한을 기다리는 동안 "말로 담기"는 누를 수 없게(disabled) 둔다. 이때 새 문구는 없다.
// - 가정: 녹음이 시작되면 "멈추기"로, 녹음 중·받아쓰는 중 취소와 실패 문구 뒤에는 "말로 담기"로 포커스를 옮긴다.
//   PRD는 채운 뒤의 포커스만 정하고, 취소 뒤는 applying-ai-results 규칙 6("시작 버튼으로 돌아간다")을 따른다.
// - 가정: 받아쓰는 동안 사용자가 폼의 다른 칸에 적고 있으면 응답이 와도 포커스를 빼앗지 않는다(applying-ai-results 규칙 6).
// - 가정: 받아쓰는 중(녹음이 끝난 뒤)에 다른 메뉴로 옮기면 요청은 이어지고 끝나면 폼을 채우되 포커스는 옮기지 않는다.
//   PRD 10장이 메뉴 이동으로 버리는 것은 "권한을 기다리는 중이든 녹음 중이든"뿐이고, 읽기는 이어진다고 정했기 때문이다.
// - 가정: AC57에서 PRD가 적지 않은 받아쓴 말(기간만·정도 4 등)은 결과를 가르지 않는 문장으로 두었다.
// - 가정: AC58 "응답 정도 null·받아쓴 말 '두 개 사고 싶어'"의 다른 칸은 모두 null이다(말하지 않은 것은 추정하지 않는다).
// - 가정: 녹음 결과의 형식(mimeType)이 비어 있으면 보내지 않고 "이 브라우저에서는 녹음할 수 없어요…"를 알린다(총괄 판정 R11).

// ---------------------------------------------------------------- PRD 문장 (글자 그대로)

const VOICE_NOTICE =
  '녹음은 받아쓰기 위해 Google Gemini로 보내져요. 무료 서비스라 구글이 서비스 개선에 쓸 수 있으니 개인정보는 말하지 말아 주세요.'
const START = '말로 담기'
const STOP = '멈추기'
const CANCEL = '취소'
const listening = (seconds: number) => `듣는 중 · ${seconds}초 남음`
const TRANSCRIBING = 'AI가 받아쓰는 중이에요'
const heard = (transcript: string) => `AI가 받아쓴 내용: ‘${transcript}’ · 확인해 주세요`
const kept = (names: string) => `이미 적은 칸은 그대로 뒀어요: ${names}`
const NOTHING = '채울 내용을 찾지 못했어요. 직접 입력해 주세요.'
const UNSUPPORTED = '이 브라우저에서는 녹음할 수 없어요. 직접 입력해 주세요.'
const DENIED = '마이크를 쓸 수 없어요. 직접 입력해 주세요.'
const TOO_SHORT = '녹음이 너무 짧아요. 다시 말해 주세요.'
const INTERRUPTED = '녹음이 중간에 멈췄어요. 다시 말해 주세요.'
const BUSY = '지금은 사용이 많아요. 잠시 뒤 다시 해 주세요.'
const PAUSED = 'AI 기능을 잠시 멈췄어요. 직접 입력해 주세요.'
const UNREADABLE = '지금은 읽지 못했어요. 직접 입력해 주세요.'
const GEMINI_LIMITED = 'AI 사용이 제한됐어요. 나중에 다시 시도하거나 직접 입력해 주세요.'

// ---------------------------------------------------------------- 응답 견본 (서버가 돌려주는 모양: 칸이 모두 있다)

// AC57 사례 1
const YOGA_TRANSCRIPT = '요가 매트 삼만 오천 원짜리 사고 싶어. 집에서 홈트 하려고. 고민은 삼 일 할게.'
const YOGA: VoiceFillResponse = {
  transcript: YOGA_TRANSCRIPT,
  name: '요가 매트',
  price: 35000,
  reason: '집에서 홈트 하려고',
  desire: null,
  periodDays: 3,
}
const yoga = (over: Partial<VoiceFillResponse> = {}) => aiReply.ok({ ...YOGA, ...over })
const BLANK: VoiceFillResponse = { transcript: '', name: null, price: null, reason: null, desire: null, periodDays: null }

// FakeMediaRecorder가 멈출 때 내는 4바이트(1a 45 df a3)
const RECORDED_AUDIO = btoa('\x1a\x45\xdf\xa3')

// ---------------------------------------------------------------- 준비·정리

const BASE = 'https://ai.test'
const VOICE = '/api/voice-fill'

type Permission = 'granted' | 'denied' | 'pending'
// url을 적으면(undefined 포함) 그 값을 서버 주소로 둔다. 적지 않으면 BASE
type SetupOptions = { url?: string | undefined; permission?: Permission; trackCount?: number; recorder?: boolean }
type Setup = { server: MockAiServer; mic: ReturnType<typeof mockMicrophone>; view: ReturnType<typeof render> }
let current: Setup | null = null

function setup(options: SetupOptions = {}): Setup {
  const { permission = 'granted', trackCount, recorder = true } = options
  const url = 'url' in options ? options.url : BASE
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'] })
  vi.stubEnv('VITE_AI_SERVER_URL', url)
  const server = mockAiServer(BASE)
  const mic = mockMicrophone({ permission, trackCount })
  if (recorder) vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  const view = render(<App />)
  current = { server, mic, view }
  return current
}

afterEach(() => {
  // 순서: cleanup() → 요청 단언 → 가짜 전역 되돌리기 → 환경 변수 → 실제 타이머
  try {
    cleanup()
    if (current) expect(current.server.unexpected, '등록하지 않았거나 다 쓴 요청').toEqual([])
  } finally {
    current = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    vi.useRealTimers()
  }
})

// 요청·응답 사이의 비동기 연결(promise, jsdom FileReader)을 act 안에서 흘려 보낸다
async function settle(turns = 10) {
  for (let i = 0; i < turns; i += 1) {
    await act(async () => {
      await nextTask()
    })
  }
}
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
  await settle()
}
async function sent(n = 1) {
  await act(async () => {
    await current?.server.waitForCalls(VOICE, n)
  })
  await settle()
}

// ---------------------------------------------------------------- 화면 조작·조회

const form = () => within(screen.getByRole('form', { name: '물건 담기' }))
const startButton = () => form().getByRole('button', { name: START })
const stopButton = () => form().getByRole('button', { name: STOP })
const cancelButton = () => form().getByRole('button', { name: CANCEL })
const nameField = () => form().getByLabelText('상품명') as HTMLInputElement
const priceField = () => form().getByLabelText('가격') as HTMLInputElement
const reasonField = () => form().getByLabelText('사고 싶은 이유') as HTMLTextAreaElement
// 갖고 싶은 정도('4 많이')·고민 기간('7일', '직접 입력') 라디오
const radio = (name: string) => form().getByRole('radio', { name }) as HTMLInputElement

const DESIRE_NAMES = ['1 별로', '2 조금', '3 보통', '4 많이', '5 아주 많이']
const PERIOD_NAMES = ['1일', '3일', '7일', '직접 입력']
const checkedOf = (names: string[]) => names.find((name) => radio(name).checked) ?? null

type FormValues = { name: string; price: string; reason: string; desire: string | null; period: string | null; customDays: string | null }
function values(): FormValues {
  const custom = form().queryByLabelText('고민 일수') as HTMLInputElement | null
  return {
    name: nameField().value,
    price: priceField().value,
    reason: reasonField().value,
    desire: checkedOf(DESIRE_NAMES),
    period: checkedOf(PERIOD_NAMES),
    customDays: custom?.value ?? null,
  }
}
const EMPTY_FORM: FormValues = { name: '', price: '', reason: '', desire: null, period: '3일', customDays: null }

// 안내 칸(role=status) 가운데 이 줄을 담은 것의 줄 목록. 없으면 null
function statusLinesWith(line: string): string[] | null {
  const region = form()
    .queryAllByRole('status')
    .find((element) => within(element).queryByText(line) !== null)
  return region ? within(region).getAllByRole('paragraph').map((p) => p.textContent) : null
}
// 말로 담기 안내가 하나도 없다(받아쓴 내용 줄·찾지 못함 줄이 담긴 칸이 없음)
function expectNoVoiceStatus() {
  const voiceLine = /AI가 받아쓴 내용|채웠어요|이미 적은 칸은 그대로 뒀어요|채울 내용을 찾지 못했어요/
  expect(form().queryAllByRole('status').filter((element) => voiceLine.test(element.textContent ?? ''))).toEqual([])
}

function goTo(tab: string) {
  fireEvent.click(screen.getByRole('tab', { name: tab }))
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

// "말로 담기"를 눌러 녹음을 시작한다(권한은 setup에서 정함)
async function pressStart() {
  fireEvent.click(startButton())
  await settle()
}
// ms만큼 말하고 "멈추기"를 누른다. 보낼 녹음이면 n번째 요청이 갈 때까지 흘려 보낸다(답은 미리 server.on(VOICE, …)로 둔다)
async function speakAndStop(ms = 1500) {
  await advance(ms)
  fireEvent.click(stopButton())
  await settle()
}
async function record(n = 1, ms = 1500) {
  await pressStart()
  await speakAndStop(ms)
  await sent(n)
}
// 녹음 하나를 보내고 답을 받아 폼에 채운다
async function fillBy(reply: AiReply) {
  const s = current!
  s.server.on(VOICE, reply)
  await record()
}

// ================================================================ 버튼 위치와 전송 안내 (F33 위치 · 10장 앱 공통)

describe('말로 담기 버튼과 전송 안내 (F33 · 10장 앱 공통)', () => {
  it.each([
    ['빈', ''],
    ['없는', undefined],
  ])('서버 주소가 %s 빌드에는 말로 담기와 녹음 안내가 없고 마이크도 서버도 부르지 않는다', (_name, url) => {
    const s = setup({ url })

    expect(screen.queryByRole('button', { name: START })).not.toBeInTheDocument()
    expect(screen.queryByText(VOICE_NOTICE)).not.toBeInTheDocument()
    expect(s.mic.getUserMedia).not.toHaveBeenCalled()
    expect(s.server.calls).toEqual([])
  })

  it('서버 주소가 있으면 담기 폼 맨 위(상품명 위)에 말로 담기가 있고, 바로 아래 녹음 안내가 누르기 전부터 보인다', () => {
    const s = setup()

    const button = startButton()
    const notice = form().getByText(VOICE_NOTICE)
    expect(notice).toBeVisible()
    expect(button.nextElementSibling).toBe(notice)
    // 폼 제목 다음, 상품명 앞
    expect(form().getByText('물건 담기').compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(button.compareDocumentPosition(nameField()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 누르기 전에는 마이크를 열지 않는다
    expect(s.mic.getUserMedia).not.toHaveBeenCalled()
    expect(s.server.calls).toEqual([])
  })
})

// ================================================================ 흐름: 권한 → 녹음 → 받아쓰는 중 → 결과 (F33)

describe('말로 담기 흐름 (F33)', () => {
  it('누르면 마이크 권한을 묻고, 녹음 중에는 남은 초와 멈추기·취소를, 멈추면 녹음을 /api/voice-fill에 한 번 보내고 받아쓰는 동안 진행 문구와 취소를 보인다', async () => {
    const s = setup({ permission: 'pending', trackCount: 2 })
    const held = aiReply.hold()
    s.server.on(VOICE, held)

    fireEvent.click(startButton())
    await settle()

    expect(s.mic.getUserMedia).toHaveBeenCalledWith({ audio: true })
    // 가정: 권한을 기다리는 동안은 다시 누를 수 없다
    expect(startButton()).toBeDisabled()

    await act(async () => {
      s.mic.grant()
    })
    await settle()

    expect(form().queryByRole('button', { name: START })).not.toBeInTheDocument()
    expect(form().getByRole('timer')).toHaveTextContent(listening(20))
    expect(stopButton()).toBeInTheDocument()
    expect(cancelButton()).toBeInTheDocument()
    // 가정: 녹음이 시작되면 멈추기로 포커스
    expect(stopButton()).toHaveFocus()
    // 녹음 안내는 녹음 중에도 보인다
    expect(form().getByText(VOICE_NOTICE)).toBeVisible()

    await advance(1000)
    expect(form().getByRole('timer')).toHaveTextContent(listening(19))

    await speakAndStop(500)
    await sent()

    // 녹음기가 만든 형식에서 매개변수를 뗀 값(audio/webm;codecs=opus → audio/webm)과 녹음만 보낸다
    expect(s.server.callsTo(VOICE).map((call) => call.body)).toEqual([{ audio: RECORDED_AUDIO, mimeType: 'audio/webm' }])
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
    // 진행 문구는 role=status
    expect(form().getAllByRole('status').map((element) => element.textContent)).toContain(TRANSCRIBING)
    expect(cancelButton()).toBeInTheDocument()
    expect(form().queryByRole('button', { name: STOP })).not.toBeInTheDocument()

    held.release(yoga())
    await settle()

    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
    expect(startButton()).toBeEnabled()
    expect(values().name).toBe('요가 매트')
  })

  it('녹음 중 취소하면 녹음을 버리고 트랙을 멈추며 보내지 않고, 말로 담기에 포커스가 간다', async () => {
    const s = setup({ trackCount: 2 })
    await pressStart()
    await advance(3000)

    fireEvent.click(cancelButton())
    await settle()

    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(s.server.calls).toEqual([])
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
    expect(form().queryByRole('alert')).not.toBeInTheDocument()
    // 가정: 취소 뒤에는 시작 버튼으로 돌아간다
    expect(startButton()).toHaveFocus()
    expect(values()).toEqual(EMPTY_FORM)
  })

  it('안내가 보이는 상태에서 다시 말로 담기를 누르면 앞의 안내를 지우고 새로 녹음한다', async () => {
    setup()
    await pressStart()
    await speakAndStop(500)
    expect(form().getByRole('alert')).toHaveTextContent(TOO_SHORT)

    await pressStart()

    expect(form().queryByRole('alert')).not.toBeInTheDocument()
    expect(form().getByRole('timer')).toHaveTextContent(listening(20))
  })

  it('채운 뒤 담아 두기를 누르면 말로 담기 안내를 지운다(저장은 사용자가 누를 때만)', async () => {
    setup()
    await fillBy(yoga())
    // 자동 저장은 없다
    expect(screen.queryByRole('region', { name: '고민 중인 물건 목록' })).not.toBeInTheDocument()
    expect(statusLinesWith(heard(YOGA_TRANSCRIPT))).not.toBeNull()

    fireEvent.click(form().getByRole('button', { name: '담아 두기' }))

    expect(screen.getByRole('region', { name: '고민 중인 물건 목록' })).toBeInTheDocument()
    expectNoVoiceStatus()
  })

  // 판정 R13: 물건을 담아 폼이 비면 결과가 들어갈 곳이 없어지므로 취소와 같은 길로 끊는다
  it('R13: 받아쓰는 중에 칸을 직접 채워 담아 두기를 누르면 물건은 담기고, 요청을 끊어 늦게 온 응답이 비운 폼을 다시 채우지 않는다', async () => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(VOICE, held)
    await record()
    fireEvent.change(nameField(), { target: { value: '폼롤러' } })
    fireEvent.change(priceField(), { target: { value: '12000' } })
    fireEvent.change(reasonField(), { target: { value: '운동 끝나고 쓰려고' } })

    fireEvent.click(form().getByRole('button', { name: '담아 두기' }))
    await settle()

    expect(screen.getByRole('region', { name: '고민 중인 물건 목록' })).toHaveTextContent('폼롤러')
    expect(held.signal?.aborted).toBe(true)
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
    expect(startButton()).toBeEnabled()
    // 취소 버튼을 누른 것이 아니라서 "말로 담기"로 포커스를 옮기지 않는다
    expect(startButton()).not.toHaveFocus()

    held.release(yoga())
    await settle()

    expect(values()).toEqual(EMPTY_FORM)
    expectNoVoiceStatus()
    expect(form().queryByRole('alert')).not.toBeInTheDocument()
    expect(s.server.callsTo(VOICE)).toHaveLength(1)
  })

  it('R13: 녹음 중에 담아 두기를 누르면 같은 길로 녹음을 버리고 트랙을 멈추며 보내지 않는다', async () => {
    const s = setup({ trackCount: 2 })
    await pressStart()
    await advance(3000)
    fireEvent.change(nameField(), { target: { value: '폼롤러' } })
    fireEvent.change(priceField(), { target: { value: '12000' } })
    fireEvent.change(reasonField(), { target: { value: '운동 끝나고 쓰려고' } })

    fireEvent.click(form().getByRole('button', { name: '담아 두기' }))
    await settle()
    await advance(60_000)

    expect(screen.getByRole('region', { name: '고민 중인 물건 목록' })).toHaveTextContent('폼롤러')
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
    expect(s.server.calls).toEqual([])
    expect(values()).toEqual(EMPTY_FORM)
    expectNoVoiceStatus()
  })

  it('R13: 빈 칸 오류로 담지 못한 담아 두기는 받아쓰기를 끊지 않는다(폼이 비지 않음)', async () => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(VOICE, held)
    await record()

    fireEvent.click(form().getByRole('button', { name: '담아 두기' }))
    await settle()

    expect(screen.queryByRole('region', { name: '고민 중인 물건 목록' })).not.toBeInTheDocument()
    expect(held.signal?.aborted).toBe(false)
    expect(form().getByText(TRANSCRIBING)).toBeInTheDocument()

    held.release(yoga())
    await settle()

    expect(values().name).toBe('요가 매트')
    expect(s.server.callsTo(VOICE)).toHaveLength(1)
  })
})

// ================================================================ AC57 받아쓴 내용을 담기 폼에 넣기

describe('받아쓴 내용을 담기 폼에 넣는다 (AC57)', () => {
  // plan: AC57 여덟 경우
  it('AC57: 빈 폼에 받아쓰기 응답이 오면 상품명·가격 35000·이유를 채우고 정도는 그대로·기간 3일이며, 받아쓴 내용과 채운 칸을 알리고 상품명에 포커스가 간다', async () => {
    setup()

    await fillBy(yoga())

    expect(values()).toEqual({ name: '요가 매트', price: '35000', reason: '집에서 홈트 하려고', desire: null, period: '3일', customDays: null })
    expect(statusLinesWith(heard(YOGA_TRANSCRIPT))).toEqual([heard(YOGA_TRANSCRIPT), '상품명·가격·이유·고민 기간을 채웠어요.'])
    expect(nameField()).toHaveFocus()
  })

  it('AC57: 상품명 "매트"를 적어 둔 상태면 상품명은 그대로 두고 "이미 적은 칸은 그대로 뒀어요: 상품명"을 보인다', async () => {
    setup()
    fireEvent.change(nameField(), { target: { value: '매트' } })

    await fillBy(yoga())

    expect(values()).toEqual({ name: '매트', price: '35000', reason: '집에서 홈트 하려고', desire: null, period: '3일', customDays: null })
    // 채운 칸 줄은 F33 규칙(채운 칸 이름, 마지막 칸에 맞춘 을/를)에서 끌어온다
    expect(statusLinesWith(kept('상품명'))).toEqual([heard(YOGA_TRANSCRIPT), '가격·이유·고민 기간을 채웠어요.', kept('상품명')])
    // 채운 첫 칸
    expect(priceField()).toHaveFocus()
  })

  it('AC57: 기간 7을 말하면 고민 기간 7일을 고른다', async () => {
    setup()

    await fillBy(yoga({ transcript: '요가 매트 삼만 오천 원짜리 사고 싶어. 집에서 홈트 하려고. 고민은 칠 일 할게.', periodDays: 7 }))

    expect(radio('7일')).toBeChecked()
    expect(values().customDays).toBeNull()
  })

  it('AC57: 기간 5를 말하면 직접 입력을 고르고 고민 일수에 5를 넣는다', async () => {
    setup()

    await fillBy(yoga({ transcript: '요가 매트 삼만 오천 원짜리 사고 싶어. 집에서 홈트 하려고. 고민은 오 일 할게.', periodDays: 5 }))

    expect(radio('직접 입력')).toBeChecked()
    expect(values().customDays).toBe('5')
  })

  it('AC57: 다른 칸 없이 기간만 7을 말하면(3일에서) 7일을 고르고 "고민 기간을 채웠어요."를 보이며 고민 기간에 포커스가 간다', async () => {
    setup()
    expect(radio('3일')).toBeChecked()
    const transcript = '고민은 일주일 할게.'

    await fillBy(aiReply.ok({ ...BLANK, transcript, periodDays: 7 }))

    expect(values()).toEqual({ ...EMPTY_FORM, period: '7일' })
    expect(statusLinesWith(heard(transcript))).toEqual([heard(transcript), '고민 기간을 채웠어요.'])
    // 가정: 고민 기간 칸의 포커스는 고른 버튼(직접 입력이면 고민 일수 칸)
    expect(radio('7일')).toHaveFocus()
  })

  it('AC57: 정도 4를 말하면 갖고 싶은 정도 4를 고른다', async () => {
    setup()

    await fillBy(yoga({ transcript: '요가 매트 삼만 오천 원짜리 사고 싶어. 집에서 홈트 하려고. 갖고 싶은 정도는 사. 고민은 삼 일 할게.', desire: 4 }))

    expect(radio('4 많이')).toBeChecked()
    expect(statusLinesWith('상품명·가격·이유·갖고 싶은 정도·고민 기간을 채웠어요.')).not.toBeNull()
  })

  it('AC57: 정도를 이미 2로 고른 상태에서 정도 4를 말하면 2 그대로 두고 둔 칸에 갖고 싶은 정도를 적는다', async () => {
    setup()
    fireEvent.click(radio('2 조금'))

    await fillBy(yoga({ transcript: '요가 매트 삼만 오천 원짜리 사고 싶어. 집에서 홈트 하려고. 갖고 싶은 정도는 사. 고민은 삼 일 할게.', desire: 4 }))

    expect(values().desire).toBe('2 조금')
    expect(statusLinesWith(kept('갖고 싶은 정도'))).toEqual([
      heard('요가 매트 삼만 오천 원짜리 사고 싶어. 집에서 홈트 하려고. 갖고 싶은 정도는 사. 고민은 삼 일 할게.'),
      '상품명·가격·이유·고민 기간을 채웠어요.',
      kept('갖고 싶은 정도'),
    ])
  })

  it('AC57: 받아쓰는 동안 이유를 적으면 응답이 와도 적은 이유를 그대로 둔다(채울 때의 폼 기준)', async () => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(VOICE, held)
    await record()

    reasonField().focus()
    fireEvent.change(reasonField(), { target: { value: '선물하려고' } })
    held.release(yoga())
    await settle()

    expect(values()).toEqual({ name: '요가 매트', price: '35000', reason: '선물하려고', desire: null, period: '3일', customDays: null })
    expect(statusLinesWith(kept('이유'))).toEqual([heard(YOGA_TRANSCRIPT), '상품명·가격·고민 기간을 채웠어요.', kept('이유')])
    // 가정: 다른 칸에 적고 있으면 포커스를 빼앗지 않는다
    expect(reasonField()).toHaveFocus()
  })
})

// ================================================================ AC58 녹음이 안 되거나 받아쓴 내용이 없을 때

describe('녹음이 안 되거나 받아쓴 내용이 없을 때 (AC58)', () => {
  // plan: AC58 아홉 경우
  it('AC58: MediaRecorder가 없는 브라우저에서는 "이 브라우저에서는 녹음할 수 없어요…"를 알리고 마이크를 열지 않는다', async () => {
    const s = setup({ recorder: false })

    await pressStart()

    expect(form().getByRole('alert')).toHaveTextContent(UNSUPPORTED)
    expect(s.mic.getUserMedia).not.toHaveBeenCalled()
    expect(s.server.calls).toEqual([])
    expect(startButton()).toHaveFocus()
  })

  it('AC58: 마이크 권한을 거부하면 "마이크를 쓸 수 없어요…"를 알리고 녹음하지 않는다', async () => {
    const s = setup({ permission: 'denied' })

    await pressStart()

    expect(form().getByRole('alert')).toHaveTextContent(DENIED)
    expect(s.mic.recorders).toEqual([])
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
    expect(s.server.calls).toEqual([])
    expect(startButton()).toHaveFocus()
  })

  it('AC58: 0.5초 녹음하고 멈추면 "녹음이 너무 짧아요…"를 알리고 서버로 보내지 않으며 트랙을 모두 멈춘다', async () => {
    const s = setup({ trackCount: 2 })
    await pressStart()

    await speakAndStop(500)
    await advance(120_000)

    expect(form().getByRole('alert')).toHaveTextContent(TOO_SHORT)
    expect(s.server.calls).toEqual([])
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
  })

  it('AC58: 20초 동안 말하면 20초에 자동으로 멈추고 보낸다', async () => {
    const s = setup()
    s.server.on(VOICE, yoga())
    await pressStart()

    await advance(20_000)
    await sent()

    expect(s.server.callsTo(VOICE).map((call) => call.body)).toEqual([{ audio: RECORDED_AUDIO, mimeType: 'audio/webm' }])
    expect(values().name).toBe('요가 매트')
  })

  it('AC58: 녹음 중 트랙이 끊기면 "녹음이 중간에 멈췄어요…"를 알리고 보내지 않으며 트랙을 모두 멈춘다', async () => {
    const s = setup({ trackCount: 2 })
    await pressStart()
    await advance(3000)

    act(() => {
      s.mic.tracks[0].end()
    })
    await settle()

    expect(form().getByRole('alert')).toHaveTextContent(INTERRUPTED)
    expect(s.server.calls).toEqual([])
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
  })

  // PRD F33 '안 될 때': 사용자가 멈추지 않았는데 녹음이 끊김(화면 꺼짐) → "녹음이 중간에 멈췄어요…"(보내지 않음)
  it('녹음 중 화면이 숨겨지면 "녹음이 중간에 멈췄어요…"를 알리고 보내지 않으며 트랙을 모두 멈춘다', async () => {
    const s = setup({ trackCount: 2 })
    await pressStart()
    await advance(3000)

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await advance(60_000)

    expect(form().getByRole('alert')).toHaveTextContent(INTERRUPTED)
    expect(s.server.calls).toEqual([])
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
  })

  it('AC58: 녹음 중 다른 메뉴로 옮기면 녹음을 버리고 트랙을 멈추며 보내지 않는다', async () => {
    const s = setup({ trackCount: 2 })
    await pressStart()
    await advance(3000)

    goTo('가격 비교')
    await advance(60_000)

    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(s.server.calls).toEqual([])

    goTo('고민 중인 물건')

    expect(startButton()).toBeEnabled()
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
    expect(form().queryByRole('alert')).not.toBeInTheDocument()
    expect(values()).toEqual(EMPTY_FORM)
  })

  it('AC58: 응답의 모든 값이 비어 있으면 "채울 내용을 찾지 못했어요…"만 보이고 말로 담기에 포커스가 간다', async () => {
    setup()

    await fillBy(aiReply.ok(BLANK))

    // 받아쓴 말이 비면 첫 줄은 뺀다(판정 R10)
    expect(statusLinesWith(NOTHING)).toEqual([NOTHING])
    expect(values()).toEqual(EMPTY_FORM)
    expect(startButton()).toHaveFocus()
  })

  it.each([
    ['성공 응답', yoga()],
    ['서버 제한 429', aiReply.status(429)],
    ['네트워크 오류', aiReply.network()],
  ])('AC58: 받아쓰는 중 취소하면 요청을 끊고 폼은 그대로이며, 그 뒤 늦게 온 %s도 폼과 안내를 바꾸지 않는다', async (_name, lateReply) => {
    const s = setup()
    const late = aiReply.hold()
    s.server.on(VOICE, late)
    fireEvent.change(nameField(), { target: { value: '매트' } })
    const before = values()
    await record()

    fireEvent.click(cancelButton())
    await settle()

    expect(late.signal?.aborted).toBe(true)
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
    expect(startButton()).toHaveFocus()

    late.release(lateReply)
    await settle()

    expect(values()).toEqual(before)
    expectNoVoiceStatus()
    expect(form().queryByRole('alert')).not.toBeInTheDocument()
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
    expect(s.server.callsTo(VOICE)).toHaveLength(1)
  })

  it('AC58: 응답의 정도가 null이고 받아쓴 말이 "두 개 사고 싶어"이면 갖고 싶은 정도는 그대로다', async () => {
    setup()

    await fillBy(aiReply.ok({ ...BLANK, transcript: '두 개 사고 싶어' }))

    expect(values()).toEqual(EMPTY_FORM)
    expect(statusLinesWith(NOTHING)).toEqual([heard('두 개 사고 싶어'), NOTHING])
    expect(startButton()).toHaveFocus()
  })
})

// ================================================================ 계획이 따로 정한 시험

describe('20초 자동 멈춤과 권한 창 (계획 Task 14)', () => {
  // plan: auto stop at 20 seconds sends exactly one request
  it('20초에 자동으로 멈추면 요청을 정확히 한 번 보내고, 시간이 더 지나도 다시 보내지 않는다', async () => {
    const s = setup({ trackCount: 2 })
    s.server.on(VOICE, yoga())
    await pressStart()

    await advance(19_999)

    expect(s.server.calls).toEqual([])
    expect(form().getByRole('timer')).toHaveTextContent(listening(1))
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([0, 0])

    await advance(1)
    await sent()

    expect(s.server.callsTo(VOICE)).toHaveLength(1)
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])

    await advance(120_000)

    expect(s.server.callsTo(VOICE)).toHaveLength(1)
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
    expect(values().name).toBe('요가 매트')
  })

  // plan: leaving the 고민 목록 menu while the permission prompt is open discards the recording
  it('마이크 권한 창이 떠 있는 동안 고민 목록 메뉴를 떠나면, 나중에 허가가 나도 녹음하지 않고 마이크를 바로 놓으며 보내지 않는다', async () => {
    const s = setup({ permission: 'pending', trackCount: 2 })
    fireEvent.click(startButton())
    await settle()
    expect(s.mic.getUserMedia).toHaveBeenCalledTimes(1)

    goTo('가격 비교')
    await act(async () => {
      s.mic.grant()
    })
    await settle()
    await advance(30_000)

    expect(s.mic.recorders).toEqual([])
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(s.server.calls).toEqual([])

    goTo('고민 중인 물건')

    expect(startButton()).toBeEnabled()
    expect(form().queryByRole('timer')).not.toBeInTheDocument()
    expect(form().queryByRole('alert')).not.toBeInTheDocument()
  })
})

// ================================================================ 녹음 형식, 실패 문구, 60초 상한 (10장 앱 공통 · 판정 R11)

describe('받아쓰기가 실패하면 (10장 앱 공통 실패 문구)', () => {
  it('R11: 녹음 형식(mimeType)이 비어 있으면 보내지 않고 "이 브라우저에서는 녹음할 수 없어요…"를 알린다', async () => {
    const s = setup({ trackCount: 2 })
    await pressStart()
    // 이 브라우저의 녹음기가 형식을 알리지 않는다
    s.mic.recorders[0].mimeType = ''

    await speakAndStop(1500)
    await advance(120_000)

    expect(form().getByRole('alert')).toHaveTextContent(UNSUPPORTED)
    expect(s.server.calls).toEqual([])
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
  })

  it.each([
    ['서버 제한 429', aiReply.status(429), BUSY],
    ['꺼짐 503', aiReply.status(503), PAUSED],
    ['서버 오류 500', aiReply.status(500), UNREADABLE],
    ['네트워크 오류', aiReply.network(), UNREADABLE],
    ['모양이 다른 응답', aiReply.ok({ transcript: 1 }), UNREADABLE],
  ])('%s이면 문구를 role=alert로 보이고 폼은 그대로이며 시간이 지나도 다시 보내지 않는다', async (_name, reply, message) => {
    const s = setup()
    s.server.on(VOICE, reply)
    fireEvent.change(nameField(), { target: { value: '매트' } })
    const before = values()

    await record()

    expect(form().getByRole('alert')).toHaveTextContent(message)
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
    expect(values()).toEqual(before)
    expectNoVoiceStatus()
    expect(startButton()).toHaveFocus()
    await advance(120_000)
    expect(s.server.callsTo(VOICE)).toHaveLength(1)
  })

  it('AC76: 말로 담기에 서버가 429 upstream_limited면 Gemini 제한 문구를 보인다', async () => {
    const s = setup()
    s.server.on(VOICE, aiReply.status(429, { error: 'upstream_limited' }))
    fireEvent.change(nameField(), { target: { value: '매트' } })
    const before = values()

    await record()

    expect(form().getByRole('alert')).toHaveTextContent(GEMINI_LIMITED)
    expect(form().queryByText(BUSY)).not.toBeInTheDocument()
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
    expect(values()).toEqual(before)
    await advance(120_000)
    expect(s.server.callsTo(VOICE)).toHaveLength(1)
  })

  it('받아쓰기는 59,999ms까지 기다리고 60,000ms에 끊고 "지금은 읽지 못했어요"를 알린다', async () => {
    const s = setup()
    s.server.on(VOICE, aiReply.hang())
    await record()

    await advance(59_999)

    expect(form().queryByRole('alert')).not.toBeInTheDocument()
    expect(form().getByText(TRANSCRIBING)).toBeInTheDocument()
    expect(s.server.callsTo(VOICE)[0].signal?.aborted).toBe(false)

    await advance(1)

    expect(form().getByRole('alert')).toHaveTextContent(UNREADABLE)
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
    expect(s.server.callsTo(VOICE)[0].signal?.aborted).toBe(true)
    expect(values()).toEqual(EMPTY_FORM)
  })
})

// ================================================================ 늦게 오는 녹음 결과, 숨은 화면, 화면이 사라짐 (10장 앱 공통)

describe('메뉴 이동·화면이 사라짐과 늦은 결과 (10장 앱 공통)', () => {
  it.each([
    ['다른 메뉴로 옮기면', () => goTo('가격 비교')],
    ['화면이 사라지면', () => current?.view.unmount()],
  ])('멈추기를 누른 뒤 녹음기의 stop 이벤트가 늦게 오는 사이 %s, 늦게 끝난 녹음은 보내지 않고 트랙을 멈춘다', async (_name, leave) => {
    const s = setup({ trackCount: 2 })
    await pressStart()
    await advance(3000)
    // 실제 브라우저처럼 stop 이벤트가 나중에 오게 한다
    const recorder = s.mic.recorders[0]
    const stopNow = recorder.stop.bind(recorder)
    let deliver = () => {}
    recorder.stop = () => {
      deliver = stopNow
    }

    fireEvent.click(stopButton())
    await settle()
    act(() => leave())
    act(() => deliver())
    await advance(60_000)

    expect(s.server.calls).toEqual([])
    expect(s.mic.tracks.map((track) => track.stopCalls)).toEqual([1, 1])
  })

  it('받아쓰는 중에 화면이 사라지면 요청을 끊고, 늦게 온 응답은 아무것도 하지 않는다', async () => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(VOICE, held)
    await record()

    s.view.unmount()
    expect(held.signal?.aborted).toBe(true)

    held.release(yoga())
    await settle()

    expect(s.server.callsTo(VOICE)).toHaveLength(1)
  })

  it.each([
    ['다른 메뉴의 탭에 포커스가 있어도', true],
    ['포커스가 어디에도 없어도', false],
  ])('받아쓰는 중에 다른 메뉴로 가면 받아쓰기는 이어지고, %s 거기서 끝나면 폼은 채우되 포커스를 옮기지 않는다', async (_name, keepFocus) => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(VOICE, held)
    await record()

    goTo('가격 비교')
    const tab = screen.getByRole('tab', { name: '가격 비교' })
    if (keepFocus) tab.focus()
    else (document.activeElement as HTMLElement | null)?.blur()
    // jsdom은 숨은 요소의 focus()를 무시하므로, 고민 목록 화면 안의 어떤 요소에도 focus()를 부르지 않았는지 본다
    // (보이는 화면의 대조는 AC57 "상품명에 포커스가 간다")
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    held.release(yoga())
    await settle()

    if (keepFocus) expect(tab).toHaveFocus()
    else expect(document.body).toHaveFocus()
    expect(focusedInside(focusSpy, panelOf('고민 중인 물건'))).toEqual([])
    expect(held.signal?.aborted).toBe(false)

    goTo('고민 중인 물건')

    expect(values()).toEqual({ name: '요가 매트', price: '35000', reason: '집에서 홈트 하려고', desire: null, period: '3일', customDays: null })
    expect(statusLinesWith(heard(YOGA_TRANSCRIPT))).toEqual([heard(YOGA_TRANSCRIPT), '상품명·가격·이유·고민 기간을 채웠어요.'])
    expect(s.server.callsTo(VOICE)).toHaveLength(1)
  })

  it('받아쓰는 중에 다른 메뉴로 가서 실패 응답이 오면 문구는 남기되 포커스를 옮기지 않는다', async () => {
    const s = setup()
    const held = aiReply.hold()
    s.server.on(VOICE, held)
    await record()

    goTo('가격 비교')
    const focused = document.activeElement as HTMLElement | null
    focused?.blur()
    const focusSpy = vi.spyOn(HTMLElement.prototype, 'focus')

    held.release(aiReply.status(429))
    await settle()

    expect(document.body).toHaveFocus()
    expect(focusedInside(focusSpy, panelOf('고민 중인 물건'))).toEqual([])

    goTo('고민 중인 물건')

    expect(form().getByRole('alert')).toHaveTextContent(BUSY)
    expect(values()).toEqual(EMPTY_FORM)
  })

  it('취소한 받아쓰기의 늦은 응답은 새로 받아쓰는 중 표시와 취소를 지우지 않고, 새 응답만 폼에 들어간다', async () => {
    const s = setup()
    const lateA = aiReply.hold()
    const heldB = aiReply.hold()
    s.server.on(VOICE, lateA, heldB)
    await record(1)
    fireEvent.click(cancelButton())
    await settle()
    await record(2)

    lateA.release(yoga({ name: '앞 녹음' }))
    await settle()

    expect(form().getAllByRole('status').map((element) => element.textContent)).toContain(TRANSCRIBING)
    expect(cancelButton()).toBeInTheDocument()
    expect(heldB.signal?.aborted).toBe(false)
    expect(values()).toEqual(EMPTY_FORM)

    heldB.release(yoga())
    await settle()

    expect(values().name).toBe('요가 매트')
    expect(form().queryByText(TRANSCRIBING)).not.toBeInTheDocument()
    expect(s.server.callsTo(VOICE)).toHaveLength(2)
  })
})
