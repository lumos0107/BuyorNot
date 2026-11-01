import { formatWon } from './number'
import { kindOf, monthlyEquivalent, type FixedCostKind, type Subscription } from './subscriptions'

// PRD F45 고정비 정리함: 종류 이름, 요약의 종류별 줄, 화면 문장

/** 종류 이름. 카드와 고르기에 쓴다 */
export const KIND_LABEL: Record<FixedCostKind, string> = {
  subscription: '구독',
  membership: '멤버십',
  delivery: '정기배송',
  phone: '통신',
  housing: '월세·관리비',
  insurance: '보험',
  other: '기타',
}

// 요약의 종류별 줄 묶음 (F45): 구독과 멤버십은 한 묶음이다. 이 순서로 보인다
const TOTAL_GROUPS: readonly { label: string; kinds: readonly FixedCostKind[] }[] = [
  { label: '구독·멤버십', kinds: ['subscription', 'membership'] },
  { label: '정기배송', kinds: ['delivery'] },
  { label: '통신', kinds: ['phone'] },
  { label: '월세·관리비', kinds: ['housing'] },
  { label: '보험', kinds: ['insurance'] },
  { label: '기타', kinds: ['other'] },
]

/**
 * 요약의 종류별 줄: "구독·멤버십 23,500원 · 통신 55,000원 · 월세·관리비 450,000원".
 * 금액은 카드에 보이는 월평균(monthlyEquivalent)의 합이다. 묶음이 둘 이상일 때만 만든다(하나면 첫 줄과 같은 금액).
 * 어떤 고정비를 넣을지는 부르는 쪽이 정한다(체험 중·해지한 것을 빼는 것은 F46·F47)
 */
export function kindTotalsLine(subs: readonly Subscription[], _today: Date): string | null {
  const parts = TOTAL_GROUPS.flatMap(({ label, kinds }) => {
    const group = subs.filter((s) => kinds.includes(kindOf(s)))
    if (group.length === 0) return []
    return [`${label} ${formatWon(group.reduce((sum, s) => sum + monthlyEquivalent(s), 0))}`]
  })
  return parts.length >= 2 ? parts.join(' · ') : null
}

// 화면 문장 (PRD F45 이름 바꿈 표 '후')
export const FIXED_TITLE = '고정비'
export const ADD_FORM = '고정비 담기'
export const ADD_BUTTON = '고정비 추가'
export const EDIT_FORM = '고정비 수정'
export const NAME_LABEL = '이름'
export const NAME_PLACEHOLDER = '예: 넷플릭스, 배민클럽, 휴대폰 요금'
export const EMPTY_TITLE = '아직 등록한 고정비가 없어요.'
export const EMPTY_NOTE = '구독·멤버십·통신·월세처럼 매월·매년 나가는 돈을 적어 두면 다음 결제일과 합계를 확인할 수 있어요.'
export const STALE_NOTICE = '다른 탭에서 이 고정비가 바뀌었어요. 취소한 뒤 다시 열어 고쳐 주세요.'
