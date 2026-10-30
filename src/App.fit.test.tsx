import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { makeBackup } from './logic/backup'
import type { Fit } from './logic/fit'
import { STORAGE_KEY } from './logic/storage'
import type { WishItem } from './logic/wishlist'
import { FitCheck, type FitAiSlot } from './screens/FitCheck'

// PRD F44 놓을 자리 확인 1단계(직접 입력) / AC64 첫 사례(화면), AC65 입력·저장 열여섯 경우
const T0 = new Date(2026, 9, 30, 9)
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(T0.getTime() + days * DAY).toISOString()

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const POT = '전기 포트'
const PHONES = '무선 헤드폰'
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
const phones = (over: Record<string, unknown> = {}) => thing({ id: 'h1', name: PHONES, priceKrw: 129000, reason: '출퇴근길에 쓰려고', ...over })

// AC64 첫 사례: 놓을 곳 '싱크대 옆 칸' 40×30×50, 물건 32×25×47 (mm로 저장)
const SINK = { place: '싱크대 옆 칸', sw: '40', sd: '30', sh: '50' }
const POT_SIZE = { iw: '32', id: '25', ih: '47' }
const FIT: Fit = {
  place: '싱크대 옆 칸',
  space: { w: 400, d: 300, h: 500 },
  item: { w: 320, d: 250, h: 470 },
  savedAt: at(-1),
}
const DESK_FIT: Fit = { place: '책상 아래', space: { w: 600, d: 500, h: 700 }, item: { w: 300, d: 300, h: 300 }, savedAt: at(-2) }

const TITLE = '놓을 자리 확인'
const RESULT = '저장한 치수로 본 결과'
const FITS_FIRST = '입력 치수상 싱크대 옆 칸에 들어가요.'
const AC64_LINES = [
  FITS_FIRST,
  '방향 1: 가로 8cm 남음 · 깊이 5cm 남음 · 높이 3cm 남음 → 들어가요',
  '방향 2: 가로 15cm 남음 · 깊이 2cm 넘침 · 높이 3cm 남음 → 안 들어가요',
  '방향 2는 물건을 바닥에서 90도 돌려 놓은 경우예요.',
  '입력한 치수만 비교했어요. 눕혀 놓는 경우와 문 여닫는 공간·손잡이·전선·환기 공간은 따로 확인해 주세요.',
]
const NOT_CM = 'cm로 적어 주세요(예: 40 또는 40.5)'
const ONE_DECIMAL = '소수 첫째 자리까지 적어 주세요'
const OUT_OF_RANGE = '0.1~1000cm 사이로 적어 주세요'

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

const store = (...items: unknown[]) => JSON.stringify({ schemaVersion: 1, items })
function setup(...items: unknown[]) {
  if (items.length > 0) localStorage.setItem(STORAGE_KEY, store(...items))
  const user = userEvent.setup()
  const view = render(<App />)
  return { user, ...view }
}
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items as Record<string, unknown>[]
const savedOf = (id: string) => saved().find((item) => item.id === id)
const card = (name: string) => within(screen.getByRole('article', { name }))
/** 접힌 제목(summary). 저장한 결과가 있으면 "놓을 자리 확인 · …"이다 */
const summaryOf = (scope: ReturnType<typeof within>) =>
  scope.getByText((_: string, el: Element | null) => el?.tagName === 'SUMMARY' && /^놓을 자리 확인/.test(el.textContent ?? ''))
const panelIn = (scope: ReturnType<typeof within>) => within(summaryOf(scope).closest('details') as HTMLElement)
const panel = (name: string) => panelIn(card(name))
const field = (name: string, key: FieldKey) => panel(name).getByLabelText(LABELS[key]) as HTMLInputElement
const saveButton = (name: string) => panel(name).getByRole('button', { name: '확인하고 저장' })
const result = (name: string) => panel(name).getByRole('status', { name: RESULT })
/** 결과 칸의 줄: 제목 다음에 결과 문장이 한 줄씩 */
const linesOf = (el: HTMLElement) => Array.from(el.children).map((child) => child.textContent)

