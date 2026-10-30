import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { STORAGE_KEY } from './logic/storage'
import { downloadText } from './ui/download'

// PRD F35 고민 끝나는 날 캘린더에 넣기 (AC59, 서버 주소가 없는 빌드는 AC61): 고민 중이고 기간이 아직 끝나지 않은 카드의 캘린더 줄.
// 파일·주소를 만드는 계산은 src/logic/calendar.test.ts가 보고, 이 파일은 화면(어느 카드에 보이는지, 링크와 버튼이 하는 일)을 본다.
// 내려받기는 모듈 모의(vi.mock)로 바꾸고 파일 이름과 내용만 확인한다. 실제 내려받기 방식은 src/ui/download.test.ts가 본다.
// AC59의 시각은 한국 시간 기준이다(reviewAt은 UTC로 적혀 있고 파일 이름은 현지 날짜라 UTC 이상의 시간대에서 같다).
vi.mock('./ui/download', () => ({ downloadText: vi.fn() }))

const T0 = new Date(2026, 9, 11, 9) // 지금 2026-10-11 09:00 (현지)
const HOUR = 60 * 60 * 1000
const REVIEW_AT = '2026-10-14T00:00:00.000Z'
const LABEL = '고민 기간이 끝나는 날 캘린더에 넣기:'
const NOTICE =
  '구글 캘린더를 누르면 상품명과 일정 시각이 구글로 전달돼요. 기간을 늘리면 전에 넣은 일정은 바뀌지 않으니 고치거나 지우고 다시 넣어 주세요.'
const GOOGLE = '구글 캘린더'
const ICS = '캘린더 파일(.ics)'

beforeEach(() => {
  localStorage.clear()
  vi.mocked(downloadText).mockClear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

// AC59 입력: 고민 중 '무선 헤드폰'(id h1, reviewAt 2026-10-14T00:00:00Z, 이유 '선이 끊겨서')
const thing = (over: Record<string, unknown> = {}) => ({
  id: 'h1',
  name: '무선 헤드폰',
  priceKrw: 129000,
  reason: '선이 끊겨서',
  url: null,
  createdAt: '2026-10-11T00:00:00.000Z',
  updatedAt: '2026-10-11T00:00:00.000Z',
  reviewAt: REVIEW_AT,
  status: 'considering',
  decidedAt: null,
  ...over,
})
const decided = (status: 'purchased' | 'skipped', over: Record<string, unknown> = {}) =>
  thing({ id: `d-${status}`, name: `결정한 ${status}`, status, decidedAt: '2026-10-11T00:00:00.000Z', ...over })

function setup(...items: unknown[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, items }))
  const user = userEvent.setup()
  render(<App />)
  return user
}
const card = (name: string) => within(screen.getByRole('article', { name }))
const googleLink = (name = '무선 헤드폰') => card(name).getByRole('link', { name: GOOGLE })
const icsButton = (name = '무선 헤드폰') => card(name).getByRole('button', { name: ICS })
const params = (link: HTMLElement) => new URL(link.getAttribute('href') ?? '').searchParams
async function passTime(ms: number) {
  vi.setSystemTime(new Date(Date.now() + ms))
  await act(async () => {
    window.dispatchEvent(new Event('focus'))
  })
}
const downloaded = () => {
  expect(downloadText).toHaveBeenCalledTimes(1)
  const [fileName, text, type] = vi.mocked(downloadText).mock.calls[0]
  return { fileName, text, type }
}

