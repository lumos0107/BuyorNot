import { ledgerDemoEntries } from './logic/ledgerDemo'
import { JumpNav, type JumpTarget } from './ui/JumpNav'
import { IconBag, IconCoins, IconTag, IconWallet } from './ui/NavIcons'
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

// 주요 메뉴 네 개 (F86, 2026-11-02 제작자 요청 "탭은 4개로 가자", "3번은 가계부로 하자").
// id는 저장·테스트와 이어진 기존 값을 그대로 쓴다: 가계부 = subscriptions, 장보기 = compare
type Screen = 'subscriptions' | 'wishlist' | 'compare' | 'savings'
type WishView = 'wishing' | 'history'

const SCREENS: readonly TabItem<Screen>[] = [
  { id: 'subscriptions', label: '가계부', icon: <IconWallet /> },
  { id: 'wishlist', label: '물건', icon: <IconBag /> },
  { id: 'compare', label: '장보기', icon: <IconTag /> },
  { id: 'savings', label: '모으기', icon: <IconCoins /> },
]

const WISH_VIEWS: readonly TabItem<WishView>[] = [
  { id: 'wishing', label: '고민 중' },
  { id: 'history', label: '결정 기록' },
]

const LEDGER_JUMPS: readonly JumpTarget[] = [
  { label: '수입·지출', selector: '[aria-label="이달 가계부 요약"]' },
  { label: '달력', selector: '[aria-label="결제·지출 달력"]', open: true },
  { label: '내역', selector: '[aria-label="가계부 내역"]' },
  { label: '고정비·공과금', selector: '#fixed-group', open: true },
  { label: '자잘한 지출', selector: 'details[aria-label="자잘한 지출"]', open: true },
]

// 주소 끝 ?tab=photo는 장보기의 가격표 사진(예시)을 바로 연다(README의 시연 링크). 다른 값은 무시한다
const openPhoto = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'photo'

export default function App() {
  const [startPhoto] = useState(openPhoto)
  const [screen, setScreen] = useState<Screen>(() => (startPhoto ? 'compare' : 'subscriptions'))
  const [wishView, setWishView] = useState<WishView>('wishing')
  const [beforeBuyItemId, setBeforeBuyItemId] = useState<string | null>(null)
  // 가계부의 접힌 '고정비·공과금'. 고정비로 이동할 때는 카드에 포커스를 주기 전에 먼저 펼친다
  const fixedRef = useRef<HTMLDetailsElement>(null)
  const [jump, setJump] = useState<{ screen: 'subscriptions' | 'history' | 'savings'; id: string } | null>(null)
  const jumpTo = (target: 'subscriptions' | 'history' | 'savings', id: string) => {
    setJump({ screen: target, id })
    if (target === 'history') {
      setScreen('wishlist')
      setWishView('history')
      return
    }
    if (target === 'subscriptions' && fixedRef.current) fixedRef.current.open = true
    setScreen(target)
  }
  const goWishing = () => { setScreen('wishlist'); setWishView('wishing') }
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
  // 고정비·공과금 저장에 문제가 있으면 접힌 묶음을 펼쳐 저장 안내가 보이게 한다 (F86)
  const fixedTrouble = subscriptions.status.kind !== 'ok' || bills.status.kind !== 'ok'
  useEffect(() => { if (fixedTrouble && fixedRef.current) fixedRef.current.open = true }, [fixedTrouble])

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

      <Tabs label="주요 메뉴" main tabs={SCREENS} value={screen} onChange={(next) => { setJump(null); setScreen(next); if (next === 'wishlist') setWishView('wishing'); document.documentElement.scrollTop = 0 }} />

      <main>
        <TabPanel id="subscriptions" hidden={screen !== 'subscriptions'}>
          <h2 className="screen-title"><span className="title-icon" aria-hidden="true"><IconWallet /></span>가계부</h2>
          <JumpNav label="가계부 안에서 이동" targets={LEDGER_JUMPS} />
          <LedgerSection ledger={ledger} bills={bills.store} spending={spending.store} today={wishlist.now}
            calendar={<PaymentCalendarSection subscriptions={subscriptions.items} expenses={ledger.store.entries.length === 0 ? ledgerDemoEntries(wishlist.now) : ledger.store.entries} expenseDemo={ledger.store.entries.length === 0} today={wishlist.now} />} />
          <details className="card guide fixed-group" id="fixed-group" aria-label="고정비·공과금" ref={fixedRef}>
            <summary className="card-title">고정비·공과금</summary>
            <div className="stack">
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
            </div>
          </details>
          <SpendingSection spending={spending} today={wishlist.now} />
        </TabPanel>
        <TabPanel id="wishlist" hidden={screen !== 'wishlist'}>
          <Tabs label="물건 보기" tabs={WISH_VIEWS} value={wishView} onChange={(next) => { setJump(null); setWishView(next) }} sub />
          <TabPanel id="wishing" hidden={wishView !== 'wishing'}>
            <WishlistScreen
              active={screen === 'wishlist' && wishView === 'wishing'}
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
          </TabPanel>
          <TabPanel id="history" hidden={wishView !== 'history'}>
            <HistoryScreen
              items={wishlist.items}
              now={wishlist.now}
              hourlyWage={settings.hourlyWage}
              onWageChange={settings.setHourlyWage}
              onReview={wishlist.review}
              onReconsider={wishlist.reconsider}
              onRemove={wishlist.remove}
            />
            <AfterBuySection wishlist={wishlist} today={wishlist.now} focusItemId={screen === 'wishlist' && wishView === 'history' && jump?.screen === 'history' ? jump.id : undefined} onFocusDone={() => setJump(null)} />
          </TabPanel>
        </TabPanel>
        <TabPanel id="compare" hidden={screen !== 'compare'}>
          <CompareScreen
            key={pantryDraft?.token ?? 'default'}
            startWithExample
            initialKind={startPhoto && !pantryDraft ? 'photo' : undefined}
            pantryDraft={pantryDraft?.form}
            subscriptions={subscriptions.items}
            onGoToWishlist={goWishing}
            onAddToWishlist={(value) => {
              setDraft({ source: 'compare', value })
              goWishing()
            }}
            onAddPhotoDraft={(value) => {
              setDraft({ source: 'photo', value })
              goWishing()
            }}
          />
          <PantrySection pantry={pantry} subscriptions={subscriptions.items} today={wishlist.now} onCompare={(purchase: PantryPurchase) => {
            setPantryDraft({ form: { price: String(purchase.amountKrw), unit: purchase.unit, size: purchase.unit === 'ea' ? '' : String(purchase.size), count: purchase.unit === 'ea' ? String(purchase.size) : '1' }, token: ++pantryDraftSeq.current })
            setScreen('compare')
            document.documentElement.scrollTop = 0
          }} />
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
