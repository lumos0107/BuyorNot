---
name: testing-ai-screens
description: Use when writing or reviewing 살까말까 (BuyorNot) screen tests for features that call the AI server — 가격표 사진, 사진으로 채우기, 말로 담기, 캡처 치수 읽기 — 모의 서버 응답, 늦은 응답, 취소, 숨은 화면 포커스, 미리보기 주소 해제, 60초 상한, fake timers hang.
---

# AI 화면 테스트

## 개요

AI 화면 테스트의 어려운 곳은 문구가 아니라 비동기 동작이다: 요청이 겹치고, 늦게 오고, 취소되고, 화면이 숨겨진다. 문구·AC 옮기기는 writing-tests-from-spec을 따르고, 이 스킬은 그 동작을 어떻게 흉내 내고 무엇을 단언하는지를 정한다.

## 준비

- `vi.stubEnv('VITE_AI_SERVER_URL', 'https://ai.test')`. 서버 주소 없는 빌드는 따로 1개: 탭·버튼이 없고 `fetch` 0번.
- 가짜 전역은 `src/test/aiMocks.ts`의 함수로만 깐다(`mockImagePipeline`, `mockObjectUrls`, 녹음 흉내, 서버 흉내). 시나리오별 응답 표와 보류 응답은 테스트 파일에서 짜도 된다.
- `afterEach` 순서: `cleanup()` → (해제 단언) → `vi.unstubAllGlobals()` → `vi.unstubAllEnvs()` → `vi.useRealTimers()`. 전역을 먼저 되돌리면 언마운트 때 jsdom에 없는 `URL.revokeObjectURL`을 불러 깨진다.

## 서버 흉내

경로별로 차례 응답을 둔다. 등록하지 않은 경로·메서드, 차례 응답이 다 떨어진 뒤의 요청은 기록해 두고 `afterEach`에서 실패시킨다. 경로별 호출 수, 보낸 본문(JSON), 그 요청의 `signal`을 기록한다.

| 응답 | 쓰는 곳 |
| --- | --- |
| 성공 본문 | 정상 흐름 |
| 429 · 503 · 500 | 실패 문구, 자동 재요청 없음 |
| 네트워크 오류 · 모양이 다른 JSON | "지금은 읽지 못했어요…" |
| 보류(나중에 테스트가 풂, 취소 신호를 무시) | 늦은 응답 |
| 매달림(안 끝남, 취소되면 실제 fetch처럼 AbortError) | 취소·시간 초과 |

## 무엇을 단언하나

1. **보낸 것**: 열 수 없는 사진이면 요청 0번. 사용자가 고친 값으로 보낸다(본문을 파싱해 칸 값 확인).
2. **429·503**: 한 번의 사용자 동작에서 자동 재요청이 없다(시간을 더 흘려도 호출 수 그대로). 문구는 `role=alert`. 사용자가 다시 누르는 것은 기능 명세대로.
3. **늦은 응답**: 기능 명세가 "앞 요청을 끊는다"고 정한 일(새 사진, 취소, 결과가 덮어쓸 칸 고침, 고른 상품 바꿈)마다 — 보류로 요청 A → 그 일 → A를 풂 → 화면이 A 결과로 바뀌지 않음 + A의 `signal.aborted`가 true. 명세가 정하지 않은 일은 지어내지 않는다.
4. **숨은 화면 포커스**: 읽는 중 다른 메뉴로 옮기고 그 화면의 버튼에 포커스를 둔 뒤 응답을 풂 → `document.activeElement`가 그 버튼 그대로. jsdom에서 `display:none` 요소의 `focus()`는 아무 일도 하지 않아, 포커스가 "안 옮겨졌다"만으로는 숨김 검사가 빠진 구현을 잡지 못한다 → `vi.spyOn(HTMLElement.prototype, 'focus')`로 숨은 패널 안 요소에 `focus()`가 불리지 않았는지도 본다(보이는 화면에서는 같은 흐름이 제목으로 포커스를 옮기는 대조 테스트를 함께). 돌아오면 결과가 보이는지는 기능 명세가 정할 때만 단언한다.
5. **미리보기 주소**: 보이는 동안은 해제되지 않고, 바뀌거나 사라지면 해제되고, 같은 주소를 두 번 해제하지 않는다. 언마운트 뒤 만든 주소와 해제한 주소가 같은 집합이다.
6. **60초 상한**: `postJson`의 상한은 `src/ai/client.test.ts`가 이미 본다. 화면에서는 경로마다 한 번: 59,999ms에는 문구 없음, 60,000ms에 `role=alert`. 가짜 타이머는 `vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })`만 쓰고, 이때 `userEvent`·`waitFor`·`findBy`는 멈추므로 `fireEvent`와 `await act(async () => { vi.advanceTimersByTime(n) })`로 진행한다.
7. **찾기**: 역할·이름으로. PRD·계획에 없는 라벨이 필요하면 계획 Interfaces의 이름을 쓰고, 그래도 없으면 `// 가정: …` 주석.

## 자주 하는 실수

- 보류 응답이 취소 신호에 끊기게 만든다 → 늦은 응답 방어(요청 번호)를 시험하지 못한다. 늦은 응답은 신호를 무시하는 보류로.
- 실제 60초를 기다리거나 `userEvent`를 가짜 타이머와 함께 쓴다 → 테스트가 멈춘다.
- 컴포넌트 내부 상태·클래스 이름으로 단언한다 → 보이는 글과 역할로.
