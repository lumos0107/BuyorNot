import { useCallback, useEffect, useRef, useState } from 'react'

type Props = {
  file: Blob
  /** 있으면 작은 미리보기 바로 아래에 접이식 큰 사진을 둔다(F44 "캡처 크게 보기"). 없으면 작은 미리보기만이다 */
  enlarge?: { label: string; alt: string }
}

// 미리보기 주소는 이 요소가 그려져 있는 동안만 둔다. 사진이 바뀌거나 사라지면 바로 해제한다 (PRD 10장 앱 공통).
// 효과 안에서 만들고 정리에서 해제해 StrictMode가 효과를 두 번 돌려도 만든 주소와 해제한 주소가 짝이 맞는다.
// 큰 사진도 같은 주소를 쓴다: 파일마다 주소는 하나이고 정리에서 한 번만 해제한다(새 주소도 서버 요청도 없다).
export function PhotoPreview({ file, enlarge }: Props) {
  const image = useRef<HTMLImageElement>(null)
  const large = useRef<HTMLImageElement | null>(null)
  const url = useRef<string | null>(null)
  // 큰 사진은 펼친 동안만 그린다(접힌 동안 문서에 이미지가 하나 더 있지 않게)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const next = URL.createObjectURL(file)
    url.current = next
    if (image.current) image.current.src = next
    if (large.current) large.current.src = next
    return () => URL.revokeObjectURL(next)
  }, [file])
  // 큰 사진이 새로 그려질 때 지금 주소를 달아 준다(펼치기 전에 이미 만든 주소)
  const placeLarge = useCallback((element: HTMLImageElement | null) => {
    large.current = element
    if (element && url.current) element.src = url.current
  }, [])
  // 읽은 값은 글로 따로 보이므로 미리보기는 장식으로 둔다
  return (
    <>
      <img ref={image} alt="" className="photo-preview" />
      {enlarge ? (
        <details onToggle={(event) => setOpen(event.currentTarget.open)}>
          <summary>{enlarge.label}</summary>
          {open ? <img ref={placeLarge} alt={enlarge.alt} className="photo-large" /> : null}
        </details>
      ) : null}
    </>
  )
}
