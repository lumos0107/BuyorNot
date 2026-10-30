import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { FeatureSummary } from './ai/evalSummary.ts'

// PRD F43 AI 성적표 (AC63): "기록 백업·복원" 아래 접이식 카드. 서버 주소가 있을 때만 보이고,
// 커밋한 요약 파일(src/ai/evalSummary.json)만 읽는다. 요약 파일은 처음엔 비어 있어 이 테스트는 가짜 요약으로 바꿔 끼운다.
// 계획 Task 1의 테스트 이름은 해당 it 위 `// plan:` 주석에 있다.

const shared = vi.hoisted(() => ({ summary: { model: '', features: [] } as unknown }))

// App이 그릴 때마다 읽는 JSON 가져오기를 테스트마다 다른 요약으로 돌려준다
vi.mock('./ai/evalSummary.json', () => ({
  get default() {
    return shared.summary
  },
}))

const SERVER = 'https://ai.example.test'

// AC63 입력: 모델 gemini-3.5-flash-lite, 가격표 사진 읽기 40장·평가일 2026-11-02·판 1a2b3c4d,
// 값이 있는 칸 255칸 중 맞음 236·틀림 12·못 읽음 7, 표기 없는 칸 44칸 중 채움 3, 더 읽음 2,
// 제한·꺼짐 2번, 요청 38번 중 실패 1번, 응답 시간 37번 중앙값 4,100ms·최대 9,800ms, 틀린 예 24개.
// 가정: 앞 5개 틀린 예의 사례 id·칸·값은 AC63에 없어 정했다(evalSummary.test.ts와 같은 값).
const READ_TAG: FeatureSummary = {
  id: 'read-tag',
  evaluatedAt: '2026-11-02',
  promptVersion: '1a2b3c4d',
  samples: 40,
  excluded: 2,
  requests: { total: 38, failed: 1 },
  valued: { correct: 236, wrong: 12, missed: 7 },
  blank: { total: 44, filled: 3 },
  extra: 2,
  latencyMs: { median: 4100, max: 9800, n: 37 },
  failures: [
    { caseId: 'rt03', field: '상품1 가격', expected: '4550', got: '4500' },
    { caseId: 'rt05', field: '상품2 개수', expected: '6', got: null },
    { caseId: 'rt06', field: '상품1 가격 조건', expected: null, got: '회원가' },
    { caseId: 'rt08', field: null, expected: null, got: '프리미엄 두유' },
    { caseId: 'rt09', field: '상품3 단위', expected: 'g', got: 'mL' },
  ],
  failureTotal: 24,
}

const LOWEST_PRICE: FeatureSummary = {
  id: 'lowest-price',
  evaluatedAt: '2026-11-03',
  promptVersion: '0f9e8d7c',
  samples: 6,
  excluded: 0,
  requests: { total: 6, failed: 0 },
  valued: { correct: 3, wrong: 1, missed: 0 },
  blank: { total: 2, filled: 0 },
  extra: null,
  latencyMs: { median: 5200, max: 7000, n: 6 },
  failures: [{ caseId: 'dn14', field: '고른 줄', expected: '1', got: '4' }],
  failureTotal: 1,
}

function setSummary(summary: unknown) {
  shared.summary = summary
}

