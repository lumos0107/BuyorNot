// 긴 화면 안의 구역으로 바로 이동하는 버튼 줄. 내용을 숨기거나 순서를 바꾸지 않고 스크롤만 옮긴다.
export type JumpTarget = { label: string; selector: string; open?: boolean }

export function JumpNav({ label, targets }: { label: string; targets: readonly JumpTarget[] }) {
  const go = (target: JumpTarget) => {
    const el = document.querySelector<HTMLElement>(target.selector)
    if (!el) return
    if (target.open && el instanceof HTMLDetailsElement) el.open = true
    el.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }
  return (
    <nav className="jump-nav" aria-label={label}>
      {targets.map((target) => (
        <button key={target.selector} type="button" className="jump-chip" onClick={() => go(target)}>
          {target.label}
        </button>
      ))}
    </nav>
  )
}