async function open(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(summaryOf(card(name)))
}
async function fill(user: ReturnType<typeof userEvent.setup>, name: string, values: Partial<Record<FieldKey, string>>) {
  for (const [key, value] of Object.entries(values) as [FieldKey, string][]) {
    const input = field(name, key)
    await user.clear(input)
    if (value !== '') await user.type(input, value)
  }
}

describe('놓을 자리 확인 입력 검사 (F44, AC65)', () => {
  async function submitWith(values: Partial<Record<FieldKey, string>>) {
    const { user } = setup(thing())
    await open(user, POT)
    await fill(user, POT, { ...SINK, ...POT_SIZE, ...values })
    await user.click(saveButton(POT))
    return user
  }

  it('AC65: 놓을 곳 가로가 빈 칸이면 cm로 적어 달라는 오류를 보이고 그 칸으로 포커스를 옮겨요', async () => {
    await submitWith({ sw: '' })
    expect(field(POT, 'sw')).toHaveAccessibleDescription(NOT_CM)
    expect(field(POT, 'sw')).toHaveFocus()
    expect(savedOf('k1')?.fit).toBeUndefined()
    expect(panel(POT).queryByText(RESULT)).not.toBeInTheDocument()
  })

  it("AC65: '40cm'이면 같은 오류예요", async () => {
    await submitWith({ sw: '40cm' })
    expect(field(POT, 'sw')).toHaveAccessibleDescription(NOT_CM)
    expect(field(POT, 'sw')).toHaveFocus()
    expect(savedOf('k1')?.fit).toBeUndefined()
  })

  it("AC65: '40.25'면 소수 첫째 자리까지 적어 달라는 오류예요", async () => {
    await submitWith({ sw: '40.25' })
    expect(field(POT, 'sw')).toHaveAccessibleDescription(ONE_DECIMAL)
    expect(field(POT, 'sw')).toHaveFocus()
    expect(savedOf('k1')?.fit).toBeUndefined()
  })

  it("AC65: '0'이면 0.1~1000cm 사이로 적어 달라는 오류예요", async () => {
    await submitWith({ sw: '0' })
    expect(field(POT, 'sw')).toHaveAccessibleDescription(OUT_OF_RANGE)
    expect(field(POT, 'sw')).toHaveFocus()
    expect(savedOf('k1')?.fit).toBeUndefined()
  })

  it("AC65: '1000.1'이면 같은 범위 오류예요", async () => {
    await submitWith({ sw: '1000.1' })
    expect(field(POT, 'sw')).toHaveAccessibleDescription(OUT_OF_RANGE)
    expect(field(POT, 'sw')).toHaveFocus()
    expect(savedOf('k1')?.fit).toBeUndefined()
  })

  it('AC65: 놓을 곳 이름이 21자면 20자 이하로 적어 달라는 오류예요', async () => {
    await submitWith({ place: '가'.repeat(21) })
    expect(field(POT, 'place')).toHaveAccessibleDescription('놓을 곳 이름은 20자 이하로 적어 주세요')
    expect(field(POT, 'place')).toHaveFocus()
    expect(savedOf('k1')?.fit).toBeUndefined()
  })

  it('오류가 여러 칸이면 첫 오류 칸으로 포커스를 옮기고, 물건 칸 오류도 같은 규칙이에요', async () => {
    await submitWith({ place: '', ih: '47.25' })
    expect(field(POT, 'place')).toHaveAccessibleDescription('놓을 곳 이름을 적어 주세요')
    expect(field(POT, 'ih')).toHaveAccessibleDescription(ONE_DECIMAL)
    expect(field(POT, 'place')).toHaveFocus()
  })

  it('치수 칸은 소수점 키패드(inputMode decimal)를 써요', async () => {
    const { user } = setup(thing())
    await open(user, POT)
    for (const key of ['sw', 'sd', 'sh', 'iw', 'id', 'ih'] as const) expect(field(POT, key)).toHaveAttribute('inputmode', 'decimal')
  })
})

