import { Button } from '../../ui/Button'

// 읽는 동안 보이는 진행 문구(role=status)와 '취소' (PRD 10장 앱 공통)
export function Progress({ text, onCancel }: { text: string; onCancel: () => void }) {
  return (
    <div className="stack">
      <p className="note" role="status">
        {text}
      </p>
      <div className="btn-row">
        <Button onClick={onCancel}>취소</Button>
      </div>
    </div>
  )
}
