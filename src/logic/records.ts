// 수정 폼을 연 뒤 기록이 바뀌었는지 판단한다 (PRD 2차 공통 여러 탭 규칙).
// 기록 시각(updatedAt)만 보면 같은 밀리초에 바뀐 경우를 놓치므로 내용 전체를 키 순서와 상관없이 비교한다.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((key) => [key, canonical(obj[key])]),
    )
  }
  return value
}

export function sameRecord(a: object, b: object): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
}