describe('놓을 자리 확인 저장과 결과 (F44, AC64·AC65)', () => {
  it('AC65: 올바른 값으로 확인하고 저장하면 mm로 저장하고 결과(role=status)와 접힌 제목을 보여요', async () => {
    const { user } = setup(thing())
    expect(summaryOf(card(POT))).toHaveTextContent(/^놓을 자리 확인$/)
    await open(user, POT)
    expect(panel(POT).queryByText(RESULT)).not.toBeInTheDocument()
    await fill(user, POT, { ...SINK, ...POT_SIZE })
    await user.click(saveButton(POT))
    expect(savedOf('k1')?.fit).toEqual({
      place: '싱크대 옆 칸',
      space: { w: 400, d: 300, h: 500 },
      item: { w: 320, d: 250, h: 470 },
      savedAt: T0.toISOString(),
    })
    expect(savedOf('k1')?.updatedAt).toBe(T0.toISOString())
    expect(result(POT)).toHaveTextContent(FITS_FIRST)
    expect(panel(POT).getByText(RESULT)).toBeInTheDocument()
    expect(summaryOf(card(POT))).toHaveTextContent(/^놓을 자리 확인 · 입력 치수상 싱크대 옆 칸에 들어가요$/)
    expect(saveButton(POT)).toHaveFocus()
  })

  it('AC64: 첫 사례를 저장하면 결과 칸에 첫 줄·방향 두 줄·방향 2 설명·마지막 줄이 차례로 보여요', async () => {
    const { user } = setup(thing())
    await open(user, POT)
    await fill(user, POT, { ...SINK, ...POT_SIZE })
    await user.click(saveButton(POT))
    expect(linesOf(result(POT))).toEqual([RESULT, ...AC64_LINES])
  })

  it('AC65: 새로고침해도 저장한 결과와 접힌 제목이 그대로 보여요', async () => {
    const { user, unmount } = setup(thing())
    await open(user, POT)
    await fill(user, POT, { ...SINK, ...POT_SIZE })
    await user.click(saveButton(POT))
    unmount()
    render(<App />)
    expect(summaryOf(card(POT))).toHaveTextContent('놓을 자리 확인 · 입력 치수상 싱크대 옆 칸에 들어가요')
    await open(userEvent.setup(), POT)
    expect(linesOf(result(POT))).toEqual([RESULT, ...AC64_LINES])
    expect(field(POT, 'place')).toHaveValue('싱크대 옆 칸')
    expect([field(POT, 'sw'), field(POT, 'sd'), field(POT, 'sh')].map((input) => input.value)).toEqual(['40', '30', '50'])
    expect([field(POT, 'iw'), field(POT, 'id'), field(POT, 'ih')].map((input) => input.value)).toEqual(['32', '25', '47'])
  })

  it('AC65: 저장 뒤 물건 높이를 49로 고치고 저장하지 않으면 결과는 저장한 값(들어가요) 그대로예요', async () => {
    const { user } = setup(thing())
    await open(user, POT)
    await fill(user, POT, { ...SINK, ...POT_SIZE })
    await user.click(saveButton(POT))
    await fill(user, POT, { ih: '49' })
    expect(field(POT, 'ih')).toHaveValue('49')
    expect(linesOf(result(POT))).toEqual([RESULT, ...AC64_LINES])
    expect(summaryOf(card(POT))).toHaveTextContent(/^놓을 자리 확인 · 입력 치수상 싱크대 옆 칸에 들어가요$/)
    expect(savedOf('k1')?.fit).toMatchObject({ item: { w: 320, d: 250, h: 470 } })
  })

  it('AC65: 다른 물건의 칸을 처음 열면 최근에 쓴 놓을 곳으로 미리 채우고 물건 칸은 비워요', async () => {
    const { user } = setup(thing(), phones())
    await open(user, POT)
    await fill(user, POT, { ...SINK, ...POT_SIZE })
    await user.click(saveButton(POT))
    await open(user, PHONES)
    expect(panel(PHONES).getByText('최근에 쓴 놓을 곳이에요: 싱크대 옆 칸. 다르면 고쳐 주세요.')).toBeInTheDocument()
    expect(field(PHONES, 'place')).toHaveValue('싱크대 옆 칸')
    expect([field(PHONES, 'sw'), field(PHONES, 'sd'), field(PHONES, 'sh')].map((input) => input.value)).toEqual(['40', '30', '50'])
    expect([field(PHONES, 'iw'), field(PHONES, 'id'), field(PHONES, 'ih')].map((input) => input.value)).toEqual(['', '', ''])
    expect(summaryOf(card(PHONES))).toHaveTextContent(/^놓을 자리 확인$/)
    expect(panel(PHONES).queryByText(RESULT)).not.toBeInTheDocument()
  })

  it('최근 놓을 곳은 저장 시각이 가장 늦은 다른 물건에서 가져와요', async () => {
    const { user } = setup(thing({ fit: DESK_FIT }), phones({ fit: FIT }), thing({ id: 'k3', name: '가습기' }))
    await open(user, '가습기')
    expect(panel('가습기').getByText('최근에 쓴 놓을 곳이에요: 싱크대 옆 칸. 다르면 고쳐 주세요.')).toBeInTheDocument()
    expect(field('가습기', 'place')).toHaveValue('싱크대 옆 칸')
  })

  it('이 물건에 저장한 값이 있으면 그 값으로 채우고 최근에 쓴 놓을 곳 문장은 보이지 않아요', async () => {
    const { user } = setup(thing({ fit: DESK_FIT }), phones({ fit: FIT }))
    await open(user, POT)
    expect(field(POT, 'place')).toHaveValue('책상 아래')
    expect([field(POT, 'sw'), field(POT, 'sd'), field(POT, 'sh')].map((input) => input.value)).toEqual(['60', '50', '70'])
    expect([field(POT, 'iw'), field(POT, 'id'), field(POT, 'ih')].map((input) => input.value)).toEqual(['30', '30', '30'])
    expect(panel(POT).queryByText(/최근에 쓴 놓을 곳이에요/)).not.toBeInTheDocument()
  })

  it('저장한 다른 물건이 없으면 모든 칸이 비어 있고 최근에 쓴 놓을 곳 문장도 없어요', async () => {
    const { user } = setup(thing())
    await open(user, POT)
    for (const key of Object.keys(LABELS) as FieldKey[]) expect(field(POT, key)).toHaveValue('')
    expect(panel(POT).queryByText(/최근에 쓴 놓을 곳이에요/)).not.toBeInTheDocument()
    expect(panel(POT).queryByRole('button', { name: '지우기' })).not.toBeInTheDocument()
  })

  // plan: clearing one item keeps the fit saved on other items
  it('AC65: 지우기를 누르면 fit이 없어지고 제목이 "놓을 자리 확인"으로 돌아가며 확인하고 저장으로 포커스, 다른 물건의 fit은 그대로예요', async () => {
    const { user } = setup(thing({ fit: FIT }), phones({ fit: DESK_FIT }))
    await open(user, POT)
    await user.click(panel(POT).getByRole('button', { name: '지우기' }))
    expect(savedOf('k1')).not.toHaveProperty('fit')
    expect(savedOf('h1')?.fit).toEqual(DESK_FIT)
    expect(summaryOf(card(POT))).toHaveTextContent(/^놓을 자리 확인$/)
    expect(panel(POT).queryByText(RESULT)).not.toBeInTheDocument()
    expect(panel(POT).queryByRole('button', { name: '지우기' })).not.toBeInTheDocument()
    expect(saveButton(POT)).toHaveFocus()
    expect(summaryOf(card(PHONES))).toHaveTextContent('놓을 자리 확인 · 입력 치수상 책상 아래에 들어가요')
  })

  it('고민 기간이 끝난 카드에도 놓을 자리 확인이 보여요', () => {
    setup(thing({ createdAt: at(-4), updatedAt: at(-4), reviewAt: at(-1) }))
    expect(card(POT).getByText('고민 기간 끝')).toBeInTheDocument()
    expect(summaryOf(card(POT))).toHaveTextContent(/^놓을 자리 확인$/)
  })

  it('저장할 수 없는 브라우저 상태(저장 실패)에서도 화면에는 결과를 보이고 저장 안내를 띄워요', async () => {
    const { user } = setup(thing())
    await open(user, POT)
    await fill(user, POT, { ...SINK, ...POT_SIZE })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await user.click(saveButton(POT))
    expect(result(POT)).toHaveTextContent(FITS_FIRST)
    expect(screen.getByRole('status', { name: '저장 상태' })).toHaveTextContent('저장하지 못했어요.')
  })
})

