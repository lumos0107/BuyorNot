import type { ChangeEvent } from 'react'

// 사진 고르기 버튼 (PRD 10장 앱 공통 · F31). 폰에서는 뒤 카메라를 먼저 연다(capture).
// 고른 뒤 값을 비워 같은 사진을 다시 골라도 change가 다시 와서 다시 읽는다.
// 전송 안내는 이 버튼을 쓰는 화면이 버튼 바로 아래, 누르기 전부터 보이게 둔다.
export function PhotoPicker({ label, onPick, disabled }: { label: string; onPick: (file: File) => void; disabled?: boolean }) {
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (file) onPick(file)
  }
  return (
    <label className="btn photo-pick">
      {label}
      <input type="file" accept="image/*" capture="environment" disabled={disabled} onChange={pick} />
    </label>
  )
}
