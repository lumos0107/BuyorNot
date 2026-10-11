import { useEffect, useRef, useState } from 'react'
import { Button } from './Button'

// 예시만 지우기: 시연용 예시가 실제 기록·합계에 섞이지 않게 예시만 골라 지운다.
// 확인으로 들어가면 "지우기"에, 취소하면 원래 버튼에 포커스를 둔다. 지운 뒤의 포커스는 onConfirm을 넘기는 쪽이 정한다.
export function ExampleBar({ label, message, onConfirm }: { label: string; message: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const openRef = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useEffect(() => {
    if (!confirming && returnFocus.current) {
      openRef.current?.focus()
      returnFocus.current = false
    }
  }, [confirming])

  if (confirming) {
    return (
      <div className="card stack" role="group" aria-label="예시 지우기 확인">
        <p className="field-label">{message}</p>
        <div className="btn-row">
          <Button
            variant="danger"
            autoFocus
            onClick={() => {
              setConfirming(false)
              onConfirm()
            }}
          >
            지우기
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
  return (
    <div className="example-bar">
      <span className="note">시연용 예시가 들어 있어요.</span>
      <button type="button" className="link-btn" ref={openRef} onClick={() => setConfirming(true)}>
        {label}
      </button>
    </div>
  )
}