beforeEach(() => {
  localStorage.clear()
  vi.stubEnv('VITE_AI_SERVER_URL', SERVER)
  setSummary({ model: 'gemini-3.5-flash-lite', features: [READ_TAG] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

function reportCard(): HTMLElement {
  const card = screen.getByText('AI 성적표').closest('details')
  if (card === null) throw new Error('AI 성적표 카드를 찾지 못했어요')
  return card
}

describe('AI 성적표 카드 (F43)', () => {
  // plan: shows the report below backup with a server url
  it('AC63: 서버 주소가 있으면 기록 백업·복원 아래에 접힌 AI 성적표가 보여요', async () => {
    const user = userEvent.setup()
    render(<App />)

    const backup = screen.getByText('기록 백업·복원')
    const title = screen.getByText('AI 성적표')
    expect(backup.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 접이식: 처음엔 접혀 있고 제목을 누르면 펼쳐진다
    expect(reportCard()).not.toHaveAttribute('open')
    await user.click(title)
    expect(reportCard()).toHaveAttribute('open')
    expect(within(reportCard()).getByText('모델 gemini-3.5-flash-lite')).toBeVisible()
  })

  it('AC63: 펼치면 PRD 문장 그대로 맨 위 안내와 가격표 사진 읽기 묶음이 보여요', async () => {
    const user = userEvent.setup()
    render(<App />)
    await user.click(screen.getByText('AI 성적표'))
    const card = within(reportCard())

    expect(card.getByText('모델 gemini-3.5-flash-lite')).toBeVisible()
    expect(card.getByText('직접 모은 작은 자료로 잰 결과라 일반적인 정확도를 뜻하지 않아요.')).toBeVisible()
    for (const text of [
      '가격표 사진 읽기 · 40장 · 평가일 2026-11-02 · 프롬프트 판 1a2b3c4d',
      '값이 있는 칸 맞힘 236 / 255칸 (틀림 12 · 못 읽음 7)',
      '표기 없는 칸을 채움 3 / 44칸',
      '정답에 없는 상품을 더 읽음 2개',
      '요청 38번 중 실패 1번(시간 초과·서버 오류). 실패한 요청의 값이 있는 칸은 못 읽음으로 셌어요.',
      '제한·꺼짐으로 받지 못한 요청 2번(정확도에서 뺐어요)',
      '응답 시간 중앙값 4.1초 · 최대 9.8초 (37번)',
      '틀린 예 24개 중 앞 5개(자료 순서)',
      "rt03 상품1 가격: 정답 '4550' → AI '4500'",
      "rt05 상품2 개수: 정답 '6' → AI 빈칸",
      "rt06 상품1 가격 조건: 정답 표기 없음 → AI '회원가'",
      "rt08: 정답에 없음 → AI '프리미엄 두유'",
      "rt09 상품3 단위: 정답 'g' → AI 'mL'",
    ]) {
      expect(card.getByText(text), text).toBeVisible()
    }
    // 틀린 예는 5줄이다
    expect(card.getAllByRole('listitem')).toHaveLength(5)
  })

  it('AC63: 표기 없는 칸 0칸, 틀린 예 0개, 실패 0번, 응답 시간 0번이면 각각의 문장으로 바뀌어요', async () => {
    const user = userEvent.setup()
    setSummary({
      model: 'gemini-3.5-flash-lite',
      features: [
        {
          ...READ_TAG,
          excluded: 0,
          requests: { total: 40, failed: 0 },
          valued: { correct: 255, wrong: 0, missed: 0 },
          blank: { total: 0, filled: 0 },
          extra: 0,
          latencyMs: { median: 0, max: 0, n: 0 },
          failures: [],
          failureTotal: 0,
        },
      ],
    })
    render(<App />)
    await user.click(screen.getByText('AI 성적표'))
    const card = within(reportCard())

    expect(card.getByText('표기 없는 칸이 없는 자료라 재지 않았어요.')).toBeVisible()
    expect(card.getByText('틀린 예가 없어요.')).toBeVisible()
    expect(card.getByText('요청 40번 모두 응답을 받았어요.')).toBeVisible()
    expect(card.getByText('응답 시간을 재지 못했어요.')).toBeVisible()
    expect(card.queryByText(/제한·꺼짐/)).toBeNull()
    expect(card.queryByRole('listitem')).toBeNull()
  })

  // plan: hides it without a server url
  it('AC63: 서버 주소가 없는 빌드에는 AI 성적표가 없어요', () => {
    vi.stubEnv('VITE_AI_SERVER_URL', '')
    render(<App />)
    expect(screen.queryByText('AI 성적표')).toBeNull()
    // 기록 백업·복원은 그대로 있다
    expect(screen.getByText('기록 백업·복원')).toBeInTheDocument()
  })

  // plan: hides a feature missing from the summary
  it('AC63: 요약 파일에 말로 담기가 없으면 그 묶음은 보이지 않고 있는 기능만 순서대로 보여요', async () => {
    const user = userEvent.setup()
    setSummary({ model: 'gemini-3.5-flash-lite', features: [READ_TAG, LOWEST_PRICE] })
    render(<App />)
    await user.click(screen.getByText('AI 성적표'))
    const card = within(reportCard())

    // 서버 주소가 있으면 담기 폼에 '말로 담기' 버튼이 있으므로 성적표 카드 안에서만 찾는다
    expect(card.queryByText(/말로 담기/)).toBeNull()
    expect(card.queryByText(/치수 읽기/)).toBeNull()
    const titles = card.getAllByText(/ · 평가일 /).map((el) => el.textContent)
    expect(titles).toEqual([
      '가격표 사진 읽기 · 40장 · 평가일 2026-11-02 · 프롬프트 판 1a2b3c4d',
      '다나와 같은 상품 고르기 · 6개 · 평가일 2026-11-03 · 프롬프트 판 0f9e8d7c',
    ])
    // 다나와는 더 읽음 줄이 없다
    expect(card.getAllByText(/더 읽음/)).toHaveLength(1)
  })

  // plan: hides the card when the summary file does not match the shape
  it('요약 파일의 모양이 맞지 않으면 카드를 보이지 않아요', () => {
    for (const broken of [
      { model: 'gemini-3.5-flash-lite', features: [{ ...READ_TAG, requests: { total: 39, failed: 1 } }] },
      { model: 'gemini-3.5-flash-lite', features: [{ ...READ_TAG, samples: '40' }] },
      { model: 'gemini-3.5-flash-lite', features: [{ id: 'read-tag' }] },
      { features: [READ_TAG] },
      null,
    ]) {
      setSummary(broken)
      const { unmount } = render(<App />)
      expect(screen.queryByText('AI 성적표')).toBeNull()
      unmount()
    }
  })

  // plan: hides the card when the summary has no features
  it('요약에 기능이 하나도 없으면(처음 값) 카드를 보이지 않아요', () => {
    for (const empty of [{ model: '', features: [] }, { model: 'gemini-3.5-flash-lite', features: [] }]) {
      setSummary(empty)
      const { unmount } = render(<App />)
      expect(screen.queryByText('AI 성적표')).toBeNull()
      unmount()
    }
  })

  it('읽은 글은 HTML이 아니라 글자로만 보여요', async () => {
    const user = userEvent.setup()
    const html = '<img src="x" alt="주입"><b>굵게</b>'
    setSummary({
      model: 'gemini-3.5-flash-lite',
      features: [
        {
          ...LOWEST_PRICE,
          failures: [{ caseId: 'dn14', field: '고른 줄', expected: '1', got: html }],
        },
      ],
    })
    render(<App />)
    await user.click(screen.getByText('AI 성적표'))
    const card = within(reportCard())

    expect(card.getByText(`dn14 고른 줄: 정답 '1' → AI '${html}'`)).toBeVisible()
    expect(card.queryByAltText('주입')).toBeNull()
    expect(card.queryByText('굵게')).toBeNull()
  })
})
