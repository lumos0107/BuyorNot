# GPT 인계: 살까말까 절약·저축 기능 이어서 개발 (2026-11-01)

Claude 주간 한도가 거의 다 차서, 남은 개발은 GPT(VS Code 에이전트)가 하고 Claude는 마지막에 확인·수정만 한다(11/4 이후). 이 문서 하나만 읽고 시작할 수 있게 썼다.

## 1. 목표 (제작자 원문)
"처음에 추구한 것은 2030 자취생의 돈을 절약해 줄 수 있는 앱. 너무 가격 비교에만 신경 쓸 필요는 없어." / "절약도 좋은데 저축도 해 볼까?" / "AI 반드시 들어갈 필요는 없어." / "일곱 묶음 전부 구현."

## 2. 지금 위치
- 저장소 `C:\Users\seungjun\Documents\claude_code\3학년_2학기\살까말까`, 브랜치 **`saving`**(ai-stage1에서 갈라짐), HEAD `dda8c0d`. 자동 테스트 1741개 통과. **push 금지, 커밋만.**
- 끝난 것: **1a**(F45 고정비 · F46 무료 체험 · F47 해지했어요 · F48 모으기 · F49 탭 다섯 개 · F20 보강 백업 v2, AC81~AC99). 작업마다 구현·리뷰, 전체 리뷰·최종 수정, 제작자 화면 확인까지 끝(DEVLOG 2026-11-01 18단계).
- 진행 중이던 것: **1b 준비**. `PRD.md` v0.46(1b 명세)은 커밋됨(`dda8c0d`). 1b 계획 `docs/superpowers/plans/2026-11-01-saving-p1b.md`는 **쓰다 멈춘 초안(커밋 안 됨)** — 읽어 보고 이어서 완성하거나 새로 쓴다. 판정표 줄·TODO 19단계는 아직 안 함.

## 3. 남은 순서
1. **1b**: PRD v0.46의 1b 기능(요금 바뀜 기록, 같은 곳 구독·멤버십, 정기배송 n주마다, 통신 약정·비교 링크, 수도·가스·전기 `bills.v1`, 가능하면 체험 끝나기 전날 캘린더) + 1a에서 넘긴 것(아래 7장).
2. **2단계**: C 집에 있는 것(생필품·식재료 목록, 떨어지기 전·유통기한, 냉장고 재료, 생필품 비교) + D 자잘한 지출(편의점·카페 기록, 배달 앱 총액 비교, 최소 주문 금액).
3. **3단계**: B 사기 전에(할부 총액, 빌리기·중고, 중복 구매 — C 목록과 대조, 대용량, 목표가) + E 산 뒤에(반품 기한, 되팔기).
4. **4단계**: F 받을 수 있는 돈(청년 월세·에너지 바우처·교통비 환급 등은 **자격 판정 없이** 공식 링크와 '내가 확인한 날'만, 카드 실적·포인트·쿠폰 만료, 친구 정산·빌려준 돈).
2~4단계의 기능 수준 설계는 설계 문서에 있다. 단계마다 아래 4장의 순서를 따른다.

## 4. 단계마다 하는 일 (이 저장소의 방식)
1. `PRD.md`에 그 단계 기능을 적는다(스킬 `.claude/skills/updating-prd/SKILL.md`): 화면 문장 그대로, 입력 범위, 저장, 각 결정에 "Claude 결정, 제작자 확인 전"(GPT가 정해도 이 표시를 쓰고 9장 '남은 결정 목록'에 한 줄), 검증 사례 AC(지금 AC99까지, 1b는 v0.46에 있음), 버전 올리기. `python .claude/skills/updating-prd/scripts/check_prd_refs.py PRD.md`가 OK여야 함.
2. `docs/평가/판정표.md`에 기능마다 한 줄(제작자 칸은 비움).
3. `TODO.md`에 단계 추가(스킬 `syncing-todo`, 계획 표시 `(계획 saving-p1b T#)` 식). `python .claude/skills/syncing-todo/scripts/check_todo.py` OK.
4. 계획 `docs/superpowers/plans/2026-11-01-saving-<단계>.md`(1a 계획 `2026-11-01-saving-p1a.md`를 형식 본보기로).
5. 작업마다 **테스트 먼저**(실패 확인) → 구현 → 통과 → 커밋. 커밋 전 `npm test`, `npm run lint`, `npx tsc -b`, `python .claude/skills/checking-before-commit/scripts/check_all.py`(.md만 바꾼 커밋은 `--quick`). 화면 문구를 바꾸면 `.claude/skills/checking-ui-copy/SKILL.md`.
6. 단계 끝: `mark_done.py`로 TODO 표시(`python .claude/skills/syncing-todo/scripts/mark_done.py saving-p1b <T번호> <해시>`), `DEVLOG.md`에 그 단계 한 항목(기존 항목과 같은 표 형식, 스킬 `updating-devlog`), 제작자용 화면 확인 목록(5~10분, 1a 때처럼 표 7줄 정도)을 `.superpowers/sdd/saving/화면확인_<단계>.md`로.

