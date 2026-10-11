import { act, render, renderHook, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'
import { useWishlist } from './store/useWishlist'

// PRD F22 고민 노트 (AC36~AC40): 갖고 싶은 정도, 카드에서 답하는 질문, 사기 전 점검의 정도 변화와 그 밖에 답한 것,
// 고민 기간 중 결정 버튼, 목록 먼저, 결정 기록의 고민 효과
const T0 = new Date(2026, 9, 11, 9)
const DAY = 24 * 60 * 60 * 1000
const at = (days: number) => new Date(T0.getTime() + days * DAY).toISOString()
const TODAY = '2026-10-11'
const YESTERDAY = '2026-10-10'

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

// 어제 담은 고민 중인 물건 (2일 남음)
const thing = (over: Record<string, unknown> = {}) => ({
  id: 'h1',
  name: '무선 헤드폰',
  priceKrw: 129000,
  reason: '출퇴근길에 쓰려고',
  url: null,
  createdAt: at(-1),
  updatedAt: at(-1),
  reviewAt: at(2),
  status: 'considering',
  decidedAt: null,
  ...over,
})
const store = (...items: unknown[]) => JSON.stringify({ schemaVersion: 1, items })
function setup(...items: unknown[]) {
  if (items.length > 0) localStorage.setItem(STORAGE_KEY, store(...items))
  const user = userEvent.setup()
  render(<App />)
  return user
}
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items as Record<string, unknown>[]
const card = (name: string) => within(screen.getByRole('article', { name }))
const note = (name: string) => within(card(name).getByRole('region', { name: '오늘의 고민' }))
const scale = (name: string) => note(name).getByRole('group', { name: '지금 얼마나 갖고 싶나요?' })
const form = () => within(screen.getByRole('form', { name: '물건 담기' }))
function otherTabWrites(value: string) {
  localStorage.setItem(STORAGE_KEY, value)
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  })
}
async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(form().getByLabelText('상품명'), '전기 포트')
  await user.type(form().getByLabelText('가격'), '32000')
  await user.type(form().getByLabelText('사고 싶은 이유'), '냄비가 없어서')
}

