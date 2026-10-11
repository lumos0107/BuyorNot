import { formatFixed, josa } from './number'
import { QUESTION_ORDER, QUESTION_TEXT, hasAnswer } from './questions'
import { userWrittenReason } from './draft'
import { describeSimilar, findSimilar } from './similar'
import { describeAnswers, formatRemaining, reviewState, type Answers, type WishItem } from './wishlist'

// PRD F15 사기 전에 한 번 더: "구매함"을 누르면 내 기록에서 찾은 근거로 왜 충동구매일 수 있는지 보여준다.
// 단정하지 않고 근거만 나열하며, 결정은 사용자가 한다. 외부 데이터는 쓰지 않는다.
// 답하지 않은 질문은 걸리는 점으로 세지 않고 "한 번 생각해 볼 질문"으로 따로 보여준다(평가받는 느낌이 들지 않게).
// 답은 카드에서도 할 수 있으므로(F22) 문장에 "담을 때"를 붙이지 않는다.
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
  if (answers?.haveOne === 'yes') push('have-one', "'지금 쓰는 게 있어요'라고 답했어요")
  if (answers?.useInMonth === 'no') push('wont-use', "'한 달 뒤에도 쓸까요?'에 '아닐 것 같아요'라고 답했어요")
  else if (answers?.useInMonth === 'unsure') push('wont-use', "'한 달 뒤에도 쓸까요?'에 '모르겠어요'라고 답했어요")
  // 할인: 직접 답했으면 그 답을 따르고(두 번 세지 않음), 답이 없을 때만 이유의 할인 문구를 본다
  const sale = saleWordIn(item.reason)
  if (answers?.saleDriven === 'yes') push('sale', "'할인·한정 때문'이라고 답했어요. 할인이 없어도 살까요?")
  else if (answers?.saleDriven !== 'no' && sale) push('sale', `사고 싶은 이유에 '${sale}'${josa(sale, '이/가')} 있어요. 할인이 없어도 살까요?`)
  if (answers?.spaceTime === 'no') push('space-time', "'놓을 곳이나 쓸 시간이 없어요'라고 답했어요")
  if (answers?.alternative === 'yes') push('alternative', "'빌리거나 중고로 대신할 수 있어요'라고 답했어요")
  const state = reviewState(item.reviewAt, now)
  if (state.phase === 'cooling') push('early', `고민 기간이 ${formatRemaining(state.remainingMs).replace(/ 남음$/, '')} 남았어요`)
  return signals
}

// 할인 문구는 사용자가 쓴 부분에서만 찾는다. 가격 비교에서 가져온 문장의 "할인 8,000원"·"쿠폰 적용 불가"는 빼고 본다 (F23)
function saleWordIn(reason: string): string | undefined {
  const own = userWrittenReason(reason)
  return SALE_WORDS.find((word) => own.includes(word))
}

/** 답하지 않은 질문 (중요한 순서). 이유의 할인 문구가 이미 걸리는 점이면 할인 질문은 뺀다 */
export function unansweredQuestions(item: WishItem): string[] {
  const saleCovered = !hasAnswer(item.answers, 'saleDriven') && saleWordIn(item.reason) !== undefined
  return QUESTION_ORDER.filter((key) => !hasAnswer(item.answers, key) && !(key === 'saleDriven' && saleCovered)).map((key) => QUESTION_TEXT[key])
}

/** 걸리는 점이 아닌 답이면 true (F22 "그 밖에 답한 것") */
const CALM: { [K in keyof Answers]-?: (value: NonNullable<Answers[K]>) => boolean } = {
  problem: () => true,
  useInMonth: (v) => v === 'yes',
  haveOne: (v) => v === 'no',
  saleDriven: (v) => v === 'no',
  spaceTime: (v) => v === 'yes',
  alternative: (v) => v === 'no',
}

/** 그 밖에 답한 것 (F22): 걸리는 점이 되지 않은 답을 질문의 중요한 순서로, 답 목록과 같은 문장으로. 필요하다고 판정하지 않는다 */
export function otherAnswers(item: WishItem): string[] {
  const answers = item.answers ?? {}
  return QUESTION_ORDER.flatMap((key) => {
    if (!hasAnswer(answers, key)) return []
    const value = answers[key] as never
    if (!CALM[key](value)) return []
    return describeAnswers({ [key]: value })
  })
}

/** 금액 ÷ 시급 (소수 첫째 자리). 시급이 없으면 null */
export function priceInHours(priceKrw: number, hourlyWage: number | null): string | null {
  return hourlyWage ? formatFixed(priceKrw / hourlyWage, 1) : null
}
