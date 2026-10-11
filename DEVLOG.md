# 살까말까 개발 기록

AI에 요청한 내용, 생성 결과, 발견한 문제, 수정 이유, 검증 결과를 작업마다 남긴다. (PRD #8)
역할: 개발 Claude · 검토 GPT(Codex CLI) · 확인과 승인 강승준.

## 2026-10-11 · 0단계 · 기획 문서 검토

| 항목 | 기록 내용 |
| --- | --- |
| 날짜와 작업 번호 | 2026-10-11, 0단계 (PRD v0.7·TODO 확정) |
| 연결된 기능과 검증 ID | PRD #3, #8, #9 / TODO 1-1~1-3 |
| AI에 요청한 내용 | Claude가 PRD·TODO·README를 정리하고, GPT에게 "README가 PRD·TODO와 일치하는가, 계산 예시가 맞는가, Jekyll → Vite 배포 전환 순서에 위험이 없는가"를 검토 요청 |
| 생성 결과와 발견한 문제 | GPT 첫 검토는 Codex의 Windows 샌드박스 권한 오류로 파일을 읽지 못해 실패. 검토 자료를 프롬프트에 첨부하는 방식으로 다시 요청. 두 번째 검토에서 지적 5건: ① 배포 워크플로 push가 Pages Source 전환보다 먼저라 첫 배포가 깨질 수 있음 ② Vite 템플릿이 기존 문서를 덮어쓸 위험 ③ 현재 시각 주입 대상이 '종료 시각 계산'으로 잘못 적힘 ④ TODO가 PRD v0.6을 가리킴 ⑤ Public·push 미확인 문장이 완료 체크와 모순 |
| 수정한 내용과 이유 | 5건 모두 실제 파일과 대조해 맞는 지적임을 확인하고 반영. 1단계 작업 순서(로컬 빌드 → commit → Source 전환 → push → 배포 확인) 명시, 임시 폴더에서 골격 생성, 4-9/4-10 역할 분리, 버전·문장 정정 |
| 검증 결과 | GPT 재검토: 5건 모두 해결, 새 문제 없음, "1단계 착수 가능" |
| commit 식별자와 push 확인 | `364e2b6` push 확인 (원격 main 일치) |
| 남은 작업 | 1단계 착수 |

## 2026-10-11 · 1단계 · 기능 검증용 모바일 프로토타입 (1-4 ~ 1-22)

| 항목 | 기록 내용 |
| --- | --- |
| 날짜와 작업 번호 | 2026-10-11, 1-4 ~ 1-22 |
| 연결된 기능과 검증 ID | PRD #1 디자인 방향, #4, F06, #8 / 부분적으로 F01·F03·F04·F05의 화면 배치 |
| AI에 요청한 내용 | 사용자: "6단계까지 진행해. 문제가 생기면 GPT와 상의 후 결정해." Claude가 TODO 1단계를 순서대로 수행 |
| 생성 결과와 발견한 문제 | ① `create-vite` react-ts 템플릿(React 19.2, Vite 8.3, TypeScript 6.0)을 빈 임시 폴더에 만들고 설정 파일만 옮김. 템플릿의 README·데모 이미지·App.css는 가져오지 않음. ② 화면 전환 테스트(5개)를 먼저 쓰고 `App`이 없는 상태에서 실패를 확인한 뒤 구현. ③ Vitest 5 + Testing Library 설정. React Testing Library의 자동 정리는 `globals` 없이는 동작하지 않아 `setup.ts`에서 `afterEach(cleanup)`을 직접 호출. ④ 숫자 입력은 `inputMode="numeric"`, 입력 글자 크기 16px(iOS 확대 방지), 버튼·입력 최소 높이 44px. ⑤ 배포는 `.github/workflows/deploy.yml`(테스트 → 빌드 → Pages), `vite.config.ts`의 `base: '/BuyorNot/'`. 화면 전환은 상태 기반이라 새로고침 404가 없음. ⑥ 디자인 규칙: 색 5개 토큰, 글꼴 Pretendard 하나, 그라데이션·이모지 없음, 파비콘은 체크 아이콘만. ⑦ 계산·저장이 연결되지 않은 카드·결과는 "예시" 배지로 표시 |
| 수정한 내용과 이유 | 코드 오류로 되돌린 작업은 없음. 템플릿의 `.oxlintrc.json`은 그대로 두고 `npm run lint`로 확인 |
| 검증 결과 | `npm test` 5/5 통과(처음 열면 고민 중인 물건, 가격 비교 → 할인 비교 기본, 묶음상품 탭 전환, 결정 기록 이동, 키보드 Tab+Enter 이동). `npm run build` 성공(tsc -b 포함), `npm run lint` 경고 없음. `vite preview`를 실제 Chrome(headless)으로 열어 360px·1024px에서 네 화면 캡처: 가로 넘침 없음(scrollWidth = viewport), 콘솔 오류·네트워크 실패·HTTP 4xx 없음. 빌드 결과 `dist/index.html`의 경로가 모두 `/BuyorNot/`로 시작함 |
| commit 식별자와 push 확인 | (1-23에서 기록) |
| 남은 작업 | 1-23 commit → 1-25 Pages Source 전환(사용자) → 1-24 push → 1-26 배포 확인. 2-1(Vitest 환경)은 이번에 함께 끝남 |
