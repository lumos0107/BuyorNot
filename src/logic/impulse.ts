import { formatFixed, josa } from './number'
import { describeSimilar, findSimilar } from './similar'
import { formatRemaining, reviewState, type Answers, type WishItem } from './wishlist'

// PRD F15 사기 전에 한 번 더: "구매함"을 누르면 내 기록에서 찾은 근거로 왜 충동구매일 수 있는지 보여준다.
// 단정하지 않고 근거만 나열하며, 결정은 사용자가 한다. 외부 데이터는 쓰지 않는다.
// 답하지 않은 질문은 걸리는 점으로 세지 않고 "한 번 생각해 볼 질문"으로 따로 보여준다(평가받는 느낌이 들지 않게).
export type ImpulseSignal = {
  kind: 'similar' | 'have-one' | 'wont-use' | 'sale' | 'space-time' | 'alternative' | 'early'
  /** 목록 키. 비슷한 기록은 기록마다 다르다 */
  key: string
  text: string
}

/** 사고 싶은 이유에 이런 말이 있으면 할인 때문에 사려는 것일 수 있다 */
const SALE_WORDS = ['세일', '할인', '특가', '한정', '마감', '쿠폰', '타임딜', '핫딜', '반값', '최저가', '1+1']

export function impulseSignals(item: WishItem, items: readonly WishItem[], now: Date): ImpulseSignal[] {
  const signals: ImpulseSignal[] = []
  const others = items.filter((other) => other.id !== item.id)
  for (const record of findSimilar(item.name, others, now)) {
    signals.push({ kind: 'similar', key: `similar-${record.item.id}`, text: `비슷한 기록: ${describeSimilar(record)}` })
  }
  const push = (kind: Exclude<ImpulseSignal['kind'], 'similar'>, text: string) => signals.push({ kind, key: kind, text })
  const answers = item.answers
  if (answers?.haveOne === 'yes') push('have-one', "담을 때 '지금 쓰는 게 있어요'라고 답했어요")
  if (answers?.useInMonth === 'no') push('wont-use', "'한 달 뒤에도 쓸까요?'에 '아닐 것 같아요'라고 답했어요")
  else if (answers?.useInMonth === 'unsure') push('wont-use', "'한 달 뒤에도 쓸까요?'에 '모르겠어요'라고 답했어요")
  // 할인: 직접 답했으면 그 답을 따르고(두 번 세지 않음), 답이 없을 때만 이유의 할인 문구를 본다
  const sale = saleWordIn(item.reason)
  if (answers?.saleDriven === 'yes') push('sale', "담을 때 '할인·한정 때문'이라고 답했어요. 할인이 없어도 살까요?")
  else if (answers?.saleDriven !== 'no' && sale) push('sale', `사고 싶은 이유에 '${sale}'${josa(sale, '이/가')} 있어요. 할인이 없어도 살까요?`)
  if (answers?.spaceTime === 'no') push('space-time', "담을 때 '놓을 곳이나 쓸 시간이 없어요'라고 답했어요")
  if (answers?.alternative === 'yes') push('alternative', "담을 때 '빌리거나 중고로 대신할 수 있어요'라고 답했어요")
  const state = reviewState(item.reviewAt, now)
  if (state.phase === 'cooling') push('early', `고민 기간이 ${formatRemaining(state.remainingMs).replace(/ 남음$/, '')} 남았어요`)
  return signals
}

function saleWordIn(reason: string): string | undefined {
  return SALE_WORDS.find((word) => reason.includes(word))
}

/** 담을 때 질문 (중요한 순서) */
const QUESTIONS: [keyof Answers, string][] = [
  ['problem', '없으면 어떤 문제가 있나요?'],
  ['useInMonth', '한 달 뒤에도 쓸까요?'],
  ['haveOne', '지금 쓰는 게 있나요?'],
  ['saleDriven', '할인·한정 때문인가요?'],
  ['spaceTime', '놓을 곳과 쓸 시간이 있나요?'],
  ['alternative', '빌리거나 중고로 대신할 수 있나요?'],
]

/** 답하지 않은 질문 (중요한 순서). 이유의 할인 문구가 이미 걸리는 점이면 할인 질문은 뺀다 */
export function unansweredQuestions(item: WishItem): string[] {
  const answers = item.answers ?? {}
  const saleCovered = !answers.saleDriven && saleWordIn(item.reason) !== undefined
  return QUESTIONS.filter(([key]) => !answers[key] && !(key === 'saleDriven' && saleCovered)).map(([, text]) => text)
}

/** 금액 ÷ 시급 (소수 첫째 자리). 시급이 없으면 null */
export function priceInHours(priceKrw: number, hourlyWage: number | null): string | null {
  return hourlyWage ? formatFixed(priceKrw / hourlyWage, 1) : null
}
