import { JumpNav, type JumpTarget } from './ui/JumpNav'
import { IconBag, IconCoins, IconHistory, IconTag, IconWallet } from './ui/NavIcons'
import { useEffect, useRef, useState } from 'react'
import { aiServerUrl } from './ai/config'
import evalSummaryJson from './ai/evalSummary.json'
import type { FormDraft } from './logic/draft'
import type { BundleRawInput } from './logic/bundle'
import type { PantryPurchase } from './logic/pantry'
import { EvalReport } from './screens/ai/EvalReport'
import { BackupSection } from './screens/BackupSection'
import { BillsSection } from './screens/BillsSection'
import { CompareScreen } from './screens/CompareScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { LedgerSection } from './screens/LedgerSection'
import { PaymentCalendarSection } from './screens/PaymentCalendarSection'
import { SavingsScreen } from './screens/SavingsScreen'
import { SpendingSection } from './screens/SpendingSection'
import { SubscriptionScreen } from './screens/SubscriptionScreen'
import { WishlistScreen } from './screens/WishlistScreen'
import { PantrySection } from './screens/PantrySection'
import { BeforeBuySection } from './screens/BeforeBuySection'
import { AfterBuySection } from './screens/AfterBuySection'
import { BenefitsSection } from './screens/BenefitsSection'
import { useSavings } from './store/useSavings'
import { useLedger } from './store/useLedger'
import { useBills } from './store/useBills'
import { useBenefits } from './store/useBenefits'
import { usePantry } from './store/usePantry'
import { useSpending } from './store/useSpending'
import { useSettings } from './store/useSettings'
import { useSubscriptions } from './store/useSubscriptions'
import { useWishlist, type StorageStatus } from './store/useWishlist'
import { Button } from './ui/Button'
import { BrandMark } from './ui/BrandMark'
import { ResetConfirm } from './ui/ResetConfirm'
import { TabPanel, Tabs, type TabItem } from './ui/Tabs'

type Screen = 'wishlist' | 'compare' | 'history' | 'subscriptions' | 'savings'

const SCREENS: readonly TabItem<Screen>[] = [
  { id: 'compare', label: '가격 비교', icon: <IconTag /> },
  { id: 'wishlist', label: '물건', icon: <IconBag /> },
  { id: 'history', label: '결정 기록', icon: <IconHistory /> },
  { id: 'subscriptions', label: '가계부', icon: <IconWallet /> },
  { id: 'savings', label: '모으기', icon: <IconCoins /> },
]