## 5. 꼭 지킬 규칙
- **push·main 합치기·배포 금지**(제작자 몫). 커밋 메시지 영어 conventional 형식(`feat: …`, `docs: …`), 바꾼 파일만 경로로 `git add`(`-A` 금지).
- `_개인기록/`, `worker/.dev.vars`, 키 파일은 읽지도 출력하지도 않는다. grep에서도 뺀다.
- 기록은 브라우저 localStorage만. **저장 형식은 더하기만**: 옛 기록·백업 v1·v2 파일이 그대로 읽혀야 하고, 새 키는 백업에 넣되 그 키가 없는 백업도 받는다. 불러오기 실패 시 원래 기록 유지.
- **지킨 돈(줄어든 고정비·참은 구매)과 옮긴 돈은 절대 더하지 않는다**, 저축 목표는 옮긴 돈으로만(결정 R45). '모은 돈'처럼 보이는 말 금지.
- 문구: 훈계하지 않기, 어디서도 "사라/말라" 금지, 쉬운 말, PRD 따옴표 문장 그대로. 색은 `src/index.css` 변수만, 그라데이션·이모지 금지, 터치 44px, 라벨·오류 연결·`role=status/alert`.
- **성공 안내는 저장이 반영됐을 때만** 띄운다(저장 훅의 반환값으로, 1a 최종 리뷰 교훈).
- 테스트 이름은 한국어 문장이고 **맨 앞에 AC 번호**(`'AC100: …'`). Node가 필요한 테스트는 `src/**/*.node.test.ts`로(앱 타입에 Node가 새지 않게).
- 기존 테스트는 PRD가 바꾼 곳만 고치고 커밋 본문에 그 AC를 적는다.
- 외부 사이트 가격 긁어오기·제휴 링크·자격 판정 금지. 새 서버·AI 없음.
- 개발 서버(:5173 Vite, :8787 wrangler)가 켜져 있을 수 있다. 끄지 않는다.

## 6. 읽을 파일
- 설계: `docs/superpowers/specs/2026-11-01-saving-features-design.md`(일곱 묶음·단계·저장·화면)
- 결정: `.superpowers/sdd/saving/decisions.md`(R45·R46), 1a 원장 `.superpowers/sdd/2026-11-01-saving-p1a/progress.md`(R47~R51)
- 1a 계획·보고: `docs/superpowers/plans/2026-11-01-saving-p1a.md`, `.superpowers/sdd/2026-11-01-saving-p1a/final-review.md`
- 1b 명세: `PRD.md` v0.46(머리말 버전 줄과 9장, 1b 기능 절)
- 공통 규칙 요약: `.superpowers/sdd/2026-11-01-saving-p1a/project-rules.md`

## 7. 1a에서 넘어온 것 (1b에서 처리)
- 결정 R46: 요금 바뀜 날짜가 해지한 날보다 늦으면 저장하지 않는다.
- 같은 검사 도우미(`isString`·`isDay`·`isTimestamp`)가 `src/logic/savings.ts`와 `src/logic/subscriptions.ts`에 중복 — 한 곳으로 모으기.
- 고정비 화면에 남은 '구독' 문구(저장 안내·예시 버튼·백업 문장)를 '고정비'로 맞출지 정하기(PRD 9장 질문).
- 전체 테스트에서 이름 모를 실패가 한 번 있었고 다시 돌리면 통과 — 다시 보이면 테스트 이름을 적어 둔다.

## 8. 하지 않을 것
판정표의 제작자 칸 채우기, README 학생 서술 칸 채우기, push·배포, 새 AI 기능.

## 9. 끝나면 (Claude가 11/4 이후 확인)
단계마다 `.superpowers/sdd/saving/GPT_진행기록.md`에 한 줄씩: 날짜, 단계, 커밋 해시, 테스트 수, 남긴 걱정. Claude는 이 파일과 `git log saving`을 보고 단계 전체 리뷰와 수정을 한다.
