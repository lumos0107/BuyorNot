import { NOTE_MAX, cleanAnswers, type Answers, type WishItem } from './wishlist'

// 담을 때 질문 6개 (F09)를 카드에서도 하나씩 묻는다 (PRD F22 고민 노트).
// 답은 담을 때 답과 같은 answers에 저장되어 재검토 카드(F09)와 사기 전 점검(F15)에 그대로 쓰인다.

export type QuestionKey = keyof Answers
export type ChoiceKey = Exclude<QuestionKey, 'problem'>

/** 중요한 순서 (F15의 "한 번 생각해 볼 질문"과 같은 순서) */
export const QUESTION_ORDER: readonly QuestionKey[] = ['problem', 'useInMonth', 'haveOne', 'saleDriven', 'spaceTime', 'alternative']

export const QUESTION_TEXT: Record<QuestionKey, string> = {
  problem: '없으면 어떤 문제가 있나요?',
  useInMonth: '한 달 뒤에도 쓸까요?',
  haveOne: '지금 쓰는 게 있나요?',
  saleDriven: '할인·한정 때문인가요?',
  spaceTime: '놓을 곳과 쓸 시간이 있나요?',
  alternative: '빌리거나 중고로 대신할 수 있나요?',
}

/** 선택형 질문의 답과 버튼 문구 (담기 폼과 같다) */
export const CHOICES = {
  useInMonth: [
    ['yes', '쓸 것 같아요'],
    ['no', '아닐 것 같아요'],
    ['unsure', '모르겠어요'],
  ],
  haveOne: [
    ['yes', '있어요'],
    ['no', '없어요'],
  ],
  saleDriven: [
    ['yes', '네'],
    ['no', '아니요'],
  ],
  spaceTime: [
    ['yes', '있어요'],
    ['no', '없어요'],
  ],
  alternative: [
    ['yes', '대신할 수 있어요'],
    ['no', '어려워요'],
  ],
} as const satisfies { [K in ChoiceKey]: readonly (readonly [NonNullable<Answers[K]>, string])[] }

/** 답했는지는 앞뒤 공백을 뺀 내용으로 본다. 공백뿐인 문제 설명(이전 기록)은 답하지 않은 것이다 */
export function hasAnswer(answers: Answers | undefined, key: QuestionKey): boolean {
  const value = answers?.[key]
  return typeof value === 'string' && value.trim().length > 0
}

/** 카드에서 물을 질문: 답하지 않은 것을 중요한 순서로. 이유에 할인 문구가 있어도 할인 질문을 묻는다(바로잡을 수 있게) */
export function cardQuestions(item: Pick<WishItem, 'answers'>): QuestionKey[] {
  return QUESTION_ORDER.filter((key) => !hasAnswer(item.answers, key))
}

/** 카드에서 답하거나, 값 없이 부르면 그 답을 지운다(다시 답하기). 정도 기록 등 다른 필드는 그대로 둔다 */
export function answerItem<K extends QuestionKey>(item: WishItem, key: K, value: Answers[K] | undefined, now: Date): WishItem {
  const answers: Answers = { ...item.answers }
  if (value === undefined) delete answers[key]
  else answers[key] = value
  const next: WishItem = { ...item, updatedAt: now.toISOString() }
  const cleaned = cleanAnswers(answers)
  if (cleaned) next.answers = cleaned
  else delete next.answers
  return next
}

/** "없으면 어떤 문제가 있나요?"의 카드 답: 앞뒤 공백을 뺀 1~200자 */
export function validateProblem(raw: string): { value?: string; error?: string } {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { error: '답을 적어 주세요' }
  if (trimmed.length > NOTE_MAX) return { error: `메모는 ${NOTE_MAX}자 이하로 적어 주세요` }
  return { value: trimmed }
}

/** 카드 체크리스트에 보일 답 (F27): 선택형은 버튼 문구, 문제 설명은 적은 글. 답하지 않았으면 null */
export function answerLabel(answers: Answers | undefined, key: QuestionKey): string | null {
  if (!answers || !hasAnswer(answers, key)) return null
  if (key === 'problem') return answers.problem!.trim()
  const value = answers[key]
  return (CHOICES[key] as readonly (readonly [string, string])[]).find(([choice]) => choice === value)?.[1] ?? null
}