describe('갖고 싶은 정도 (F22, AC36)', () => {
  it('담을 때 정도를 고르면 저장되고, 카드의 오늘의 고민에 "담을 때 4"가 보인다', async () => {
    const user = setup()
    await fillBasics(user)
    const startScale = form().getByRole('group', { name: '지금 얼마나 갖고 싶나요? (선택)' })
    await user.click(within(startScale).getByRole('radio', { name: '4 많이' }))
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    expect(saved()[0].desireStart).toBe(4)
    expect(saved()[0].desireStartDay).toBe(TODAY)
    expect(note('전기 포트').getByText('담을 때 4')).toBeInTheDocument()
    expect(within(form().getByRole('group', { name: '지금 얼마나 갖고 싶나요? (선택)' })).getByRole('radio', { name: '4 많이' })).not.toBeChecked()
  })

  it('고르지 않고 담으면 정도가 없고 변화 문장도 없다', async () => {
    const user = setup()
    await fillBasics(user)
    await user.click(form().getByRole('button', { name: '담아 두기' }))
    expect(saved()[0]).not.toHaveProperty('desireStart')
    expect(note('전기 포트').queryByText(/^(담을 때|처음) /)).not.toBeInTheDocument()
  })

  it('카드에서 오늘 정도를 고르면 저장되고 문장이 바뀐다. 같은 날 다시 고르면 그날 값을 바꾼다', async () => {
    const user = setup(thing({ desireStart: 4 }))
    await user.click(within(scale('무선 헤드폰')).getByRole('radio', { name: '3 보통' }))
    expect(note('무선 헤드폰').getByText('담을 때 4 → 3 (1 줄었어요)')).toBeInTheDocument()
    expect(scale('무선 헤드폰')).toHaveAccessibleDescription('담을 때 4 → 3 (1 줄었어요)')
    await user.click(within(scale('무선 헤드폰')).getByRole('radio', { name: '2 조금' }))
    expect(note('무선 헤드폰').getByText('담을 때 4 → 2 (2 줄었어요)')).toBeInTheDocument()
    expect(within(scale('무선 헤드폰')).getByRole('radio', { name: '2 조금' })).toBeChecked()
    expect(saved()[0].desireChecks).toEqual([{ day: TODAY, level: 2 }])
  })

  it('담은 날 다시 고른 값은 값만 보이고 판정하지 않는다', async () => {
    const user = setup(thing({ desireStart: 4, createdAt: at(0), updatedAt: at(0), reviewAt: at(3) }))
    await user.click(within(scale('무선 헤드폰')).getByRole('radio', { name: '2 조금' }))
    expect(note('무선 헤드폰').getByText('담을 때 4 → 2')).toBeInTheDocument()
  })

  it('열어 둔 화면에서 날짜가 바뀌면 오늘 선택이 비어 보인다 (AC36-2)', () => {
    setup(thing({ desireStart: 4, desireChecks: [{ day: TODAY, level: 3 }] }))
    expect(within(scale('무선 헤드폰')).getByRole('radio', { name: '3 보통' })).toBeChecked()
    vi.setSystemTime(new Date(2026, 9, 12, 0, 5))
    act(() => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(within(scale('무선 헤드폰')).getByRole('radio', { name: '3 보통' })).not.toBeChecked()
    expect(note('무선 헤드폰').getByText('담을 때 4 → 3 (1 줄었어요)')).toBeInTheDocument()
  })
})

describe('생각해 볼 질문 (F22, AC37)', () => {
  it('답하지 않은 물건은 문제 설명부터 묻고, 빈 답은 오류, 답하면 다음 질문으로 포커스를 옮긴다', async () => {
    const user = setup(thing())
    expect(note('무선 헤드폰').getByText('생각해 볼 질문 · 6개 남음')).toBeInTheDocument()
    const input = note('무선 헤드폰').getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' })
    await user.click(note('무선 헤드폰').getByRole('button', { name: '답하기' }))
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('답을 적어 주세요')
    expect(saved()[0]).not.toHaveProperty('answers')
    await user.type(input, ' 출퇴근 때 못 들어요 ')
    await user.click(note('무선 헤드폰').getByRole('button', { name: '답하기' }))
    expect(saved()[0].answers).toEqual({ problem: '출퇴근 때 못 들어요' })
    expect(note('무선 헤드폰').getByText('생각해 볼 질문 · 5개 남음')).toBeInTheDocument()
    expect(note('무선 헤드폰').getByText('한 달 뒤에도 쓸까요?')).toHaveFocus()
  })

  it('문제 설명 오류는 알림으로 읽히고, 입력에서 Enter로 제출해도 같다 (GPT 코드 검토)', async () => {
    const user = setup(thing())
    await user.type(note('무선 헤드폰').getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' }), '{Enter}')
    expect(note('무선 헤드폰').getByRole('alert')).toHaveTextContent('답을 적어 주세요')
    expect(note('무선 헤드폰').getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' })).toHaveFocus()
    expect(saved()[0]).not.toHaveProperty('answers')
  })

  it('문제 설명이 201자면 오류를 보여주고 저장하지 않는다', async () => {
    const user = setup(thing())
    await user.click(note('무선 헤드폰').getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' }))
    await user.paste('가'.repeat(201))
    await user.click(note('무선 헤드폰').getByRole('button', { name: '답하기' }))
    expect(note('무선 헤드폰').getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' })).toHaveAccessibleDescription(
      '메모는 200자 이하로 적어 주세요',
    )
    expect(saved()[0]).not.toHaveProperty('answers')
  })

  it('선택형은 버튼을 누르면 바로 저장하고, 남은 수가 줄고 다음 질문으로 포커스를 옮긴다', async () => {
    const user = setup(thing({ answers: { problem: '음악' } }))
    await user.click(note('무선 헤드폰').getByRole('button', { name: '쓸 것 같아요' }))
    expect(saved()[0].answers).toEqual({ problem: '음악', useInMonth: 'yes' })
    expect(note('무선 헤드폰').getByText('생각해 볼 질문 · 4개 남음')).toBeInTheDocument()
    expect(note('무선 헤드폰').getByText('지금 쓰는 게 있나요?')).toHaveFocus()
  })

  it('이유에 할인 문구가 있어도 카드에서는 할인 질문을 묻는다', () => {
    setup(thing({ reason: '세일이라서' }))
    expect(note('무선 헤드폰').getByText('생각해 볼 질문 · 6개 남음')).toBeInTheDocument()
  })

  it('할인 질문에 아니요라고 답하면 점검에서 이유의 할인 문구를 근거로 세지 않는다', async () => {
    const user = setup(thing({ reason: '세일이라서', reviewAt: at(-0.5), answers: { problem: '음악', useInMonth: 'yes', haveOne: 'no' } }))
    expect(note('무선 헤드폰').getByText('할인·한정 때문인가요?')).toBeInTheDocument()
    await user.click(note('무선 헤드폰').getByRole('button', { name: '아니요' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    const check = within(card('무선 헤드폰').getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText('사기 전에 한 번 더 · 걸리는 점이 없어요')).toBeInTheDocument()
  })

  it('모두 답하면 질문 칸이 사라지고 오늘의 고민 제목으로 포커스를 옮긴다', async () => {
    const user = setup(thing({ answers: { problem: '음악', useInMonth: 'yes', haveOne: 'no', saleDriven: 'no', spaceTime: 'yes' } }))
    await user.click(note('무선 헤드폰').getByRole('button', { name: '어려워요' }))
    expect(note('무선 헤드폰').queryByText(/생각해 볼 질문/)).not.toBeInTheDocument()
    expect(note('무선 헤드폰').getByText('오늘의 고민')).toHaveFocus()
  })

  it('답한 것은 고민 중에도 보이고, 다시 답하기를 누르면 그 답이 지워져 질문으로 돌아간다', async () => {
    const user = setup(thing({ answers: { problem: '음악', useInMonth: 'yes', haveOne: 'yes' } }))
    const answers = within(card('무선 헤드폰').getByRole('list', { name: '답한 것' }))
    expect(answers.getByText('지금 쓰는 게 있어요')).toBeInTheDocument()
    await user.click(answers.getByRole('button', { name: '‘지금 쓰는 게 있어요’ 다시 답하기' }))
    expect(saved()[0].answers).toEqual({ problem: '음악', useInMonth: 'yes' })
    expect(note('무선 헤드폰').getByText('생각해 볼 질문 · 4개 남음')).toBeInTheDocument()
    expect(note('무선 헤드폰').getByText('지금 쓰는 게 있나요?')).toHaveFocus()
  })

  it('공백뿐인 문제 설명이 저장된 기록은 답하지 않은 것으로 본다', () => {
    setup(thing({ answers: { problem: '   ', useInMonth: 'yes' } }))
    expect(note('무선 헤드폰').getByText('없으면 어떤 문제가 있나요?')).toBeInTheDocument()
    expect(screen.queryByText(/없으면 생기는 문제/)).not.toBeInTheDocument()
  })
})

describe('저장과 여러 탭 (F22, AC37-2)', () => {
  it('다른 탭이 먼저 저장했으면 답을 반영하지 않고 그 기록을 불러와 알리며, 포커스를 옮기지 않는다', async () => {
    const user = setup(thing({ answers: { problem: '음악' } }))
    localStorage.setItem(STORAGE_KEY, store(thing({ answers: { problem: '음악' }, reason: '다른 탭에서 고친 이유' })))
    const button = note('무선 헤드폰').getByRole('button', { name: '쓸 것 같아요' })
    await user.click(button)
    expect(saved()[0]).toMatchObject({ answers: { problem: '음악' }, reason: '다른 탭에서 고친 이유' })
    expect(screen.getByRole('status', { name: '저장 상태' })).toHaveTextContent('다른 탭에서 저장한 기록을 불러왔어요')
    expect(note('무선 헤드폰').getByText('한 달 뒤에도 쓸까요?')).not.toHaveFocus()
    expect(button).toHaveFocus()
  })

  it('다른 탭에서 결정한 물건이면 카드가 사라지므로 화면 제목으로 포커스를 옮긴다 (GPT 코드 검토)', async () => {
    const user = setup(thing({ answers: { problem: '음악' } }))
    localStorage.setItem(STORAGE_KEY, store(thing({ answers: { problem: '음악' }, status: 'skipped', decidedAt: at(0) })))
    await user.click(note('무선 헤드폰').getByRole('button', { name: '쓸 것 같아요' }))
    expect(screen.queryByRole('article', { name: '무선 헤드폰' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toHaveFocus()
  })

  it('다른 탭이 같은 질문에 먼저 답했으면 누른 버튼이 사라지므로 화면 제목으로 포커스를 옮긴다', async () => {
    const user = setup(thing({ answers: { problem: '음악' } }))
    localStorage.setItem(STORAGE_KEY, store(thing({ answers: { problem: '음악', useInMonth: 'no' } })))
    await user.click(note('무선 헤드폰').getByRole('button', { name: '쓸 것 같아요' }))
    expect(saved()[0].answers).toEqual({ problem: '음악', useInMonth: 'no' })
    expect(screen.getByRole('heading', { level: 2, name: '고민 중인 물건' })).toHaveFocus()
  })

  it('답할 때 저장에 실패해도 화면에는 반영하고 다음 질문으로 포커스를 옮긴다', async () => {
    const user = setup(thing({ answers: { problem: '음악' } }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await user.click(note('무선 헤드폰').getByRole('button', { name: '쓸 것 같아요' }))
    expect(note('무선 헤드폰').getByText('지금 쓰는 게 있나요?')).toHaveFocus()
    expect(screen.getByRole('status', { name: '저장 상태' })).toHaveTextContent('저장하지 못했어요')
  })

  it('고민 중이 아닌 물건에는 정도도 답도 기록하지 않는다', () => {
    localStorage.setItem(STORAGE_KEY, store(thing({ status: 'skipped', decidedAt: at(0) })))
    const { result } = renderHook(() => useWishlist())
    let applied = true
    act(() => {
      applied = result.current.checkDesire('h1', 2)
    })
    expect(applied).toBe(false)
    act(() => {
      applied = result.current.answer('h1', 'haveOne', 'no')
    })
    expect(applied).toBe(false)
    expect(saved()[0]).not.toHaveProperty('desireChecks')
    expect(saved()[0]).not.toHaveProperty('answers')
  })

  it('정도를 고를 때 저장에 실패하면 화면에는 반영하고 저장 안내를 보인다', async () => {
    const user = setup(thing({ desireStart: 4 }))
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError')
    })
    await user.click(within(scale('무선 헤드폰')).getByRole('radio', { name: '3 보통' }))
    expect(note('무선 헤드폰').getByText('담을 때 4 → 3 (1 줄었어요)')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '저장 상태' })).toHaveTextContent('저장하지 못했어요')
  })

  it('수정 폼을 연 동안 다른 탭에서 정도를 기록하면 저장을 멈추고, 다시 열어 저장하면 정도 기록이 남는다', async () => {
    const user = setup(thing({ desireStart: 4 }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '수정' }))
    // 수정 폼을 연 카드에는 오늘의 고민이 없어 같은 탭에서는 수정 중에 정도·답이 바뀌지 않는다
    expect(card('무선 헤드폰').queryByRole('region', { name: '오늘의 고민' })).not.toBeInTheDocument()
    otherTabWrites(store(thing({ desireStart: 4, desireChecks: [{ day: TODAY, level: 2 }], updatedAt: at(0) })))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '저장' }))
    expect(card('무선 헤드폰').getByRole('alert')).toHaveTextContent('다른 탭에서 이 물건이 바뀌었어요')
    await user.click(card('무선 헤드폰').getByRole('button', { name: '취소' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '수정' }))
    await user.clear(card('무선 헤드폰').getByLabelText('가격'))
    await user.type(card('무선 헤드폰').getByLabelText('가격'), '119000')
    await user.click(card('무선 헤드폰').getByRole('button', { name: '저장' }))
    expect(saved()[0]).toMatchObject({ priceKrw: 119000, desireStart: 4, desireChecks: [{ day: TODAY, level: 2 }] })
  })
})

describe('사기 전 점검 (F22, AC38)', () => {
  it('맨 위에 정도 변화를, 걸리는 점 아래에 그 밖에 답한 것을 보여준다', async () => {
    const user = setup(
      thing({
        createdAt: at(-2),
        updatedAt: at(-2),
        reviewAt: at(-1),
        desireStart: 4,
        desireChecks: [{ day: YESTERDAY, level: 2 }],
        answers: { haveOne: 'no', useInMonth: 'yes', saleDriven: 'yes' },
      }),
    )
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    const check = within(card('무선 헤드폰').getByRole('region', { name: '사기 전 점검' }))
    expect(check.getByText('갖고 싶은 정도: 담을 때 4 → 2 (2 줄었어요)')).toBeInTheDocument()
    expect(check.getByText('사기 전에 한 번 더 · 걸리는 점 1개')).toBeInTheDocument()
    expect(within(check.getByRole('list', { name: '걸리는 점' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      "'할인·한정 때문'이라고 답했어요. 할인이 없어도 살까요?",
    ])
    expect(within(check.getByRole('list', { name: '그 밖에 답한 것' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      '한 달 뒤에도 쓸지: 쓸 것 같아요',
      '지금 쓰는 게 없어요',
    ])
  })

  it('정도 기록이 없으면 정도 줄이 없다', async () => {
    const user = setup(thing({ answers: { haveOne: 'yes' } }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매함' }))
    const check = within(card('무선 헤드폰').getByRole('region', { name: '사기 전 점검' }))
    expect(check.queryByText(/^갖고 싶은 정도:/)).not.toBeInTheDocument()
    expect(check.queryByRole('list', { name: '그 밖에 답한 것' })).not.toBeInTheDocument()
    expect(check.getByText("'지금 쓰는 게 있어요'라고 답했어요")).toBeInTheDocument()
  })
})

describe('결정 버튼과 목록 먼저 (F22, AC39)', () => {
  it('고민 기간이 남았으면 "일찍 정할 수도 있어요"이고 두 버튼은 같은 모양이다', () => {
    setup(thing())
    expect(card('무선 헤드폰').getByText('일찍 정할 수도 있어요')).toBeInTheDocument()
    const buy = card('무선 헤드폰').getByRole('button', { name: '구매함' })
    expect(buy).not.toHaveClass('btn-primary')
    expect(buy.className).toBe(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }).className)
  })

  it('재검토 가능이면 "아직 필요한가요?"이고 두 버튼은 같은 모양이다', () => {
    setup(thing({ reviewAt: at(-0.5) }))
    expect(card('무선 헤드폰').getByText('아직 필요한가요?')).toBeInTheDocument()
    const buy = card('무선 헤드폰').getByRole('button', { name: '구매함' })
    expect(buy.className).toBe(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }).className)
  })

  it('고민 중인 물건이 있으면 목록이 담기 폼보다 위에 있고, 새 물건 담기를 누르면 상품명으로 포커스가 간다', async () => {
    const user = setup(thing())
    const list = screen.getByRole('region', { name: '고민 중인 물건 목록' })
    expect(list.compareDocumentPosition(screen.getByRole('form', { name: '물건 담기' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '새 물건 담기' }))
    expect(form().getByLabelText('상품명')).toHaveFocus()
  })

  it('고민 중인 물건이 없으면 담기 폼이 먼저이고 새 물건 담기가 없다', () => {
    setup()
    expect(screen.queryByRole('button', { name: '새 물건 담기' })).not.toBeInTheDocument()
    const empty = screen.getByText('아직 담아 둔 물건이 없어요.')
    expect(screen.getByRole('form', { name: '물건 담기' }).compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('마지막 물건을 결정해 담기 폼이 위로 올라가도 적던 상품명은 그대로다', async () => {
    const user = setup(thing())
    await user.type(form().getByLabelText('상품명'), '전기 포트')
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '구매 포기 확인' }))
    expect(form().getByLabelText('상품명')).toHaveValue('전기 포트')
  })

  it('다른 탭에서 물건이 생겨 담기 폼이 아래로 내려가도 적던 상품명은 그대로다', async () => {
    const user = setup()
    await user.type(form().getByLabelText('상품명'), '전기 포트')
    otherTabWrites(store(thing()))
    expect(screen.getByRole('article', { name: '무선 헤드폰' })).toBeInTheDocument()
    expect(form().getByLabelText('상품명')).toHaveValue('전기 포트')
  })

  it('물건이 있을 때 가격 비교에서 B안으로 담으면 상품명에 포커스를 두고 가격을 채운다 (F21)', async () => {
    const user = setup(thing())
    await user.click(screen.getByRole('tab', { name: '가격 비교' }))
    await user.click(screen.getByRole('button', { name: '예시 넣기' }))
    await user.click(within(screen.getByRole('region', { name: '할인 비교 결과' })).getByRole('button', { name: 'B안으로 담기' }))
    expect(form().getByLabelText('상품명')).toHaveFocus()
    expect(form().getByLabelText('가격')).toHaveValue('72000')
  })
})

describe('결정 기록의 고민 효과 (F22, AC40)', () => {
  const decided = (id: string, name: string, status: string, over: Record<string, unknown> = {}) =>
    thing({ id, name, status, decidedAt: at(-1), createdAt: at(-3), updatedAt: at(-1), reviewAt: at(-2), ...over })

  it('정도가 줄어든 결정 기록이 있으면 요약 문장과 카드의 변화 문장을 보여준다', async () => {
    const user = setup(
      decided('a', '헤드폰', 'skipped', { desireStart: 4, desireChecks: [{ day: '2026-10-09', level: 2 }] }),
      decided('b', '키보드', 'skipped', { desireStart: 5, desireChecks: [{ day: '2026-10-09', level: 3 }] }),
      decided('c', '청소기', 'purchased', { desireStart: 3, desireChecks: [{ day: '2026-10-09', level: 4 }] }),
      decided('d', '포트', 'skipped'),
    )
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    const summary = within(screen.getByRole('region', { name: '결정 기록 요약' }))
    expect(summary.getByText('고민하는 동안 갖고 싶은 정도가 줄어든 물건 2개 중 2개를 안 샀어요')).toBeInTheDocument()
    expect(card('헤드폰').getByText('갖고 싶은 정도: 담을 때 4 → 2 (2 줄었어요)')).toBeInTheDocument()
    expect(card('포트').queryByText(/갖고 싶은 정도/)).not.toBeInTheDocument()
  })

  it('줄어든 기록이 없으면 요약 문장이 없다', async () => {
    const user = setup(decided('c', '청소기', 'purchased', { desireStart: 3, desireChecks: [{ day: '2026-10-09', level: 4 }] }))
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(screen.queryByText(/고민하는 동안 갖고 싶은 정도가 줄어든/)).not.toBeInTheDocument()
  })

  it('예시 물건을 넣으면 헤드폰 카드와 결정 기록 요약에 고민 효과가 보인다', async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))
    expect(note('(예시) 무선 헤드폰').getByText('담을 때 4 → 3 → 2 (2 줄었어요)')).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    expect(screen.getByText('고민하는 동안 갖고 싶은 정도가 줄어든 물건 1개 중 1개를 안 샀어요')).toBeInTheDocument()
  })
})
