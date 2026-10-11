import { useState } from 'react'
import { CompareScreen } from './screens/CompareScreen'
import { HistoryScreen } from './screens/HistoryScreen'
import { WishlistScreen } from './screens/WishlistScreen'
import { TabPanel, Tabs, type TabItem } from './ui/Tabs'

type Screen = 'wishlist' | 'compare' | 'history'

const SCREENS: readonly TabItem<Screen>[] = [
  { id: 'wishlist', label: '고민 중인 물건' },
  { id: 'compare', label: '가격 비교' },
  { id: 'history', label: '결정 기록' },
]

export default function App() {
  const [screen, setScreen] = useState<Screen>('wishlist')

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="brand">살까말까</h1>
        <span className="brand-sub">살지 말지, 산다면 얼마에</span>
      </header>

      <Tabs label="주요 메뉴" tabs={SCREENS} value={screen} onChange={setScreen} />

      <main>
        <TabPanel id="wishlist" hidden={screen !== 'wishlist'}>
          <WishlistScreen />
        </TabPanel>
        <TabPanel id="compare" hidden={screen !== 'compare'}>
          <CompareScreen />
        </TabPanel>
        <TabPanel id="history" hidden={screen !== 'history'}>
          <HistoryScreen />
        </TabPanel>
      </main>

      <footer className="app-footer">아직 만드는 중이에요. 숙려 기록 저장은 곧 연결돼요.</footer>
    </div>
  )
}