describe('고민 끝나는 날 캘린더 줄 (F35, AC59)', () => {
  it('AC59: 고민 중인 카드에 구글 캘린더 링크와 캘린더 파일(.ics) 버튼과 안내가 보인다', () => {
    setup(thing())
    const view = card('무선 헤드폰')
    expect(view.getByRole('group', { name: LABEL })).toBeInTheDocument()
    expect(view.getByText(LABEL)).toBeInTheDocument()
    expect(googleLink()).toBeInTheDocument()
    expect(icsButton()).toBeInTheDocument()
    expect(view.getByText(NOTICE)).toBeInTheDocument()
  })

  it('AC59: 줄은 결정 버튼 줄 아래, 더 고민하기·수정·삭제 앞에 있다', () => {
    setup(thing())
    const view = card('무선 헤드폰')
    const follows = (before: Element, after: Element) => Boolean(before.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(view.getByRole('button', { name: '구매 포기' }), view.getByText(LABEL))).toBe(true)
    expect(follows(view.getByText(NOTICE), view.getByRole('button', { name: '더 고민하기' }))).toBe(true)
  })

  it('AC59: 구글 캘린더 링크는 새 창으로 열리고 제목·시각·설명(이유 없음)이 주소에 담긴다', () => {
    setup(thing())
    const link = googleLink()
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect((link.getAttribute('href') ?? '').startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&')).toBe(true)
    const search = params(link)
    expect(search.get('text')).toBe('살까말까: ‘무선 헤드폰’ 고민 기간 끝')
    expect(search.get('dates')).toBe('20261014T000000Z/20261014T001500Z')
    expect(search.get('details')).toBe(
      '살까말까를 열어 갖고 싶은 정도를 다시 적고 살지 정해 보세요.\nhttps://lumos0107.github.io/BuyorNot/',
    )
    expect(decodeURIComponent(link.getAttribute('href') ?? '')).not.toContain('선이 끊겨서')
  })

  it('AC59: 이름에 &, #, +가 있어도 구글 링크의 제목이 그대로다', () => {
    setup(thing({ name: 'A&B #1 +2' }))
    expect(params(googleLink('A&B #1 +2')).get('text')).toBe('살까말까: ‘A&B #1 +2’ 고민 기간 끝')
  })

  it('AC59: 캘린더 파일(.ics) 버튼을 누르면 날짜가 붙은 파일 이름으로 내려받는다', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const openSpy = vi.spyOn(window, 'open')
    const user = setup(thing())
    await user.click(icsButton())
    const { fileName, text, type } = downloaded()
    expect(fileName).toBe('buyornot-2026-10-14.ics')
    expect(type).toBe('text/calendar;charset=utf-8')
    expect(text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(text).toContain('\r\nUID:h1@buyornot\r\n')
    expect(text).toContain('\r\nDTSTART:20261014T000000Z\r\n')
    expect(text).toContain('\r\nSUMMARY:살까말까: ‘무선 헤드폰’ 고민 기간 끝\r\n')
    expect(text).toContain('처음 적은 이유: 선이 끊겨서')
    // 내려받은 시각(지금)이 DTSTAMP다
    expect(text).toContain(`\r\nDTSTAMP:${T0.toISOString().replace(/[-:]|\.\d{3}/g, '')}\r\n`)
    // 파일을 만드는 동안 어디로도 보내지 않는다(구글 링크를 누를 때만 구글로 간다)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('AC59: 결정한 물건에는 캘린더 줄이 없다 (고민 기간이 남았어도)', async () => {
    const user = setup(thing(), decided('purchased'), decided('skipped'))
    expect(screen.getAllByRole('link', { name: GOOGLE })).toHaveLength(1) // 고민 중인 한 건만
    await user.click(screen.getByRole('tab', { name: '결정 기록' }))
    for (const name of ['결정한 purchased', '결정한 skipped']) {
      expect(card(name).queryByText(LABEL)).not.toBeInTheDocument()
      expect(card(name).queryByRole('link', { name: GOOGLE })).not.toBeInTheDocument()
      expect(card(name).queryByRole('button', { name: ICS })).not.toBeInTheDocument()
      expect(card(name).queryByText(NOTICE)).not.toBeInTheDocument()
    }
  })

  it('AC59: 고민 기간이 끝난 물건에는 캘린더 줄이 없다', () => {
    // 담은 날은 3일 전이다(끝나는 시각이 담은 시각보다 앞서면 저장소가 그 기록을 버린다)
    setup(thing({ createdAt: '2026-10-08T00:00:00.000Z', reviewAt: new Date(T0.getTime() - HOUR).toISOString() }))
    const view = card('무선 헤드폰')
    expect(view.getByText('고민 기간 끝')).toBeInTheDocument()
    expect(view.queryByText(LABEL)).not.toBeInTheDocument()
    expect(view.queryByRole('link', { name: GOOGLE })).not.toBeInTheDocument()
    expect(view.queryByRole('button', { name: ICS })).not.toBeInTheDocument()
    expect(view.queryByText(NOTICE)).not.toBeInTheDocument()
  })

  it('AC59: 화면을 열어 둔 채 고민 기간이 끝나면 캘린더 줄이 사라진다', async () => {
    setup(thing({ reviewAt: new Date(T0.getTime() + HOUR).toISOString() }))
    expect(googleLink()).toBeInTheDocument()
    await passTime(2 * HOUR)
    expect(card('무선 헤드폰').getByText('고민 기간 끝')).toBeInTheDocument()
    expect(card('무선 헤드폰').queryByRole('link', { name: GOOGLE })).not.toBeInTheDocument()
    expect(card('무선 헤드폰').queryByRole('button', { name: ICS })).not.toBeInTheDocument()
  })

  it('AC59: 3일 연장하면 링크와 파일이 새로 끝나는 날을 따른다', async () => {
    const user = setup(thing())
    expect(params(googleLink()).get('dates')).toBe('20261014T000000Z/20261014T001500Z')
    await user.click(card('무선 헤드폰').getByRole('button', { name: '더 고민하기' }))
    await user.click(card('무선 헤드폰').getByRole('button', { name: '3일 더' }))
    expect(params(googleLink()).get('dates')).toBe('20261017T000000Z/20261017T001500Z')
    await user.click(icsButton())
    const { fileName, text } = downloaded()
    expect(fileName).toBe('buyornot-2026-10-17.ics')
    expect(text).toContain('\r\nDTSTART:20261017T000000Z\r\n')
    expect(text).toContain('\r\nDTEND:20261017T001500Z\r\n')
  })

  it('AC59: 서버 주소가 없는 빌드에서도 캘린더 줄이 그대로 보인다 (AC61)', () => {
    vi.stubEnv('VITE_AI_SERVER_URL', '')
    setup(thing())
    expect(googleLink()).toBeInTheDocument()
    expect(icsButton()).toBeInTheDocument()
    expect(card('무선 헤드폰').getByText(NOTICE)).toBeInTheDocument()
  })

  it('서버 주소가 있는 빌드에서도 캘린더 줄은 같다', () => {
    vi.stubEnv('VITE_AI_SERVER_URL', 'https://ai.test')
    setup(thing())
    expect(googleLink()).toBeInTheDocument()
    expect(icsButton()).toBeInTheDocument()
    expect(card('무선 헤드폰').getByText(NOTICE)).toBeInTheDocument()
  })

  it('더 고민하기·메모를 여는 동안에는 캘린더 줄이 없고 닫으면 돌아온다', async () => {
    const user = setup(thing())
    await user.click(card('무선 헤드폰').getByRole('button', { name: '더 고민하기' }))
    expect(card('무선 헤드폰').queryByText(LABEL)).not.toBeInTheDocument()
    await user.click(card('무선 헤드폰').getByRole('button', { name: '취소' }))
    expect(card('무선 헤드폰').getByText(LABEL)).toBeInTheDocument()
  })
})
