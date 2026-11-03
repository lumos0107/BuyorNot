import type { ReactNode } from 'react'

// 자잘한 설명은 처음에 접어 두고 눌러서 본다 (2026-11-03 제작자 "이런 자잘한 설명은 눌러서 보이게 처음은 안보이게")
export function FinePrint({ label = '안내 보기', children }: { label?: string; children: ReactNode }) {
  return <details className="fine-print">
    <summary>{label}</summary>
    <div className="stack">{children}</div>
  </details>
}