describe('놓을 자리 확인과 여러 탭·백업·손상 (F44, AC65)', () => {
  // plan: does not change the result when the item was decided in another tab before saving
  it('AC65: 다른 탭에서 결정된 뒤 확인하고 저장하면 fit을 바꾸지 않고, 카드가 사라져 화면 제목으로 포커스를 옮겨요', async () => {
    const { user } = setup(thing({ fit: FIT }))
    await open(user, POT)
    await fill(user, POT, { ih: '49' })
    localStorage.setItem(STORAGE_KEY, store(thing({ fit: FIT, status: 'skipped', decidedAt: at(0), updatedAt: at(0) })))
    await user.click(saveButton(POT))
    expect(savedOf('k1')).toMatchObject({ status: 'skipped', fit: FIT })
    expect(screen.queryByRole('article', { name: POT })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toHaveFocus()
  })

  it('AC65: 저장이 반영되지 않으면(다른 탭이 먼저 저장) 결과·제목·포커스를 바꾸지 않고 입력은 그대로 둬요', async () => {
    const { user } = setup(thing({ fit: FIT }))
    await open(user, POT)
    await fill(user, POT, { ih: '49' })
    localStorage.setItem(STORAGE_KEY, store(thing({ fit: FIT, reason: '다른 탭에서 고친 이유' })))
    await user.click(saveButton(POT))
    expect(savedOf('k1')).toMatchObject({ reason: '다른 탭에서 고친 이유', fit: FIT })
    expect(screen.getByRole('status', { name: '저장 상태' })).toHaveTextContent('다른 탭에서 저장한 기록을 불러왔어요')
    expect(linesOf(result(POT))).toEqual([RESULT, ...AC64_LINES])
    expect(summaryOf(card(POT))).toHaveTextContent(/^놓을 자리 확인 · 입력 치수상 싱크대 옆 칸에 들어가요$/)
    expect(field(POT, 'ih')).toHaveValue('49')
    expect(saveButton(POT)).toHaveFocus()
  })

  it('지우기가 반영되지 않으면(다른 탭이 먼저 저장) 결과·제목·포커스를 바꾸지 않아요', async () => {
    const { user } = setup(thing({ fit: FIT }))
    await open(user, POT)
    localStorage.setItem(STORAGE_KEY, store(thing({ fit: FIT, reason: '다른 탭에서 고친 이유' })))
    const clear = panel(POT).getByRole('button', { name: '지우기' })
    await user.click(clear)
    expect(savedOf('k1')?.fit).toEqual(FIT)
    expect(result(POT)).toHaveTextContent(FITS_FIRST)
    expect(summaryOf(card(POT))).toHaveTextContent('놓을 자리 확인 · 입력 치수상 싱크대 옆 칸에 들어가요')
    expect(clear).toHaveFocus()
  })

  it('다른 탭이 이 물건의 fit을 저장하면 이 탭의 결과와 접힌 제목도 그 값으로 바뀌어요', async () => {
    const { user } = setup(thing())
    await open(user, POT)
    localStorage.setItem(STORAGE_KEY, store(thing({ fit: FIT })))
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
    expect(await panel(POT).findByRole('status', { name: RESULT })).toHaveTextContent(FITS_FIRST)
    expect(summaryOf(card(POT))).toHaveTextContent('놓을 자리 확인 · 입력 치수상 싱크대 옆 칸에 들어가요')
  })

  it('AC65: 백업 파일로 바꿔도 fit이 그대로라 결과와 접힌 제목이 보여요', async () => {
    const backup = makeBackup(
      { items: [thing({ fit: { ...FIT, basis: '포장 치수' } }) as WishItem], hourlyWage: null, subscriptions: [] },
      T0,
    )
    const { user } = setup(phones())
    await user.click(screen.getByText('기록 백업·복원'))
    await user.upload(screen.getByLabelText('백업 파일 불러오기'), new File([backup], 'b.json', { type: 'application/json' }))
    const confirm = within(await screen.findByRole('group', { name: '백업 불러오기 확인' }))
    await user.click(confirm.getByRole('button', { name: '바꾸기' }))
    expect(savedOf('k1')?.fit).toEqual({ ...FIT, basis: '포장 치수' })
    expect(summaryOf(card(POT))).toHaveTextContent('놓을 자리 확인 · 입력 치수상 싱크대 옆 칸에 들어가요')
    expect(result(POT)).toHaveTextContent('입력 치수상 싱크대 옆 칸에 들어가요. (포장 치수 기준)')
  })

  it('AC65: 저장 기록의 fit이 규칙에 맞지 않으면(가로 0) 손상으로 알리고 덮어쓰지 않아요', () => {
    const raw = store(thing({ fit: { ...FIT, space: { ...FIT.space, w: 0 } } }))
    localStorage.setItem(STORAGE_KEY, raw)
    render(<App />)
    expect(screen.getByRole('status', { name: '저장 상태' })).toHaveTextContent('저장된 기록을 읽을 수 없어요.')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw)
  })

  // plan: shows the panel without a server url
  it('AC65: 서버 주소가 없는 빌드에서도 고민 중 카드에 놓을 자리 확인이 보여요', async () => {
    vi.stubEnv('VITE_AI_SERVER_URL', '')
    const { user } = setup(thing())
    await open(user, POT)
    expect(summaryOf(card(POT))).toHaveTextContent(/^놓을 자리 확인$/)
    expect(saveButton(POT)).toBeInTheDocument()
    expect(field(POT, 'place')).toBeInTheDocument()
  })

  it('AC65: 결정한 물건에는 놓을 자리 확인이 보이지 않아요', async () => {
    const { user } = setup(thing({ fit: FIT }), phones({ status: 'purchased', decidedAt: at(0), fit: DESK_FIT }))
    expect(screen.queryByText(/책상 아래/)).not.toBeInTheDocument()
    await user.click(card(POT).getByRole('button', { name: '구매 포기' }))
    await user.click(card(POT).getByRole('button', { name: '구매 포기 확인' }))
    expect(screen.queryByRole('article', { name: POT })).not.toBeInTheDocument()
    expect(screen.queryByText(new RegExp(TITLE))).not.toBeInTheDocument()
    expect(screen.queryByText('저장한 치수로 본 결과')).not.toBeInTheDocument()
  })
})

