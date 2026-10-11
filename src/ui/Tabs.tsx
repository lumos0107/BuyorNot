export type TabItem<T extends string> = { id: T; label: string }

type TabsProps<T extends string> = {
  label: string
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (next: T) => void
  sub?: boolean
}

// 화면 전환은 주소가 아니라 상태로 처리한다. GitHub Pages에서 새로고침해도 404가 나지 않게 하기 위해서다. (PRD #8)
export function Tabs<T extends string>({ label, tabs, value, onChange, sub }: TabsProps<T>) {
  return (
    <div className={sub ? 'tabs tabs-sub' : 'tabs'} role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          id={`tab-${tab.id}`}
          className="tab"
          aria-selected={tab.id === value}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

type PanelProps = { id: string; children: React.ReactNode }

export function TabPanel({ id, children }: PanelProps) {
  return (
    <section role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`}>
      {children}
    </section>
  )
}
