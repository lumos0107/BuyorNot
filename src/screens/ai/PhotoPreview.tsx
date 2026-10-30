import { useEffect, useRef } from 'react'

// 미리보기 주소는 이 요소가 그려져 있는 동안만 둔다. 사진이 바뀌거나 사라지면 바로 해제한다 (PRD 10장 앱 공통).
// 효과 안에서 만들고 정리에서 해제해 StrictMode가 효과를 두 번 돌려도 만든 주소와 해제한 주소가 짝이 맞는다
export function PhotoPreview({ file }: { file: Blob }) {
  const image = useRef<HTMLImageElement>(null)
  useEffect(() => {
    const url = URL.createObjectURL(file)
    if (image.current) image.current.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])
  // 읽은 값은 글로 따로 보이므로 미리보기는 장식으로 둔다
  return <img ref={image} alt="" className="photo-preview" />
}
