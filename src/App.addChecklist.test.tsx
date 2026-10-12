import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'

// PRD F28 담기 폼의 접힌 체크리스트와 예시 채우기 (AC47): 담을 때도 답할 수 있게 접어 두고(선택),
// "예시 물건 넣기"는 예시 카드와 함께 담기 폼을 체크리스트까지 채운다
const T0 = new Date(2026, 9, 11, 9)

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

const form = () => within(screen.getByRole('form', { name: '물건 담기' }))
const card = (name: string) => within(screen.getByRole('article', { name }))
const saved = () => JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').items as Record<string, unknown>[]
const checklist = () => form().getByText(/^체크리스트 \(선택\)/).closest('details')!

describe('담기 폼의 체크리스트 (F28, AC47)', () => {
  it('체크리스트는 접혀 있고, 일부만 답해 담으면 답이 카드 체크리스트로 가고 폼은 비워져 다시 접힌다', async () => {
    const user = userEvent.setup()
    render(<App />)
    expect(checklist()).not.toHaveAttribute('open')
    await user.click(form().getByText(/^체크리스트 \(선택\)/))
    await user.type(form().getByLabelText('상품명'), '전기 포트')
    await user.type(form().getByLabelText('가격'), '32000')
    await user.type(form().getByLabelText('사고 싶은 이유'), '냄비가 없어서')
    await user.type(form().getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' }), ' 물 끓이기가 느려요 ')
    await user.click(within(form().getByRole('group', { name: '지금 쓰는 게 있나요?' })).getByRole('radio', { name: '없어요' }))
    expect(form().getByText('체크리스트 (선택) · 2/6')).toBeInTheDocument()
    await user.click(form().getByRole('button', { name: '담아 두기' }))

    expect(saved()[0].answers).toEqual({ problem: '물 끓이기가 느려요', haveOne: 'no' })
    expect(card('전기 포트').getByText('체크리스트 2/6')).toBeInTheDocument()
    expect(checklist()).not.toHaveAttribute('open')
    expect(form().getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' })).toHaveValue('')
    expect(within(form().getByRole('group', { name: '지금 쓰는 게 있나요?' })).getByRole('radio', { name: '없어요' })).not.toBeChecked()
    expect(form().getByText('체크리스트 (선택)')).toBeInTheDocument()
  })

  it('문제 설명은 200자까지만 적힌다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(form().getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' }))
    await user.paste('가'.repeat(201))
    expect(form().getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' })).toHaveValue('가'.repeat(200))
  })

  it('예시 물건 넣기는 예시 카드와 함께 담기 폼을 체크리스트까지 채우고, 담으면 카드 체크리스트가 6/6이다', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByRole('button', { name: '예시 물건 넣기' }))

    expect(form().getByText('예시를 입력했어요. ‘담아 두기’를 누르면 체크리스트 답도 물건 카드에 표시돼요.')).toBeInTheDocument()
    expect(form().getByLabelText('상품명')).toHaveValue('(예시) 전기 포트')
    expect(form().getByLabelText('상품명')).toHaveFocus()
    expect(form().getByLabelText('가격')).toHaveValue('32000')
    expect(form().getByLabelText('사고 싶은 이유')).toHaveValue('냄비로 물을 끓이기 번거로워서')
    expect(within(form().getByRole('group', { name: '지금 얼마나 갖고 싶나요? (선택)' })).getByRole('radio', { name: '4 많이' })).toBeChecked()
    expect(checklist()).toHaveAttribute('open')
    expect(form().getByText('체크리스트 (선택) · 6/6')).toBeInTheDocument()
    expect(form().getByRole('textbox', { name: '없으면 어떤 문제가 있나요?' })).toHaveValue('아침마다 물 끓이는 데 10분씩 걸려요')
    expect(within(form().getByRole('group', { name: '할인·한정 때문인가요?' })).getByRole('radio', { name: '네' })).toBeChecked()

    await user.click(form().getByRole('button', { name: '담아 두기' }))
    expect(card('(예시) 전기 포트').getByText('체크리스트 6/6')).toBeInTheDocument()
    expect(form().getByRole('status', { name: '담은 물건' })).toHaveTextContent(
      '‘(예시) 전기 포트’를 담았어요. 3일 뒤에 처음 적은 이유와 갖고 싶은 정도의 변화를 다시 보여 드릴게요. 체크리스트 답은 카드에서 다시 고칠 수 있어요.',
    )
    expect(form().queryByText(/^예시 값을 채웠어요/)).not.toBeInTheDocument()
    expect(saved().find((item) => item.name === '(예시) 전기 포트')).toMatchObject({
      priceKrw: 32000,
      desireStart: 4,
      answers: { problem: '아침마다 물 끓이는 데 10분씩 걸려요', useInMonth: 'yes', haveOne: 'no', saleDriven: 'yes', spaceTime: 'yes', alternative: 'no' },
    })
  })
})
