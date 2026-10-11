import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'

// 손상된 기록 초기화 확인 (PRD F06, AC13). 확인으로 들어가면 "초기화"에, 취소하면 원래 버튼에 포커스를 둔다.
// 초기화하면 배너가 사라지므로 다음 포커스 위치는 onReset을 넘기는 쪽이 정한다.
export function ResetConfirm({ label, note, onReset }: { label: string; note: string; onReset: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (!confirming && returnFocus.current) {
      openRef.current?.focus()
      returnFocus.current = false
    }
  }, [confirming])

  if (!confirming) {
    return (
      <div className="btn-row">
        <Button ref={openRef} onClick={() => setConfirming(true)}>
          {label}
        </Button>
      </div>
    )
  }
  return (
    <div className="stack">
      <p className="note">{note}</p>
      <div className="btn-row">
        <Button
          variant="danger"
          autoFocus
          onClick={() => {
            setConfirming(false)
            onReset()
          }}
        >
          초기화
        </Button>
        <Button
          onClick={() => {
            returnFocus.current = true
            setConfirming(false)
          }}
        >
          취소
        </Button>
      </div>
    </div>
  )
}
