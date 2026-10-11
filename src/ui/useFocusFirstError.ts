import { useEffect, useRef, useState } from 'react'

// 제출에 실패하면 오류가 그려진 뒤 폼 안의 첫 번째 오류 입력(aria-invalid)으로 포커스를 옮긴다.
// 폼에 noValidate를 써서 브라우저 기본 동작이 없기 때문이다. (PRD F06)
export function useFocusFirstError<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [request, setRequest] = useState(0)
  useEffect(() => {
    if (request === 0) return
    ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [request])
  return { ref, focusFirstError: () => setRequest((n) => n + 1) }
}
