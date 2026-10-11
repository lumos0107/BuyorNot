import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SUBS_KEY } from './logic/subscriptions'

// PRD F26 13-3: 구독 카드의 이용 기록 가져오기 (넷플릭스 시청 기록 CSV, 가짜 예시 데이터) — AC45
beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 11, 9))
})

afterEach(() => {
  vi.useRealTimers()
})

const sub = {
  id: 's1',
  name: '넷플릭스',
  priceKrw: 13500,
  cycle: 'monthly',
  billingDay: 15,
  lastUsedDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
}
const CSV = ['Title,Date', '"예시 A",10/9/26', '"예시 A",10/9/26', '"예시 B",10/9/26', '"예시 C",10/1/26', '"이상한 줄",어제', '"예시 D",8/20/26'].join('\n')
const file = (text: string, name = 'NetflixViewingHistory.csv') => new File([text], name, { type: 'text/csv' })

async function open() {
  localStorage.setItem(SUBS_KEY, JSON.stringify({ schemaVersion: 1, items: [sub] }))
  const user = userEvent.setup()
  render(<App />)
  await user.click(screen.getByRole('tab', { name: '구독' }))
  return user
}
const card = () => within(screen.getByRole('article', { name: '넷플릭스' }))
const panel = () => within(card().getByRole('region', { name: '이용 기록 가져오기' }))
const saved = () => JSON.parse(localStorage.getItem(SUBS_KEY) ?? '{}').items[0]

describe('이용 기록 가져오기 (F26, AC45)', () => {
  it('파일을 고르면 미리보기를 보여주고, 가져오기를 누르면 저장해 카드에 출처·기간·가져온 날과 함께 보인다', async () => {
    const user = await open()
    await user.click(card().getByRole('button', { name: '이용 기록 가져오기' }))
    expect(panel().getByText(/지금은 넷플릭스 시청 기록 파일\(CSV\)만/)).toBeInTheDocument()
    await user.upload(panel().getByLabelText('시청 기록 파일 (CSV)'), file(CSV))
    const preview = within(await panel().findByRole('group', { name: '가져오기 미리보기' }))
    expect(preview.getByText('넷플릭스 시청 기록 · 기록 4개 (같은 날 같은 제목 1개 합침)')).toBeInTheDocument()
    expect(preview.getByText('기간 2026-08-20 ~ 2026-10-09 · 이용 일수 3일')).toBeInTheDocument()
    expect(preview.getByText('날짜를 읽지 못한 줄 1개는 빼요.')).toBeInTheDocument()
    expect(preview.getByText('이 구독에 이 기록을 저장할까요?')).toBeInTheDocument()
    await user.click(preview.getByRole('button', { name: '가져오기' }))

    expect(card().getByText('넷플릭스 시청 기록: 최근 30일 2일 · 기록 3개 · 최근 30일 중 28일분만 있어요 (파일 2026-08-20~2026-10-09 · 10/11 가져옴)')).toBeInTheDocument()
    const record = saved().usageRecords[0]
    expect(record).toEqual({
      source: 'netflix-csv',
      from: '2026-08-20',
      to: '2026-10-09',
      updatedAt: new Date(2026, 9, 11, 9).toISOString(),
      entries: [
        { day: '2026-08-20', plays: 1 },
        { day: '2026-10-01', plays: 1 },
        { day: '2026-10-09', plays: 2 },
      ],
    })
    expect(JSON.stringify(saved())).not.toContain('예시 A')
    expect(card().getByRole('button', { name: '이용 기록 가져오기' })).toHaveFocus()
    expect(card().queryByText('확인 필요')).not.toBeInTheDocument()
  })

  it('같은 파일을 다시 가져오면 바꿀지 묻고, 바꿔도 두 번 세지 않는다', async () => {
    const user = await open()
    for (let i = 0; i < 2; i += 1) {
      await user.click(card().getByRole('button', { name: '이용 기록 가져오기' }))
      await user.upload(panel().getByLabelText('시청 기록 파일 (CSV)'), file(CSV))
      const preview = within(await panel().findByRole('group', { name: '가져오기 미리보기' }))
      if (i === 1) expect(preview.getByText('이 구독의 넷플릭스 시청 기록을 이 파일로 바꿀까요?')).toBeInTheDocument()
      await user.click(preview.getByRole('button', { name: '가져오기' }))
    }
    expect(saved().usageRecords).toHaveLength(1)
    expect(card().getByText(/최근 30일 2일 · 기록 3개/)).toBeInTheDocument()
  })

  it('취소하면 아무것도 저장하지 않고 버튼으로 돌아간다', async () => {
    const user = await open()
    await user.click(card().getByRole('button', { name: '이용 기록 가져오기' }))
    await user.upload(panel().getByLabelText('시청 기록 파일 (CSV)'), file(CSV))
    await panel().findByRole('group', { name: '가져오기 미리보기' })
    await user.click(panel().getByRole('button', { name: '취소' }))
    expect(saved()).not.toHaveProperty('usageRecords')
    expect(card().queryByRole('region', { name: '이용 기록 가져오기' })).not.toBeInTheDocument()
    expect(card().getByRole('button', { name: '이용 기록 가져오기' })).toHaveFocus()
  })

  it('형식이 다르거나 기록이 없는 파일은 이유를 입력에 연결해 알리고 미리보기를 보여주지 않는다', async () => {
    const user = await open()
    await user.click(card().getByRole('button', { name: '이용 기록 가져오기' }))
    const input = panel().getByLabelText('시청 기록 파일 (CSV)')
    await user.upload(input, file('Name,Amount\n"a",3'))
    expect(await panel().findByText('넷플릭스 시청 기록 파일이 아니에요. 첫 줄이 Title,Date(또는 제목,날짜)인 CSV인지 확인해 주세요.')).toBeInTheDocument()
    expect(input).toHaveAccessibleDescription(/넷플릭스 시청 기록 파일이 아니에요/)
    expect(panel().queryByRole('group', { name: '가져오기 미리보기' })).not.toBeInTheDocument()
    await user.upload(input, file('Title,Date\n'))
    expect(await panel().findByText('파일에 시청 기록이 없어요.')).toBeInTheDocument()
  })

  it('날짜 순서가 파일만으로 정해지지 않으면 월/일로 읽었다고 알리고 일/월로 다시 읽을 수 있다', async () => {
    const user = await open()
    await user.click(card().getByRole('button', { name: '이용 기록 가져오기' }))
    await user.upload(panel().getByLabelText('시청 기록 파일 (CSV)'), file('Title,Date\n"예시 A",10/3/26\n"예시 B",10/9/26'))
    const preview = within(await panel().findByRole('group', { name: '가져오기 미리보기' }))
    expect(preview.getByText('날짜를 월/일 순서로 읽었어요.')).toBeInTheDocument()
    expect(preview.getByText('기간 2026-10-03 ~ 2026-10-09 · 이용 일수 2일')).toBeInTheDocument()
    await user.click(preview.getByRole('button', { name: '일/월로 다시 읽기' }))
    expect(preview.getByText('날짜를 일/월 순서로 읽었어요.')).toBeInTheDocument()
    expect(preview.getByText('기간 2026-03-10 ~ 2026-09-10 · 이용 일수 2일')).toBeInTheDocument()
  })
})
