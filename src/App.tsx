import { useState } from 'react'
import { CompareScreen } from './screens/CompareScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { WishlistScreen } from './screens/WishlistScreen'
import { useWishlist, type StorageStatus } from './store/useWishlist'
import { Button } from './ui/Button'
import { TabPanel, Tabs, type TabItem } from './ui/Tabs'

type Screen = 'wishlist' | 'compare' | 'history'

const SCREENS: readonly TabItem<Screen>[] = [
  { id: 'wishlist', label: '고민 중인 물건' },
  { id: 'compare', label: '가격 비교' },
  { id: 'history', label: '결정 기록' },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('wishlist')
  const wishlist = useWishlist()

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand">살까말까</h1>
        <span className="brand-sub">살지 말지, 산다면 얼마에</span>
      </header>

      <StorageBanner status={wishlist.status} onRetry={wishlist.retrySave} onReset={wishlist.resetStorage} />

      <Tabs label="주요 메뉴" tabs={SCREENS} value={screen} onChange={setScreen} />

      <main>
        <TabPanel id="wishlist" hidden={screen !== 'wishlist'}>
          <WishlistScreen
            items={wishlist.items}
            now={wishlist.now}
            onAdd={wishlist.add}
            onEdit={wishlist.edit}
            onDecide={wishlist.decide}
            onExtend={wishlist.extend}
            onRemove={wishlist.remove}
            onAddDemo={wishlist.addDemo}
          />
        </TabPanel>
        <TabPanel id="compare" hidden={screen !== 'compare'}>
          <CompareScreen onGoToWishlist={() => setScreen('wishlist')} />
        </TabPanel>
        <TabPanel id="history" hidden={screen !== 'history'}>
          <HistoryScreen items={wishlist.items} onRemove={wishlist.remove} />
        </TabPanel>
      </main>

      <footer className="app-footer">
        기록은 이 브라우저에만 저장돼요. 브라우저 데이터를 지우거나 다른 기기에서 열면 보이지 않아요.
      </footer>
    </div>
  )
}

// 저장 상태 안내 (PRD F06, AC13): 실패를 성공처럼 보이지 않게 하고, 손상된 기록은 확인을 거쳐 초기화한다
function StorageBanner({ status, onRetry, onReset }: { status: StorageStatus; onRetry: () => void; onReset: () => void }) {
  const [confirming, setConfirming] = useState(false)
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
      {status.kind === 'corrupt' ? (
        <>
          <p>저장된 기록을 읽을 수 없어요. 초기화하기 전까지는 새로 담는 물건이 저장되지 않아요.</p>
          {confirming ? (
            <div className="stack">
              <p className="note">초기화하면 읽을 수 없는 기록은 사라지고, 지금 화면의 물건만 저장돼요.</p>
              <div className="btn-row">
                <Button
                  variant="danger"
                  onClick={() => {
                    onReset()
                    setConfirming(false)
                  }}
                >
                  초기화
                </Button>
                <Button onClick={() => setConfirming(false)}>취소</Button>
              </div>
            </div>
          ) : (
            <div className="btn-row">
              <Button onClick={() => setConfirming(true)}>기록 초기화</Button>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
