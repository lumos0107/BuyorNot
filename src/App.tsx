import { useRef, useState } from 'react'
import { aiServerUrl } from './ai/config'
import evalSummaryJson from './ai/evalSummary.json'
import type { FormDraft } from './logic/draft'
import { EvalReport } from './screens/ai/EvalReport'
import { BackupSection } from './screens/BackupSection'
import { BillsSection } from './screens/BillsSection'
import { CompareScreen } from './screens/CompareScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { SavingsScreen } from './screens/SavingsScreen'
import { SubscriptionScreen } from './screens/SubscriptionScreen'
import { WishlistScreen } from './screens/WishlistScreen'
import { useSavings } from './store/useSavings'
import { useBills } from './store/useBills'
import { usePantry } from './store/usePantry'
import { useSpending } from './store/useSpending'
import { useSettings } from './store/useSettings'
import { useSubscriptions } from './store/useSubscriptions'
import { useWishlist, type StorageStatus } from './store/useWishlist'
import { Button } from './ui/Button'
import { ResetConfirm } from './ui/ResetConfirm'
import { TabPanel, Tabs, type TabItem } from './ui/Tabs'

type Screen = 'wishlist' | 'compare' | 'history' | 'subscriptions' | 'savings'

const SCREENS: readonly TabItem<Screen>[] = [
  { id: 'wishlist', label: '물건' },
  { id: 'compare', label: '가격 비교' },
  { id: 'history', label: '결정 기록' },
  { id: 'subscriptions', label: '고정비' },
  { id: 'savings', label: '모으기' },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('wishlist')
  // 가격 비교에서 고른 쪽(F21)이나 가격표 사진에서 읽은 값(F31)을 고민 목록의 담기 폼에 채운다
  const [draft, setDraft] = useState<FormDraft | null>(null)
  const wishlist = useWishlist()
  const settings = useSettings()
  const subscriptions = useSubscriptions()
  const savings = useSavings()
  const bills = useBills()
  const pantry = usePantry()
  const spending = useSpending()
  // 손상된 기록을 초기화하면 배너가 사라지므로 바로 위의 사이트 제목으로 포커스를 옮긴다
  const brandRef = useRef<HTMLHeadingElement>(null)

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand" tabIndex={-1} ref={brandRef}>
          살까말까
        </h1>
        <span className="brand-sub">살지 말지, 산다면 얼마에</span>
      </header>

      <StorageBanner
        status={wishlist.status}
        onRetry={wishlist.retrySave}
        onReset={() => {
          wishlist.resetStorage()
          brandRef.current?.focus()
        }}
        onDismiss={() => {
          wishlist.dismissNotice()
          brandRef.current?.focus()
        }}
      />

      <Tabs label="주요 메뉴" tabs={SCREENS} value={screen} onChange={setScreen} />

      <main>
        <TabPanel id="wishlist" hidden={screen !== 'wishlist'}>
          <WishlistScreen
            active={screen === 'wishlist'}
            items={wishlist.items}
            now={wishlist.now}
            onAdd={wishlist.add}
            onEdit={wishlist.edit}
            onDecide={wishlist.decide}
            onExtend={wishlist.extend}
            onRemove={wishlist.remove}
            onAddDemo={wishlist.addDemo}
            onRemoveExamples={wishlist.removeExamples}
            onReconsider={wishlist.reconsider}
            onCheckDesire={wishlist.checkDesire}
            onAnswer={wishlist.answer}
            onSetFit={wishlist.setFit}
            hourlyWage={settings.hourlyWage}
            draft={draft}
            onDraftUsed={() => setDraft(null)}
          />
        </TabPanel>
        <TabPanel id="compare" hidden={screen !== 'compare'}>
          <CompareScreen
            startWithExample
            onGoToWishlist={() => setScreen('wishlist')}
            onAddToWishlist={(value) => {
              setDraft({ source: 'compare', value })
              setScreen('wishlist')
            }}
            onAddPhotoDraft={(value) => {
              setDraft({ source: 'photo', value })
              setScreen('wishlist')
            }}
          />
        </TabPanel>
        <TabPanel id="history" hidden={screen !== 'history'}>
          <HistoryScreen
            items={wishlist.items}
            now={wishlist.now}
            hourlyWage={settings.hourlyWage}
            onWageChange={settings.setHourlyWage}
            onReview={wishlist.review}
            onReconsider={wishlist.reconsider}
            onRemove={wishlist.remove}
          />
        </TabPanel>
        <TabPanel id="subscriptions" hidden={screen !== 'subscriptions'}>
          <SubscriptionScreen
            items={subscriptions.items}
            today={wishlist.now}
            status={subscriptions.status}
            onAdd={subscriptions.add}
            onEdit={subscriptions.edit}
            onRemove={subscriptions.remove}
            onCancel={subscriptions.cancel}
            onResume={subscriptions.resume}
            onAddDemo={subscriptions.addDemo}
            onRemoveExamples={subscriptions.removeExamples}
            onToggleUse={subscriptions.toggleUse}
            onSetUsage={subscriptions.setUsage}
            onImportUsage={subscriptions.importUsage}
            onRetry={subscriptions.retrySave}
            onReset={subscriptions.resetStorage}
            onDismiss={subscriptions.dismissNotice}
          />
          <BillsSection bills={bills} today={wishlist.now} />
        </TabPanel>
        <TabPanel id="savings" hidden={screen !== 'savings'}>
          <SavingsScreen items={wishlist.items} subscriptions={subscriptions.items} savings={savings} today={wishlist.now} />
        </TabPanel>
      </main>

      <BackupSection
        data={{ items: wishlist.items, hourlyWage: settings.hourlyWage, subscriptions: subscriptions.items, savings: savings.store, bills: bills.store, pantry: pantry.store, spending: spending.store }}
        onImport={(data) => {
          // 저장하지 못한 부분의 이름을 돌려준다. 물건 기록·구독은 각 화면의 저장 안내에서 다시 저장할 수 있다
          const failed: string[] = []
          if (wishlist.replaceAll(data.items).kind !== 'ok') failed.push('물건 기록')
          if (!settings.setHourlyWage(data.hourlyWage)) failed.push('시급')
          if (subscriptions.replaceAll(data.subscriptions).kind !== 'ok') failed.push('구독')
          if (data.savings !== null && savings.replaceAll(data.savings).kind !== 'ok') failed.push('모으기 기록')
          if (data.bills !== null && bills.replaceAll(data.bills).kind !== 'ok') failed.push('공과금 기록')
          if (data.pantry !== null && pantry.replaceAll(data.pantry).kind !== 'ok') failed.push('집에 있는 것 기록')
          if (data.spending !== null && spending.replaceAll(data.spending).kind !== 'ok') failed.push('자잘한 지출 기록')
          return failed
        }}
      />
      {aiServerUrl() ? <EvalReport summary={evalSummaryJson} /> : null}

      <footer className="app-footer">
        기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 다른 기기에서 열면 보이지 않아요.
      </footer>
    </div>
  )
}

