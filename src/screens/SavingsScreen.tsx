import { useRef } from 'react'
import {
  NOTE_MOVED,
  NOTE_REDUCED,
  NOTE_SEPARATE,
  NOTE_SKIPPED,
  SAVINGS_EMPTY,
  isSavingsEmpty,
  movedLabel,
  reducedLabel,
  savingsNumbers,
  skippedLabel,
} from '../logic/savings'
import { formatWon } from '../logic/number'
import type { Subscription } from '../logic/subscriptions'
import type { WishItem } from '../logic/wishlist'
import type { useSavings } from '../store/useSavings'
import type { StorageStatus } from '../store/useWishlist'
import { Button } from '../ui/Button'
import { ResetConfirm } from '../ui/ResetConfirm'

// PRD F48 모으기: 줄어든 고정비·참은 구매·옮긴 돈을 따로 보이고 더하지 않는다. 저축 목표와 옮긴 돈 적기는 뒤 작업에서 더한다.
type Props = {
  items: readonly WishItem[]
  subscriptions: readonly Subscription[]
  savings: ReturnType<typeof useSavings>
  today: Date
}

export function SavingsScreen({ items, subscriptions, savings }: Props) {
  // 저장 안내가 사라지면 포커스를 화면 제목으로 옮긴다
  const headingRef = useRef<HTMLHeadingElement>(null)
  const n = savingsNumbers(items, subscriptions, savings.store)

  return (
    <div className="stack">
      <h2 className="screen-title" tabIndex={-1} ref={headingRef}>
        모으기
      </h2>
      <SavingsBanner
        status={savings.status}
        onRetry={savings.retrySave}
        onReset={() => {
          savings.resetStorage()
          headingRef.current?.focus()
        }}
        onDismiss={() => {
          savings.dismissNotice()
          headingRef.current?.focus()
        }}
      />
      {isSavingsEmpty(n) ? (
        <p>{SAVINGS_EMPTY}</p>
      ) : (
        <section className="card stack" aria-label="모으기 요약">
          <div className="card-row">
            <p className="card-title">지금까지</p>
            <span className="note">전체 기록 기준{n.includesExample ? ' · 예시 포함' : ''}</span>
          </div>
          <ul className="result-list">
            <li>
              <span>{reducedLabel(n)}</span>
              <span className="price">{`월 ${formatWon(n.reducedMonthly)}`}</span>
            </li>
            <li>
              <span>{skippedLabel(n)}</span>
              <span className="price">{formatWon(n.skippedTotal)}</span>
            </li>
            <li>
              <span>{movedLabel(n)}</span>
              <span className="price">{formatWon(n.movedTotal)}</span>
            </li>
          </ul>
          <p className="note">{NOTE_REDUCED}</p>
          <p className="note">{NOTE_SKIPPED}</p>
          <p className="note">{NOTE_MOVED}</p>
          <p className="note">{NOTE_SEPARATE}</p>
        </section>
      )}
    </div>
  )
}

// 저장 안내: 고정비 화면의 SubsBanner와 같은 모양, 문장은 PRD F48 '저장'
function SavingsBanner({
  status,
  onRetry,
  onReset,
  onDismiss,
}: {
  status: StorageStatus
  onRetry: () => void
  onReset: () => void
  onDismiss: () => void
}) {
  if (status.kind === 'ok') return null
  return (
    <div className="banner stack" role="status" aria-label="모으기 저장 상태">
      {status.kind === 'unavailable' ? <p>이 브라우저에서는 모으기 기록을 저장할 수 없어요. 새로고침하면 사라져요.</p> : null}
      {status.kind === 'save-failed' ? (
        <>
          <p>모으기 기록을 저장하지 못했어요. 브라우저 저장 공간이나 설정을 확인한 뒤 다시 저장해 주세요.</p>
          <div className="btn-row">
            <Button onClick={onRetry}>다시 저장</Button>
          </div>
        </>
      ) : null}
      {status.kind === 'replaced' ? (
        <>
          <p>다른 탭에서 저장한 모으기 기록을 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.</p>
          <div className="btn-row">
            <Button onClick={onDismiss}>확인</Button>
          </div>
        </>
      ) : null}
      {status.kind === 'corrupt' ? (
        <>
          <p>저장된 모으기 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 적은 기록이 저장되지 않아요.</p>
          <ResetConfirm
            label="모으기 기록 초기화"
            note="초기화하면 읽을 수 없는 모으기 기록은 사라지고, 지금 화면의 기록만 저장돼요."
            onReset={onReset}
          />
        </>
      ) : null}
    </div>
  )
}
