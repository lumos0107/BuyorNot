import type { ChangeEvent, Ref } from 'react'

// 사진 고르기 버튼 (PRD 10장 앱 공통 · F31). 폰에서는 브라우저가 카메라와 갤러리 중에서 고르게 한다.
// 고른 뒤 값을 비워 같은 사진을 다시 골라도 change가 다시 와서 다시 읽는다.
// 전송 안내는 이 버튼을 쓰는 화면이 버튼 바로 아래, 누르기 전부터 보이게 둔다.
// 같은 이름의 버튼이 한 화면에 여럿이면(F32의 상품 A·B 카드) describedBy로 구분하는 설명을 잇고,
// 취소한 뒤 포커스를 돌릴 수 있게 inputRef로 입력 요소를 내준다.
export function PhotoPicker({
  label,
  onPick,
  disabled,
  describedBy,
  inputRef,
  capture,
}: {
  label: string
  onPick: (file: File) => void
  disabled?: boolean
  describedBy?: string
  inputRef?: Ref<HTMLInputElement>
  /** 'environment'면 폰에서 고르기 창 없이 뒷면 카메라를 바로 연다(PC 브라우저는 무시). 가격표 사진 찍기만 쓴다 (F31, AC224) */
  capture?: 'environment'
}) {
  const pick = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (file) onPick(file)
  }
  return (
    <label className="btn photo-pick">
      {label}
      <input ref={inputRef} type="file" accept="image/*" capture={capture} disabled={disabled} aria-describedby={describedBy} onChange={pick} />
    </label>
  )
}