describe('놓을 자리 확인의 AI 자리 (F44 2단계 준비, 판정 R18)', () => {
  const item = (over: Partial<WishItem> = {}): WishItem => ({ ...(thing() as WishItem), ...over })
  type Applied = { fields: { w: string; d: string; h: string }; basis: string | null }

  function renderFit(options: { over?: Partial<WishItem>; applied: Applied; onSave?: (id: string, fit: Fit | null) => boolean }) {
    const slots: FitAiSlot[] = []
    const onSave = vi.fn(options.onSave ?? (() => true))
    const aiSlot = (slot: FitAiSlot): ReactNode => {
      slots.push(slot)
      return (
        <button type="button" onClick={() => slot.apply(options.applied.fields, options.applied.basis)}>
          치수 넣기(시험)
        </button>
      )
    }
    const target = item(options.over)
    render(<FitCheck item={target} items={[target]} onSave={onSave} aiSlot={aiSlot} />)
    return { user: userEvent.setup(), onSave, slots, last: () => slots[slots.length - 1] }
  }
  const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement
  const values = () => [input(LABELS.iw), input(LABELS.id), input(LABELS.ih)].map((el) => el.value)
  async function typePlace(user: ReturnType<typeof userEvent.setup>) {
    await user.type(input(LABELS.place), SINK.place)
    await user.type(input(LABELS.sw), SINK.sw)
    await user.type(input(LABELS.sd), SINK.sd)
    await user.type(input(LABELS.sh), SINK.sh)
  }

  it('열려 있고 고민 중일 때만 active이고, current는 지금 고치고 있는 물건 칸 글자예요', async () => {
    const { user, last } = renderFit({ over: { fit: FIT }, applied: { fields: { w: '', d: '', h: '' }, basis: null } })
    expect(last().active).toBe(false)
    await user.click(screen.getByText(/^놓을 자리 확인/))
    expect(last().active).toBe(true)
    expect(last().current).toEqual({ w: '32', d: '25', h: '47' })
    await user.clear(input(LABELS.ih))
    await user.type(input(LABELS.ih), '49')
    expect(last().current).toEqual({ w: '32', d: '25', h: '49' })
    await user.click(screen.getByText(/^놓을 자리 확인/))
    expect(last().active).toBe(false)
  })

  it('넣으면 물건 세 칸을 그 값으로 바꾸고(빈 값은 그 칸을 비움) 첫 빈 칸으로 포커스를 옮겨요', async () => {
    const { user } = renderFit({ over: { fit: FIT }, applied: { fields: { w: '60', d: '', h: '45.5' }, basis: null } })
    await user.click(screen.getByText(/^놓을 자리 확인/))
    await user.click(screen.getByRole('button', { name: '치수 넣기(시험)' }))
    expect(values()).toEqual(['60', '', '45.5'])
    expect(input(LABELS.id)).toHaveFocus()
  })

  it('넣은 뒤 빈 칸이 없으면 확인하고 저장으로 포커스를 옮기고, 저장할 때 기준도 함께 저장해요', async () => {
    const { user, onSave } = renderFit({ applied: { fields: { w: '32', d: '25', h: '47' }, basis: '포장 치수' } })
    await user.click(screen.getByText(/^놓을 자리 확인/))
    await typePlace(user)
    await user.click(screen.getByRole('button', { name: '치수 넣기(시험)' }))
    expect(values()).toEqual(['32', '25', '47'])
    expect(screen.getByRole('button', { name: '확인하고 저장' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '확인하고 저장' }))
    expect(onSave).toHaveBeenLastCalledWith('k1', { ...FIT, basis: '포장 치수', savedAt: T0.toISOString() })
  })

  // plan: editing an item dimension after applying clears the basis
  it('넣은 뒤 물건 칸 하나를 손으로 고치면 기준을 지우고 저장해요', async () => {
    const { user, onSave } = renderFit({ applied: { fields: { w: '32', d: '25', h: '47' }, basis: '포장 치수' } })
    await user.click(screen.getByText(/^놓을 자리 확인/))
    await typePlace(user)
    await user.click(screen.getByRole('button', { name: '치수 넣기(시험)' }))
    await user.clear(input(LABELS.ih))
    await user.type(input(LABELS.ih), '47')
    await user.click(screen.getByRole('button', { name: '확인하고 저장' }))
    const fit = onSave.mock.lastCall?.[1]
    expect(fit).toEqual({ ...FIT, savedAt: T0.toISOString() })
    expect(fit).not.toHaveProperty('basis')
  })

  it('놓을 곳 칸을 고쳐도 기준은 남아요', async () => {
    const { user, onSave } = renderFit({ applied: { fields: { w: '32', d: '25', h: '47' }, basis: '포장 치수' } })
    await user.click(screen.getByText(/^놓을 자리 확인/))
    await user.click(screen.getByRole('button', { name: '치수 넣기(시험)' }))
    await typePlace(user)
    await user.click(screen.getByRole('button', { name: '확인하고 저장' }))
    expect(onSave).toHaveBeenLastCalledWith('k1', { ...FIT, basis: '포장 치수', savedAt: T0.toISOString() })
  })

  it('저장한 기준은 다시 열어 그대로 저장하면 남고, 결과 첫 줄 끝에 붙어요', async () => {
    const { user, onSave } = renderFit({ over: { fit: { ...FIT, basis: '포장 치수' } }, applied: { fields: { w: '', d: '', h: '' }, basis: null } })
    expect(screen.getByRole('status', { name: RESULT })).toHaveTextContent('입력 치수상 싱크대 옆 칸에 들어가요. (포장 치수 기준)')
    await user.click(screen.getByText(/^놓을 자리 확인/))
    await user.click(screen.getByRole('button', { name: '확인하고 저장' }))
    expect(onSave).toHaveBeenLastCalledWith('k1', { ...FIT, basis: '포장 치수', savedAt: T0.toISOString() })
  })

  it('저장이 반영되지 않으면(결정된 물건 등) 입력과 포커스를 그대로 둬요', async () => {
    const { user, onSave } = renderFit({ over: { fit: FIT }, applied: { fields: { w: '', d: '', h: '' }, basis: null }, onSave: () => false })
    await user.click(screen.getByText(/^놓을 자리 확인/))
    await user.clear(input(LABELS.ih))
    await user.type(input(LABELS.ih), '49')
    await user.click(screen.getByRole('button', { name: '확인하고 저장' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(input(LABELS.ih)).toHaveValue('49')
    expect(screen.getByRole('button', { name: '확인하고 저장' })).toHaveFocus()
    expect(screen.getByRole('status', { name: RESULT })).toHaveTextContent(FITS_FIRST)
    await user.click(screen.getByRole('button', { name: '지우기' }))
    expect(screen.getByRole('button', { name: '지우기' })).toHaveFocus()
  })

  it('결정한 물건이면 아무것도 그리지 않아요', () => {
    const decided = item({ status: 'purchased', decidedAt: at(0), fit: FIT })
    const { container } = render(<FitCheck item={decided} items={[decided]} onSave={() => true} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('놓을 자리 확인 결과가 사기 전에 한 번 더에 보여요 (F44·F15, AC66)', () => {
  it("AC66: 치수를 넣어 '안 들어가요'를 저장하고 구매함을 누르면 걸리는 점 목록에 그 문장이 하나 보여요", async () => {
    // 고민 기간이 끝난 물건이라 다른 걸리는 점은 없다. 놓을 곳 40×30×50, 물건 45×25×47(방향 1 가로·방향 2 깊이가 넘침)
    const { user } = setup(thing({ reviewAt: at(-1) }))
    await open(user, POT)
    await fill(user, POT, { ...SINK, iw: '45', id: '25', ih: '47' })
    await user.click(saveButton(POT))
    expect(result(POT)).toHaveTextContent('입력 치수상 싱크대 옆 칸에 안 들어가요.')
    await user.click(card(POT).getByRole('button', { name: '구매함' }))
    const check = within(card(POT).getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText('사기 전에 한 번 더 · 걸리는 점 1개')).toBeInTheDocument()
    const concerns = within(check.getByRole('list', { name: '걸리는 점' }))
    expect(concerns.getAllByRole('listitem').map((li) => li.textContent)).toEqual(["입력한 치수로는 '싱크대 옆 칸'에 안 들어가요"])
  })
})