const LEDGER_JUMPS: readonly JumpTarget[] = [
  { label: '결제 달력', selector: '[aria-label="결제·지출 달력"]', open: true },
  { label: '수입·지출', selector: '[aria-label="이달 가계부 요약"]' },
  { label: '고정비 목록', selector: '#fixed-title' },
  { label: '공과금', selector: '#bills-section' },
  { label: '자잘한 지출', selector: 'details[aria-label="자잘한 지출"]', open: true },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('compare')
  const [startTarget, setStartTarget] = useState<{ kind: 'wish' | 'shopping' | 'fixed' } | null>(null)
  const [beforeBuyItemId, setBeforeBuyItemId] = useState<string | null>(null)
  const startAt = (kind: 'wish' | 'shopping' | 'fixed') => setStartTarget({ kind })
  useEffect(() => {
    if (!startTarget) return
    if (startTarget.kind === 'wish') {
      const entry = document.getElementById('wish-entry') as HTMLDetailsElement | null
      if (entry) entry.open = true
      document.getElementById('wish-entry-title')?.focus()
    } else if (startTarget.kind === 'shopping') {
      const pantry = document.getElementById('pantry-section') as HTMLDetailsElement | null
      const draft = document.getElementById('shopping-draft') as HTMLDetailsElement | null
      if (pantry) pantry.open = true
      if (draft) draft.open = true
      document.getElementById('shopping-draft-title')?.focus()
    } else {
      document.getElementById('fixed-title')?.focus()
    }
  }, [startTarget])
  const [jump, setJump] = useState<{ screen: 'subscriptions' | 'history' | 'savings'; id: string } | null>(null)
  const jumpTo = (target: 'subscriptions' | 'history' | 'savings', id: string) => { setJump({ screen: target, id }); setScreen(target) }
  // 가격 비교에서 고른 쪽(F21)이나 가격표 사진에서 읽은 값(F31)을 고민 목록의 담기 폼에 채운다
  const [draft, setDraft] = useState<FormDraft | null>(null)
  const [pantryDraft, setPantryDraft] = useState<{ form: BundleRawInput; token: number } | null>(null)
  const pantryDraftSeq = useRef(0)
  const wishlist = useWishlist()
  const settings = useSettings()
  const subscriptions = useSubscriptions()
  const savings = useSavings()
  const ledger = useLedger()
  const bills = useBills()
  const benefits = useBenefits()
  const pantry = usePantry()
  const spending = useSpending()
  // 손상된 기록을 초기화하면 배너가 사라지므로 바로 위의 사이트 제목으로 포커스를 옮긴다
  const brandRef = useRef<HTMLHeadingElement>(null)

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand-lockup">
          <BrandMark />
          <h1 className="brand" tabIndex={-1} ref={brandRef}>살까말까</h1>
        </div>
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

      <Tabs label="주요 메뉴" main tabs={SCREENS} value={screen} onChange={(next) => { setJump(null); setScreen(next); document.documentElement.scrollTop = 0 }} />

      <main>
        <TabPanel id="wishlist" hidden={screen !== 'wishlist'}>
          <nav className="start-actions" aria-label="지금 할 일">
            <Button onClick={() => startAt('wish')}>살까 고민 중</Button>
            <Button onClick={() => startAt('shopping')}>장보러 가요</Button>
            <Button onClick={() => { setScreen('subscriptions'); startAt('fixed') }}>고정비 살펴보기</Button>
          </nav>
          <WishlistScreen
            active={screen === 'wishlist'}
            items={wishlist.items}
            pantryItems={pantry.store.items}
            subscriptions={subscriptions.items}
            expiries={benefits.store.expiries}
            onJump={jumpTo}
            onBeforeBuy={setBeforeBuyItemId}
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
          <BeforeBuySection wishlist={wishlist} pantry={pantry.store} today={wishlist.now} focusItemId={beforeBuyItemId} onFocusDone={() => setBeforeBuyItemId(null)} />
          <PantrySection pantry={pantry} subscriptions={subscriptions.items} today={wishlist.now} onCompare={(purchase: PantryPurchase) => {
            setPantryDraft({ form: { price: String(purchase.amountKrw), unit: purchase.unit, size: purchase.unit === 'ea' ? '' : String(purchase.size), count: purchase.unit === 'ea' ? String(purchase.size) : '1' }, token: ++pantryDraftSeq.current })
            setScreen('compare')
          }} />
        </TabPanel>
        <TabPanel id="compare" hidden={screen !== 'compare'}>
          <CompareScreen
            key={pantryDraft?.token ?? 'default'}
            startWithExample
            pantryDraft={pantryDraft?.form}
            subscriptions={subscriptions.items}
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
          <AfterBuySection wishlist={wishlist} today={wishlist.now} focusItemId={screen === 'history' && jump?.screen === 'history' ? jump.id : undefined} onFocusDone={() => setJump(null)} />
        </TabPanel>
        <TabPanel id="subscriptions" hidden={screen !== 'subscriptions'}>
          <h2 className="screen-title"><span className="title-icon" aria-hidden="true"><IconWallet /></span>가계부</h2>
          <JumpNav label="가계부 안에서 이동" targets={LEDGER_JUMPS} />
          <PaymentCalendarSection subscriptions={subscriptions.items} expenses={ledger.store.entries} today={wishlist.now} />
          <LedgerSection ledger={ledger} bills={bills.store} spending={spending.store} today={wishlist.now} />
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
            focusId={screen === 'subscriptions' && jump?.screen === 'subscriptions' ? jump.id : undefined}
            onFocusDone={() => setJump(null)}
          />
          <BillsSection bills={bills} today={wishlist.now} />
          <SpendingSection spending={spending} today={wishlist.now} />
        </TabPanel>
        <TabPanel id="savings" hidden={screen !== 'savings'}>
          <SavingsScreen items={wishlist.items} subscriptions={subscriptions.items} savings={savings} pantry={pantry.store} spending={spending} benefits={benefits.store} today={wishlist.now} benefitsPanel={<BenefitsSection benefits={benefits} today={wishlist.now} focusExpiryId={screen === 'savings' && jump?.screen === 'savings' ? jump.id : undefined} onFocusDone={() => setJump(null)} />} />
        </TabPanel>
      </main>

      <BackupSection
        data={{ items: wishlist.items, hourlyWage: settings.hourlyWage, subscriptions: subscriptions.items, savings: savings.store, bills: bills.store, pantry: pantry.store, spending: spending.store, benefits: benefits.store, ledger: ledger.store }}
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
          if (data.benefits !== null && benefits.replaceAll(data.benefits).kind !== 'ok') failed.push('받을 수 있는 돈 기록')
          if (data.ledger !== null && ledger.replaceAll(data.ledger).kind !== 'ok') failed.push('가계부 기록')
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
