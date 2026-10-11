import { useRef, type KeyboardEvent, type ReactNode } from 'react'

export type TabItem<T extends string> = { id: T; label: string }

type TabsProps<T extends string> = {
  label: string
  tabs: readonly TabItem<T>[]
  value: T
  onChange: (next: T) => void
  sub?: boolean
}

// ARIA 탭 패턴: 선택된 탭만 Tab 순서에 있고, 좌우 방향키·Home·End로 옮기면 바로 선택된다.
// 화면 전환은 주소가 아니라 상태로 처리한다. GitHub Pages에서 새로고침해도 404가 나지 않게 하기 위해서다. (PRD #8)
export function Tabs<T extends string>({ label, tabs, value, onChange, sub }: TabsProps<T>) {
  const buttons = useRef(new Map<T, HTMLButtonElement>())

  const moveTo = (index: number) => {
    const next = tabs.at(index)
    if (!next) return
    onChange(next.id)
    buttons.current.get(next.id)?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = tabs.length - 1
    let target: number | null = null
    if (event.key === 'ArrowRight') target = index === last ? 0 : index + 1
    else if (event.key === 'ArrowLeft') target = index === 0 ? last : index - 1
    else if (event.key === 'Home') target = 0
    else if (event.key === 'End') target = last
    if (target === null) return
    event.preventDefault()
    moveTo(target)
  }

  return (
    <div className={sub ? 'tabs tabs-sub' : 'tabs'} role="tablist" aria-label={label}>
      {tabs.map((tab, index) => {
        const selected = tab.id === value
        return (
          <button
            key={tab.id}
            ref={(el) => {
              if (el) buttons.current.set(tab.id, el)
              else buttons.current.delete(tab.id)
            }}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            className="tab"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}

type PanelProps = { id: string; hidden?: boolean; children: ReactNode }

// 패널은 숨겨도 떼어 내지 않는다. 다른 메뉴에 다녀와도 입력하던 값이 남아 있게 하기 위해서다.
export function TabPanel({ id, hidden, children }: PanelProps) {
  return (
    <section role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={hidden}>
      {children}
    </section>
  )
}