// 저장 상태 안내 (PRD F06, AC13): 실패를 성공처럼 보이지 않게 하고, 손상된 기록은 확인을 거쳐 초기화한다
function StorageBanner({
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
    <div className="banner stack" role="status" aria-label="저장 상태">
      {status.kind === 'unavailable' ? (
        <p>이 브라우저에서는 기록을 저장할 수 없어요. 이번 방문 동안만 유지되고, 새로고침하면 사라져요.</p>
      ) : null}
      {status.kind === 'save-failed' ? (
        <>
          <p>
            저장하지 못했어요.{' '}
            {status.reason === 'quota' ? '브라우저 저장 공간을 확인한 뒤 다시 저장해 주세요.' : '브라우저 설정을 확인한 뒤 다시 저장해 주세요.'}
          </p>
          <div className="btn-row">
            <Button onClick={onRetry}>다시 저장</Button>
          </div>
        </>
      ) : null}
      {status.kind === 'replaced' ? (
        <>
          <p>다른 탭에서 저장한 기록을 불러왔어요. 이 탭에서 저장하지 않은 변경은 반영되지 않았어요.</p>
          <div className="btn-row">
            <Button onClick={onDismiss}>확인</Button>
          </div>
        </>
      ) : null}
      {status.kind === 'corrupt' ? (
        <>
          <p>저장된 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 담는 물건이 저장되지 않아요.</p>
          <ResetConfirm label="기록 초기화" note="초기화하면 읽을 수 없는 기록은 사라지고, 지금 화면의 물건만 저장돼요." onReset={onReset} />
        </>
      ) : null}
    </div>
  )
}
