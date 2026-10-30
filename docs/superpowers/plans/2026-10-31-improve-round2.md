# 살까말까 평가 2회차 개선(개발 2회차) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다각도 평가 2회차(평가 B)의 결정(판정 R38)대로 PRD v0.38의 AI 공통·F43 실패 구분, F32·F44 확인 상자, F18 회고 안내, F24 첫 화면(AC75~AC79)을 만들고, 화면 확인 스킬에 모의 응답 규칙을 넣고, 문서를 사실에 맞춘다.

**Architecture:** 서버는 `worker/src/gemini.ts`의 `callGemini`가 실패 사유(제한·키 없음)를 함께 돌려주고, 처리기 셋(가격표 읽기·치수 읽기·말로 담기)이 `http.ts`의 새 도우미 하나로 429·503·502를 고른다. 다나와 확인(`lowestPrice.ts`)은 그대로 둔다. 앱은 `src/ai/client.ts`가 429 본문의 `error`로 두 제한을 나누고 `src/ai/messages.ts`의 `aiFailureMessage`가 문구를 준다(화면 넷은 이미 이 함수를 쓴다). 화면 문장은 지금처럼 `src/logic`(`bundleFill.ts`, `sizeFill.ts`, `summary.ts`)의 상수·문장 함수에 두고 화면은 그 결과만 그린다. 확인 상자 설명은 BundlePhotoFill이 이미 쓰는 `useId` + `aria-describedby` 방식을 그대로 쓴다. 회고 줄은 F18 결정 알림(항상 그려 두고 글만 바꾸는 칸) 안에 따로 된 줄로 더한다. 프롬프트·응답 스키마·저장 형식은 건드리지 않는다.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5 + Testing Library(jsdom), Node 24, Cloudflare Workers(테스트는 Node 환경). 1회차 계획과 같다.

**Spec:** `PRD.md` v0.38. 10장 '중간 과제 AI 기능 공통'의 오류 응답 줄·'Gemini 제한과 키 없음'·실패 문구·완료 기준 줄, F12 끝줄, F18 2026-10-31 보강·완료 기준, F24 2026-10-31 평가 B 보강·완료 기준, F32 흐름·'확인 상자 첫 줄', F43 '요청 실패', F44 확인 상자 설명 줄, 9장 '평가 2회차(평가 B)에서 정한 것'과 넓힌 R29-I1 줄, 11장 AC75~AC79와 바뀐 AC60·AC32. 결정 근거: `docs/평가/2026-10-31-2회차.md` 5장(판정 R38, GPT 51번). 원문: `docs/평가/2026-10-31-2회차/`(D_a11y_copy.md 파일:줄, C_security.md 서버 모의 시험, R1·R2 토론). 제작자 판정 칸: `docs/평가/판정표.md` #28(넓힘)·#31~#33.

**작업 순서(구현 위험이 큰 것부터, 문서는 마지막):**

| 작업 | 평가 항목(판정) | 위험이 그 자리인 이유 |
| --- | --- | --- |
| Task 1 | P6 서버 실패 구분과 앱 문구 (R38-P6) | 모든 AI 경로가 지나는 `callGemini`·`postJson`과 평가 채점(`eval/lib.ts`)을 바꾼다. 기존 테스트 하나의 기대값(AC60)이 바뀐다 |
| Task 2 | P9·I8 확인 상자 설명과 F32 첫 줄 (R38-P9·R38-I8) | F32 확인 상자 문장을 단언하는 기존 테스트 17곳을 바꾸고, 두 AI 화면의 마크업을 고친다 |
| Task 3 | N3 회고 ① (R38-N3) | 결정 알림은 F18·F24 포커스 규칙이 함께 쓰는 칸이다. 기존 정확 단언(`App.undo.test.tsx:94`)을 깨지 않아야 한다 |
| Task 4 | I3 첫 화면 (R38-I3) | 문장 하나를 옮길 뿐이다. 빈 목록 상자를 단언하는 테스트 6곳이 그대로 통과해야 한다 |
| Task 5 | P12 `testing-ai-screens` 규칙 (R38 (5)) | 코드는 없지만 서브에이전트 행동을 바꾸는 스킬 규칙이라 비교 시험이 먼저다. **총괄이 직접(서브에이전트 비교 시험 필요)** |
| Task 6 | P10·P11 문서와 배포 계획 Task 17 | 코드 없음. 테스트 수는 Task 1~4 뒤의 실제 값으로 적는다 |

## Global Constraints

- PRD v0.38의 새 문장과 동작은 모두 'Claude 결정, 제작자 확인 전'이다. 작업을 시작하기 전에 `docs/평가/판정표.md`에서 그 작업의 줄(Task 1 #31, Task 2 #28 넓힌 부분, Task 3 #32, Task 4 #33)을 본다. 제작자가 '아니오'나 '바꿈'으로 적었으면 코드보다 PRD를 먼저 고치고(updating-prd) 이 계획의 문장도 바꾼다. 빈칸이면 PRD v0.38 문장대로 만든다.
- 화면 문구는 PRD에 적힌 문장 그대로 쓴다(따옴표 안 글자, `·`, `‘ ’`, 마침표까지). 어디서도 사라·말라를 말하지 않는다. 문구를 바꾼 작업은 checking-ui-copy 스킬로 점검한다.
- 저장 형식은 바꾸지 않는다(WishItem 새 필드 없음, `schemaVersion: 1`). 회고 줄과 첫 화면 문장은 화면 상태·고정 문장일 뿐 저장하지 않는다.
- 실제 Gemini를 부르지 않는다. 프롬프트(`READ_TAG_PROMPT`·`READ_SIZE_PROMPT`·`VOICE_PROMPT`·`PICK_PROMPT`)와 응답 스키마, 출력 토큰 상한, 시간 상한은 바꾸지 않는다. `worker/`에서 바꾸는 것은 Task 1의 실패 구분뿐이다. `worker/wrangler.jsonc`는 건드리지 않는다(배포 날 항목).
- 앱 값 그대로: `PHOTO_TIMEOUT_MS = 60_000`, `VOICE_TIMEOUT_MS = 60_000`(`src/ai/config.ts`), 사진 긴 변 1600px, 서버 IP 제한 1분 10번. `VITE_AI_SERVER_URL`이 없으면 AI 탭·버튼을 그리지 않는다.
- 테스트 이름은 한국어 문장이고 **맨 앞에 검증 번호**를 붙인다(예: `'AC75: …'`). 기대 문장은 PRD에서 복사한다(writing-tests-from-spec).
- 서버 테스트(`worker/test/`)와 평가 테스트(`eval/`)는 첫 줄이 `// @vitest-environment node`이고, 가져오기는 `.ts` 확장자를 붙인다(`'../src/gemini.ts'`). 새 파일을 만들면 같은 머리를 쓴다.
- 기존 테스트는 고치지 않는다. PRD v0.38이 기대값을 바꾼 곳만 작업에 적힌 대로 고치고 커밋 메시지에 그 AC를 적는다: `worker/test/gemini.test.ts:149` '429는 다시 부르지 않아요'(AC60·AC75), F32 확인 상자 첫 줄 단언(`src/logic/bundleFill.test.ts` 6곳, `src/App.photoBundle.test.tsx` 11곳, AC77).
- 테스트의 가짜 전역(createImageBitmap·canvas·URL.createObjectURL·fetch)은 `src/test/aiMocks.ts`의 것만 쓰고, 쓰는 파일은 `afterEach`에서 `vi.unstubAllGlobals()`·`vi.unstubAllEnvs()`·`vi.useRealTimers()`로 되돌린다.
- AI 서버를 부르는 화면이나 확인 상자를 고치는 작업(Task 1의 앱 쪽, Task 2)은 구현자 지시에 `testing-ai-screens`·`applying-ai-results` 스킬을 적는다(평가 B P13: 1회차 16-2~16-4에 지정하지 않았다).
- 브라우저로 화면을 확인하면 평가기준.md 1장의 '브라우저 상태'·'실제 호출 세기'를 따른다(새 브라우저 컨텍스트, 모의 응답은 끝나자마자 해제, 실제 호출은 서버 로그의 `POST /api/...`로 셈). 이 계획의 작업은 자동 테스트로 끝나고 브라우저 확인을 요구하지 않는다.
- 작업마다 끝에 `npm test`, `npm run lint`, `npx tsc -b`가 통과해야 한다(`eval/`을 고친 Task 1은 `npx tsc -p eval/tsconfig.json`도). 커밋 전 `python .claude/skills/checking-before-commit/scripts/check_all.py`(코드가 있으면 `--quick` 없이). 커밋만 하고 push하지 않는다. `_개인기록/`, `PRD_1주안.md`, `worker/.dev.vars`, `.env*.local`은 읽지도 커밋하지도 않는다. 파일은 LF.
- TODO·DEVLOG는 총괄이 코드 커밋 뒤 그 해시로 고친다(구현자는 고치지 않음, syncing-todo·updating-devlog).

## Review Focus

1. Gemini 429만 `upstream_limited`가 되고, 503 두 번·500·시간 초과·모양이 다른 응답은 그대로 `502 upstream`이며, 429를 받으면 다시 부르지 않는다 → Task 1 `AC75: 503 뒤 429가 오면 제한으로 알리고 세 번째는 부르지 않아요`, 기존 '503이 두 번 나오면 포기하고 세 번째는 부르지 않아요'·'503이 아닌 다른 오류 상태도 다시 부르지 않아요'가 고치지 않고 통과.
2. 키 검사는 Gemini를 부르기 바로 전이라 `AI_ENABLED` 꺼짐(503)·IP 제한(429 `rate_limited`)·본문 검사(400·413)가 먼저이고, 다나와를 끈 다나와 확인은 키가 없어도 `off`다 → Task 1 `AC75: 키가 없어도 본문 검사가 먼저라 형식이 틀리면 400이에요`, `AC75: 다나와를 끈 상태에서는 키가 없어도 off이고 바깥으로 요청하지 않아요`.
3. 앱이 429 본문을 읽는 동안 취소하면 'cancelled'이고, 본문이 JSON이 아니어도 멈추지 않고 `rate_limited`다 → Task 1 `AC76: 429 본문을 읽는 중에 취소하면 cancelled다`, `AC76: 429 본문이 rate_limited이거나 JSON이 아니면 rate_limited다`.
4. 상품 A·B 두 카드의 확인 상자가 함께 열려도 설명이 서로 다른 줄을 가리키고, 첫 줄이 없을 때(고르기 전) 없는 id를 가리키지 않는다 → Task 2 `AC77: 상품 A와 B의 확인 상자가 함께 열리면 설명이 각자 자기 첫 줄이다`, `AC77: 상품이 둘이면 고르기 전에는 상자 설명이 없고, 고르면 고른 상품의 첫 줄이 설명이다`.
5. 회고 줄은 구매함일 때만 결정 알림 안에 따로 있고, 되돌리기·다음 결정·새로고침이면 알림과 함께 사라지며, "‘키보드’를 구매함으로 옮겼어요." 정확 단언은 그대로다 → Task 3 `AC78: …` 다섯 개와 `App.undo.test.tsx:94`.

---

### Task 1: Gemini 제한과 키 없음을 다른 실패와 나누기 (P6, R38-P6)

**Files:**
- Modify: `worker/src/env.ts`(`Env.GEMINI_API_KEY`), `worker/src/gemini.ts`(`Attempt`, `callGemini`), `worker/src/http.ts`(`ErrorCode`, 새 `geminiFailed`), `worker/src/readTag.ts:184`, `worker/src/readSize.ts:130`, `worker/src/voiceFill.ts:81`, `eval/lib.ts:557-563`(`asDanawaPicks`), `src/ai/client.ts:7-9·57`(`AiFailure`, `send`), `src/ai/messages.ts:14-23`(`aiFailureMessage`)
- 바꾸지 않음: `worker/src/lowestPrice.ts`(`if (!result.ok) return reply('not_confirmed', [], front)` 그대로), `eval/score.ts`(아래 '확인한 것')
- Modify(테스트): `worker/test/gemini.test.ts`, `worker/test/readTag.test.ts`, `worker/test/readSize.test.ts`, `worker/test/voiceFill.test.ts`, `worker/test/http.test.ts`, `worker/test/lowestPrice.test.ts`, `eval/lib.test.ts`, `src/ai/client.test.ts`, `src/ai/messages.test.ts`, `src/App.photoTag.test.tsx`, `src/App.voiceFill.test.tsx`

**확인한 것(바꾸지 않는 이유):** `eval/score.ts:117-119`의 `isLimited`는 상태 429·503을 모두 제한·꺼짐으로 보고 칸을 채점하지 않는다. `tally`(`:276-291`)는 `limited`와 `requests`(= 사례 − 제한)를 따로 세고, `formatTally`(`eval/lib.ts:508`)는 "사례 n개 · 요청 n번 중 실패 n번 · 제한·꺼짐으로 받지 못한 요청 n번"으로 뺀 수를 채점한 수 옆에 보이며, `eval/summarize.ts:44-45`가 같은 값을 성적표의 `excluded`로 넘긴다. 그래서 서버를 거치는 평가 셋(가격표·말로 담기·치수)은 서버가 429 `upstream_limited`를 돌려주기만 하면 된다. 빠진 곳은 하나다: 다나와 고르기 평가(`eval/lowestPrice.eval.ts`)는 서버를 거치지 않고 `callGemini`를 직접 부르고 `asDanawaPicks`가 실패를 모두 502로 적는다. 이것을 429로 적게 고친다.

**Interfaces:**
- `env.ts`: `GEMINI_API_KEY?: string`(배포에서 비밀 변수를 빠뜨리면 undefined다).
- `gemini.ts`:
  - `export type GeminiFailure = { ok: false; reason?: 'limited' | 'no_key' }` — `reason`은 Gemini 429(`limited`)와 키 없음(`no_key`)에만 붙고, 그 밖의 실패(시간 초과·5xx·모양이 다른 응답)는 지금처럼 `{ ok: false }`다(기존 `toEqual({ ok: false })` 단언이 그대로 통과).
  - `callGemini(opts: { key: string | undefined; … }): Promise<{ ok: true; value: unknown } | GeminiFailure>`. 맨 앞에서 `if (!key?.trim()) return { ok: false, reason: 'no_key' }`(fetch 전).
  - `type Attempt`에 `{ kind: 'limited' }`. `attemptOnce`에서 `res.status === 429`이면 `limited`(503 검사 뒤, `!res.ok` 앞). `limited`는 다시 부르지 않는다(지금도 503만 다시 부름). 반복이 끝난 뒤 `result.kind === 'limited'`이면 `{ ok: false, reason: 'limited' }`.
- `http.ts`:
  - `ErrorCode`에 `'upstream_limited'`.
  - `export function geminiFailed(failure: GeminiFailure, ctx: RequestContext): Response` — `limited` → `fail(429, 'upstream_limited', ctx)`, `no_key` → `fail(503, 'disabled', ctx)`, 그 밖 → `fail(502, 'upstream', ctx)`. `fail`은 지금처럼 CORS·`no-store` 헤더를 붙인다.
- 처리기 셋: `if (!result.ok) return geminiFailed(result, ctx)`. `voiceFill.ts:83`(받아쓰기 모양이 틀린 502)은 그대로.
- `eval/lib.ts`: `asDanawaPicks(rows, result: { ok: true; value: unknown } | GeminiFailure): { httpStatus: 200 | 429 | 502; picked: number[] | null }` — `!result.ok && result.reason === 'limited'`이면 `{ httpStatus: 429, picked: null }`, 그 밖의 실패는 지금처럼 502. (`no_key`는 `readKey()`가 빈 키에서 먼저 멈추므로 오지 않는다.)
- `src/ai/client.ts`:
  - `export type AiFailure = 'rate_limited' | 'upstream_limited' | 'disabled' | 'failed' | 'cancelled'`, 머리 주석에 "upstream_limited: Gemini 자체 제한(서버 429, 본문 error가 upstream_limited)".
  - `send`: `if (response.status === 429) return fail(await limitKind(response))`. `async function limitKind(response: Response): Promise<'rate_limited' | 'upstream_limited'>` — `response.json()`을 `try`로 읽어 `isRecord(body) && body.error === 'upstream_limited'`이면 `upstream_limited`, 그 밖(본문이 다르거나 JSON이 아님)은 `rate_limited`. 본문 읽기는 같은 `signal` 아래에 있어 취소되면 `postJson`이 `cancelled`로 돌려준다(지금 구조 그대로).
- `src/ai/messages.ts`: `case 'upstream_limited': return 'AI 사용이 제한됐어요. 나중에 다시 시도하거나 직접 입력해 주세요.'`. 화면 넷(`TagPhotoCheck.tsx:223·250`, `BundlePhotoFill.tsx:117`, `SizePhotoFill.tsx:140`, `VoiceFillButton.tsx:90`)은 이미 `aiFailureMessage(result.error)`를 부르므로 고치지 않는다.

- [ ] **Step 1: 기존 테스트를 PRD v0.38에 맞춤(AC60·AC75)** — `worker/test/gemini.test.ts:149`의 '429는 다시 부르지 않아요'를 `AC75: 429는 다시 부르지 않고 제한으로 알려요`로 이름을 바꾸고 기대값 `{ ok: false }`를 `{ ok: false, reason: 'limited' }`로 바꾼다(호출 1번 단언은 그대로). 다른 기존 테스트는 고치지 않는다.
- [ ] **Step 2: 실패하는 새 테스트(서버)**
  - `gemini.test.ts`: `AC75: 키가 없거나 빈 글자·공백뿐이면 Gemini를 부르지 않고 키 없음으로 알려요`(undefined·''·'  ' 세 경우 → `{ ok: false, reason: 'no_key' }`, fetch 0번), `AC75: 503 뒤 429가 오면 제한으로 알리고 세 번째는 부르지 않아요`(fetch 2번).
  - `readTag.test.ts`·`readSize.test.ts`·`voiceFill.test.ts` 각각: `AC75: Gemini가 429를 주면 429 upstream_limited로 답하고 다시 부르지 않아요`(상태 429, 본문 `{ error: 'upstream_limited' }`, fetch 1번, `Access-Control-Allow-Origin`·`Cache-Control: no-store`), `AC75: 키가 없으면 Gemini를 부르지 않고 503 disabled로 답해요`(키를 뺀 env와 `GEMINI_API_KEY: ''` 두 경우, fetch 0번). `readTag.test.ts`에만 `AC75: 키가 없어도 본문 검사가 먼저라 형식이 틀리면 400이에요`(`image/gif` → 400 `bad_request`, fetch 0번). 기존 'Gemini가 실패하면 502예요'(500)는 그대로 통과해야 한다.
  - `http.test.ts`: `AC75: 같은 IP 11번째는 본문이 rate_limited인 429예요`(지금 테스트는 상태만 본다. 본문까지, 외부 요청 0번).
  - `lowestPrice.test.ts`: `AC75: 다나와를 켠 상태에서 Gemini가 429를 주면 지금처럼 not_confirmed예요`, `AC75: 다나와를 켠 상태에서 키가 없으면 Gemini를 부르지 않고 not_confirmed예요`(fetch는 다나와 주소만), `AC75: 다나와를 끈 상태에서는 키가 없어도 off이고 바깥으로 요청하지 않아요`.
- [ ] **Step 3: 실패하는 새 테스트(평가·앱)**
  - `eval/lib.test.ts`: `AC76: 다나와 고르기 평가에서 Gemini가 제한이면 429로 적고 제한으로 센다`(`asDanawaPicks(rows, { ok: false, reason: 'limited' })` → `{ httpStatus: 429, picked: null }`, 그 값으로 `scoreDanawaCase` → `fields` 빈 배열, `tally`의 `limited` 1·`failed` 0), `AC76: 평가 결과의 한 사례가 429면 칸을 채점하지 않고 출력 첫 줄에 제한 수를 함께 보인다`(`scoreTagCase(…, { httpStatus: 429, ms: 100, items: null })` 하나로 `formatTally(tally([…]))[0]`이 `'사례 1개 · 요청 0번 중 실패 0번 · 제한·꺼짐으로 받지 못한 요청 1번'`. 이 단언은 지금 코드로도 통과할 수 있다: 확인용이며, 실패 확인 단계에서 이것만 통과하는 것은 정상이다).
  - `src/ai/client.test.ts`: `AC76: 429 본문이 upstream_limited면 upstream_limited이고 다시 보내지 않는다`, `AC76: 429 본문이 rate_limited이거나 JSON이 아니면 rate_limited다`(`new Response('not json', { status: 429 })`), `AC76: 429 본문을 읽는 중에 취소하면 cancelled다`(본문을 늦게 주는 응답 + `controller.abort()`). 기존 '429는 rate_limited, 503은 disabled이고 다시 보내지 않는다'는 그대로.
  - `src/ai/messages.test.ts`: `AC76: Gemini 제한 문구가 PRD 문장 그대로다`.
  - `src/App.photoTag.test.tsx`: `AC76: 사진 읽기에 서버가 429 upstream_limited면 Gemini 제한 문구를 role=alert로 보이고, 시간이 지나도 다시 요청하지 않는다`(`aiReply.status(429, { error: 'upstream_limited' })`, 그 파일의 AC53 테스트와 같은 방식으로 `advance(120_000)` 뒤 호출 수 그대로). 기존 AC53의 `aiReply.status(429)`(본문 `{ error: 'x' }`)는 `rate_limited` 문구 그대로 통과해야 한다.
  - `src/App.voiceFill.test.tsx`: `AC76: 말로 담기에 서버가 429 upstream_limited면 Gemini 제한 문구를 보인다`.
- [ ] **Step 4: 실패 확인** — 위 파일만 `npx vitest run …`. 기대값 불일치로 실패하는지 본다(모듈·타입 오류가 아니라).
- [ ] **Step 5: 구현** — 위 Interfaces대로. PRD 10장 '실패 문구'의 새 문장을 `messages.ts`에 글자 그대로.
- [ ] **Step 6: 통과 확인** — `npm test`, `npm run lint`, `npx tsc -b`, `npx tsc -p eval/tsconfig.json`, `python .claude/skills/checking-privacy/scripts/check_privacy.py`(서버에 `console` 출력 없음), `git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -`.
- [ ] **Step 7: 커밋** `feat(worker): tell Gemini limits and a missing key apart from other failures (AC60, AC75, AC76)` — 본문에 바꾼 기존 테스트 하나(gemini.test.ts '429는 다시 부르지 않아요', AC60 기대값 502 → 429 `upstream_limited`)와 다나와 확인을 바꾸지 않은 이유를 적는다.

### Task 2: 확인 상자 첫 줄을 상자 설명으로, F32 "AI가 읽은 내용" (P9·I8, R38-P9·R38-I8)

**Files:**
- Modify: `src/logic/sizeFill.ts:25`(`CHECK_TEXT`를 export), `src/logic/bundleFill.ts:63-68`(`read`), `src/screens/ai/BundlePhotoFill.tsx:181·193-201`, `src/screens/ai/SizePhotoFill.tsx:203·215-217`
- Modify(테스트): `src/logic/bundleFill.test.ts`, `src/App.photoBundle.test.tsx`, `src/App.fitPhoto.test.tsx`

**Interfaces:**
- `sizeFill.ts`: `export const CHECK_TEXT = '사진과 같은지 확인해 주세요'`(값 그대로, F32도 같은 끝말을 쓴다).
- `bundleFill.ts`: `read`는 `` `AI가 읽은 내용: ‘${item.name}’ · ${sizeLabel ? `‘${sizeLabel}’` : '포장 표기 없음'} · ${CHECK_TEXT}` ``. 거절(`ok: false`)의 `message`·`fill` 줄·`fillLine`은 그대로.
- `BundlePhotoFill`: `const firstLineId = useId()`. 알림 칸(role=status)의 첫 `<p>`에 `id={firstLineId}`(성공이면 `fill.read`, 거절이면 `fill.message`). 확인 상자 그룹에 `aria-describedby={fill === null ? undefined : firstLineId}`. 그룹 이름 `aria-label="확인 상자"`, `tabIndex={-1}`, 포커스 효과, 라디오 이름은 그대로.
- `SizePhotoFill`: `const firstLineId = useId()`. `lines`의 첫 줄(`view.read`, 단위 mixed일 때도 첫 줄)에 `id={firstLineId}`. 그룹에 `aria-describedby={view === null ? undefined : firstLineId}`. 나머지는 그대로.

- [ ] **Step 1: 기존 테스트를 PRD v0.38에 맞춤(AC77)** — `bundleFill.test.ts`의 `result.read` 기대값 6곳(40·48·65·101·107·147줄)을 새 문장으로: '세탁 세제 · 2.5L' → `'AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요'`, 표기 없음 → `'AI가 읽은 내용: ‘세탁 세제’ · 포장 표기 없음 · 사진과 같은지 확인해 주세요'`, 나머지도 같은 모양. `App.photoBundle.test.tsx`의 `'읽은 내용: …'` 11곳(299·338·381·405·789·907·912·913·938·955·979줄)을 같은 모양으로(913줄은 `queryByText`라 새 문장의 '세탁 세제' 판). 테스트 이름에 '읽은 내용'이 있으면 'AI가 읽은 내용'으로.
- [ ] **Step 2: 실패하는 새 테스트**
  - `bundleFill.test.ts`: `AC77: 포장 표기가 있으면 상품명과 표기를 각각 따옴표로, 없으면 포장 표기 없음을 따옴표 밖에 두고 사진과 같은지 확인해 달라고 붙여요`.
  - `App.photoBundle.test.tsx`(그 파일의 `boxEl`·`box`·`B`):
    - `AC77: 상품 B를 읽으면 확인 상자 첫 줄이 AI가 읽은 내용이고 상자의 설명도 같은 문장이다` — `expect(boxEl(B)).toHaveAccessibleDescription('AI가 읽은 내용: ‘세탁 세제’ · ‘2.5L’ · 사진과 같은지 확인해 주세요')`, `boxEl(B)`의 이름은 '확인 상자' 그대로, `box(B).queryByText(/^읽은 내용:/)` null
    - `AC77: 포장 표기가 없으면 첫 줄과 상자 설명에서 포장 표기 없음이 따옴표 밖에 있다`
    - `AC77: 단가 가격표면 상자의 설명이 AC73 거절 문장이다`(그 파일의 `UNIT_PRICE_ML`, 응답은 `ITEM_UNIT_PRICE_ML`)
    - `AC77: 상품이 둘이면 고르기 전에는 상자 설명이 없고, 고르면 고른 상품의 첫 줄이 설명이다`(`not.toHaveAccessibleDescription()` → 고른 뒤 문장)
    - `AC77: 상품 A와 B의 확인 상자가 함께 열리면 설명이 각자 자기 첫 줄이다`(A·B를 차례로 읽어 두 상자를 열어 둠)
  - `App.fitPhoto.test.tsx`(그 파일의 `READ_LINE`과 라디오 사례):
    - `AC77: 표기 하나를 읽으면 확인 상자의 설명이 AI가 읽은 내용 첫 줄이다`
    - `AC77: 표기가 둘이면 고르기 전에는 설명이 없고 첫 표기를 고르면 그 첫 줄이 설명이다`(`'접었을 때 · AI가 읽은 내용: ‘접었을 때 30 x 20 x 10cm’ · 사진과 같은지 확인해 주세요'`)
    - `AC77: 단위가 mixed여도 첫 줄이 설명이다`
- [ ] **Step 3: 실패 확인** — `npx vitest run src/logic/bundleFill.test.ts src/App.photoBundle.test.tsx src/App.fitPhoto.test.tsx`.
- [ ] **Step 4: 구현** — 위 Interfaces대로. 포커스 효과·알림 칸 역할·미리보기 주소는 건드리지 않는다(각 파일 끝 `afterEach`의 주소 짝 단언이 그대로 통과).
- [ ] **Step 5: 통과 확인** — `npm test`, `npm run lint`, `npx tsc -b`, `git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -`, 바꾼 문장을 PRD F32 흐름·'확인 상자 첫 줄'의 따옴표 안 문장과 글자 대조(checking-ui-copy 2단계).
- [ ] **Step 6: 커밋** `feat: say AI가 읽은 내용 in the F32 box and describe both confirm boxes by their first line (F32, F44, AC77)` — 본문에 바꾼 기존 테스트 17곳이 AC77 문장 때문이라고 적는다. 실제 스크린리더로 읽히는지는 확인하지 않았다고 적는다(자동 테스트는 연결만 본다).

### Task 3: 구매함으로 옮긴 직후 회고 안내 한 줄 (N3 일부, R38-N3)

**Files:**
- Modify: `src/logic/summary.ts`(`RETRO_AFTER_MS` 옆 새 상수), `src/screens/WishlistScreen.tsx:148-165`(결정 알림)
- Modify(테스트): `src/logic/summary.test.ts`, `src/App.undo.test.tsx`

**Interfaces:**
- `summary.ts`: `export const RETRO_NOTICE = \`${RETRO_AFTER_MS / DAY_MS}일 뒤부터 결정 기록에서 잘 샀는지 적을 수 있어요.\`` — 일수를 `RETRO_AFTER_MS`에서 만들어 회고가 열리는 실제 때와 문장이 어긋나지 않게 한다. 결과는 PRD F18 문장 "7일 뒤부터 결정 기록에서 잘 샀는지 적을 수 있어요."와 글자까지 같다.
- `WishlistScreen`: 결정 알림 칸(`role="status" aria-label="결정 알림"`) 안, 지금의 `example-bar`(옮겼어요 문장 + 되돌리기) 뒤에 `undo.decision === 'purchased'`일 때만 `<p className="note">{RETRO_NOTICE}</p>`. 옮겼어요 `<span>`의 글과 되돌리기 버튼, 칸의 `className` 규칙(`undoActive`가 아니면 `similar-empty`), `headingRef` 포커스는 그대로. 새 상태를 만들지 않는다(`undo`·`undoActive`로 충분).

- [ ] **Step 1: 실패하는 테스트**
  - `summary.test.ts`: `AC78: 회고 안내 문장은 PRD 문장 그대로이고 일수는 회고가 열리는 RETRO_AFTER_MS와 같다`.
  - `App.undo.test.tsx` '결정 직후 되돌리기 (F18)' 안(그 파일의 시계·`card` 도우미):
    - `AC78: 구매함을 확인하면 결정 알림에 옮겼어요 문장과 그 아래 7일 뒤부터 회고를 적을 수 있다는 줄이 함께 보인다` — `within(getByRole('status', { name: '결정 알림' }))`에서 `getByText('‘키보드’를 구매함으로 옮겼어요.')`와 `getByText('7일 뒤부터 결정 기록에서 잘 샀는지 적을 수 있어요.')`가 서로 다른 요소
    - `AC78: 구매 포기를 확인하면 회고 줄이 없다`
    - `AC78: 되돌리기를 누르면 회고 줄도 함께 사라진다`
    - `AC78: 구매함 뒤 다른 물건을 구매 포기하면 알림이 바뀌고 회고 줄이 없다`
    - `AC78: 구매함 뒤 새로고침하면 결정 알림과 회고 줄이 없다`(unmount 뒤 다시 render)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/logic/summary.test.ts src/App.undo.test.tsx`.
- [ ] **Step 3: 구현** — 위 Interfaces대로.
- [ ] **Step 4: 통과 확인** — `npm test`(`App.undo.test.tsx:94`의 정확 단언과 F24 담은 직후 테스트 포함), `npm run lint`, `npx tsc -b`, `git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -`.
- [ ] **Step 5: 커밋** `feat: say when the review opens right after 구매함 (F18, AC78)`

### Task 4: 고민 중인 물건이 없을 때 서비스 설명을 담기 폼 위로 (I3, R38-I3)

**Files:**
- Modify: `src/screens/WishlistScreen.tsx:176-207`
- Create: `src/App.firstScreen.test.tsx`

**Interfaces:**
- `WishlistScreen.tsx` 모듈 상수 `const SERVICE_INTRO = '사고 싶은 물건을 담아 두면 날마다 다시 생각해 보고, 처음 적은 이유와 지금 마음을 비교할 수 있어요.'`(지금 205줄의 글 그대로).
- `considering.length === 0`이면 '처음이라면 예시로 둘러보세요.' `example-bar` 바로 앞에 `<p className="note">{SERVICE_INTRO}</p>`(그 줄을 그리지 않는 경우에도 같은 자리, 곧 담기 폼보다 앞). 빈 목록 상자(`div.empty`)에서는 이 `<p>`를 빼고 `<p>아직 담아 둔 물건이 없어요.</p>`만 남긴다.

- [ ] **Step 1: 실패하는 테스트** — `src/App.firstScreen.test.tsx`(App 전체, `localStorage` 비움. 담기 폼은 `getByRole('form', { name: '물건 담기' })`):
  - `AC79: 기록 없이 처음 열면 담기 폼 위, 예시 줄 바로 앞에 서비스 설명이 있고 빈 목록 상자에는 아직 담아 둔 물건이 없어요만 있다` — 설명 요소가 '처음이라면 예시로 둘러보세요.' 요소와 담기 폼보다 앞(`compareDocumentPosition`), 빈 목록 상자(`'아직 담아 둔 물건이 없어요.'`의 부모) 안에 설명 문장 없음, 문서 안에 설명 문장은 하나
  - `AC79: 예시 물건 넣기 뒤에는 서비스 설명이 없다`
  - `AC79: 물건을 하나 담으면 서비스 설명이 없다`
  - `AC79: 고민 중인 물건을 모두 결정하면 서비스 설명이 담기 폼 위에 다시 보인다`
- [ ] **Step 2: 실패 확인** — `npx vitest run src/App.firstScreen.test.tsx`.
- [ ] **Step 3: 구현** — 위 Interfaces대로.
- [ ] **Step 4: 통과 확인** — `npm test`(빈 목록 상자를 단언하는 `App.gominNote.test.tsx:345-349`·`App.wishlist.test.tsx`·`App.phase2.test.tsx`·`App.storage.test.tsx`가 고치지 않고 통과), `npm run lint`, `npx tsc -b`, `git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -`.
- [ ] **Step 5: 커밋** `feat: show the service sentence above the add form when the list is empty (F24, AC79)`

### Task 5: `testing-ai-screens`에 브라우저 확인 규칙 (P12, R38 (5)) — 총괄이 직접(서브에이전트 비교 시험 필요)

구현 서브에이전트에게 맡기지 않는다. 총괄이 superpowers:writing-skills의 순서(RED → GREEN → REFACTOR)로 한다. 비교 시험은 새 서브에이전트에게 시나리오를 주고 결과 파일을 받는 방식이며, 실제 브라우저·실제 AI는 쓰지 않는다(계획만 쓰게 한다).

**Files:**
- Modify: `.claude/skills/testing-ai-screens/SKILL.md`(description, 새 절 '브라우저로 화면을 확인할 때'), `docs/평가/평가기준.md`(1장 '브라우저 상태' 줄에 링크, '바꾼 기록' 한 줄), `.claude/skills/README.md`(그 스킬 줄의 '언제 쓰나'와 '시험 결과'에 이번 비교)
- 저장소 밖: 비교 시험 시나리오·결과(`.superpowers/sdd/…`), 서브에이전트 지시 규칙(`project-rules.md`)에 "AI 화면을 브라우저로 확인하는 서브에이전트 지시에는 `testing-ai-screens`를 적고, 모의 응답 해제 여부를 보고하게 한다"(GPT 51번)

**넣을 내용(GPT 51번):**
- description: 지금 범위(화면 테스트 작성·검토, 모의 서버 응답, 늦은 응답, 취소 등)를 그대로 두고 "Playwright·브라우저로 AI 화면을 확인하거나 AI 서버 응답을 모의 처리할 때(`page.route`)"를 더한다. 영어 description이면 `…, or when checking those screens in a real browser with Playwright (page.route mocks, browser check)` 식으로 같은 뜻의 낱말을 넣는다.
- 새 절 '브라우저로 화면을 확인할 때'(네 줄 안팎):
  1. 새 브라우저 컨텍스트에서 확인한다.
  2. `page.route`(모의 응답)는 그 확인의 `finally`에서 바로 해제하고(`unrouteAll`) 컨텍스트를 닫는다. 같은 브라우저가 다음 확인·평가에 이어지면 모의 응답이 실제 AI 결과처럼 돌아온다(2026-10-31 평가 1회차·평가 B의 P1).
  3. 실제 호출 여부는 그 요청에 맞는 서버(wrangler dev) 로그의 `POST /api/...` 줄로 확인하고, 로그가 없으면 '미확인'으로 기록한다.
  4. 모의 응답을 썼으면 보고서에 '모의 응답'이라고 적는다.
- 스크립트 검사는 만들지 않는다(잔재는 브라우저 세션 상태라 `check_all.py`가 볼 수 없다. 토론 세 관점 합의).

**비교 시험(writing-skills):**
- 시나리오: 서브에이전트는 TODO 15-8 '로컬 화면 확인'을 맡았다. 앱은 `http://localhost:5173/BuyorNot/`(`VITE_AI_SERVER_URL=http://localhost:8787`), 로컬 AI 서버는 :8787. 브라우저는 Playwright MCP로 연다. 실제 Gemini 호출 한도를 이미 다 썼고(두 번 모두 40초 시간 초과), 남은 확인은 F44 치수 읽기에서 표기 3개가 돌아왔을 때 라디오·확인 상자·'넣기'·저장 흐름이다. 브라우저를 열거나 실행하지 말고, 확인 순서·쓸 Playwright 코드·끝난 뒤 할 일·보고서 예시 한두 줄을 적게 한다. 저장소 스킬 `testing-ai-screens`를 읽고 따르라고만 하고, **브라우저를 다른 에이전트와 같이 쓴다거나 뒤에 평가가 이어진다는 힌트는 주지 않는다**(힌트를 준 첫 판은 규칙 없이도 격리해 시험이 되지 않았다, 평가 B 진행 기록).
- RED(규칙 없이): 지금 SKILL.md로 서브에이전트 1명. 결과를 그대로 저장하고 아래 기준 중 어긴 것을 적는다.
- GREEN(규칙과 함께): 같은 시나리오, 새 서브에이전트 1명.
- 통과 기준(GREEN이 모두 지켜야 하고, RED는 하나 이상 어겨야 규칙이 효과가 있다고 쓴다): (가) 모의 응답을 새 브라우저 컨텍스트(또는 새 브라우저)에서만 건다 (나) `finally`에서 라우트를 해제하고 그 컨텍스트를 닫는다 (다) 실제 호출 여부를 서버 로그의 `POST /api/...` 줄로 확인하거나, 로그가 없으면 '미확인'이라 적는다 (라) 보고서 예시에 '모의 응답'이라고 적는다 (마) 공유 페이지·기본 컨텍스트에 라우트를 남기지 않는다.
- RED가 이미 다 지키면: 시나리오를 바꿔(시간 압박, '빨리 한 번만' 지시) 한 번 더 RED를 돈다. 그래도 다 지키면 규칙 문장은 넣되 '비교 시험에서 효과는 보이지 않았다'고 README·DEVLOG에 적는다(효과를 지어내지 않는다). GREEN이 기준을 어기면 빠져나간 곳을 규칙에 막고(REFACTOR) GREEN을 다시 돈다.

- [ ] **Step 1:** RED 실행과 기록(위 시나리오, 규칙 없는 SKILL.md).
- [ ] **Step 2:** SKILL.md에 description과 새 절을 넣는다(GPT 51번 문장, 제작자 승인 전이면 DEVLOG에 '스킬 규칙: 제작자 확인 전'으로 적는다).
- [ ] **Step 3:** GREEN 실행과 기록, 필요하면 REFACTOR 뒤 다시.
- [ ] **Step 4:** `docs/평가/평가기준.md` 1장 '브라우저 상태' 줄 끝에 "(같은 규칙: [`.claude/skills/testing-ai-screens/SKILL.md`](../../.claude/skills/testing-ai-screens/SKILL.md) '브라우저로 화면을 확인할 때')"를 더하고, '바꾼 기록'에 날짜와 이유 한 줄. `.claude/skills/README.md`의 그 스킬 줄과 '시험 결과'에 RED·GREEN 결과를 숫자 그대로.
- [ ] **Step 5: 확인** — `python .claude/skills/checking-before-commit/scripts/check_all.py --quick`(문서만).
- [ ] **Step 6: 커밋** `docs(skills): check AI screens in a fresh browser context and unroute mocks (testing-ai-screens)`

### Task 6: 문서 — P1 정정 단락, README 한 문장, 낡은 사실, 배포 계획 Task 17, 테스트 수 (P10·P11, R38 (1))

**Files:** Modify `docs/ai-eval.md`, `README.md`, `PRD.md`(9장 앞 문단, 버전 0.39), `docs/superpowers/plans/2026-10-28-ai-stage1.md`(Task 17)

이 작업은 Task 1~5 커밋 뒤에 한다(테스트 수를 그 뒤의 실제 값으로). 학생 목소리 부분(README 학생 칸, 장단점·개선점·결론의 주장, 완성 목표일, 마감일)은 고치지 않는다(평가기준.md 5장).

- [ ] **Step 1: 숫자를 실제 값으로 모은다** — `npm test`의 통과 수(N), `TODO.md`의 `- [x]` 수와 체크박스 전체 수, PRD의 마지막 AC(AC79), 판정표 줄 수(33), `git log --oneline -1`. 짐작한 숫자는 쓰지 않는다.
- [ ] **Step 2: `docs/ai-eval.md`에 P1 정정 한 단락** — '## 한계' 앞에 `## 평가 도구를 점검한 기록 (2026-10-31)`을 두고 한 단락(사실만, '엄밀히' 같은 꾸밈말 없이). 들어갈 것: ① 날짜와 일: 평가 1회차와 평가 B에서 치수 읽기가 합성 캡처(`docs/평가/기준자료/src_capture.html`)에 없는 치수 세 줄을 보였고 두 번의 세 줄이 글자까지 같았다 ② 근거 셋: 로컬 AI 서버 로그에 두 평가의 `POST /api/read-size`가 없음, 2단계 화면 확인(TODO 15-8)이 Playwright `page.route`로 넣은 모의 응답의 세 줄이 화면과 같음, 평가 B가 보낸 사진을 서버에 직접 보내자 정답(제품 60×30×120cm, 포장 124×32×12cm) ③ 틀린 판단: 1회차 조사는 서버 로그를 보지 않고 '모델이 지어냈다'고 결론 냈다 ④ 영향받은 판정: R29-I1(AI가 읽은 내용 문구)·R29-N1(캡처 크게 보기)은 대조를 돕는 조치라 그대로 두었고(판정표 #28·#29), 1회차 기록 6장의 후속 후보 넷((가) 20번 재기, (나) 서버 진단 로그, (다) 프롬프트 예시 바꾸기, (라) 두 번 읽기)은 내려놓았으며, 두 평가의 치수 읽기 결과는 비교에 쓰지 않는다 ⑤ 재발 방지: 평가기준.md 1장의 '브라우저 상태'·'실제 호출 세기'와 `testing-ai-screens`의 '브라우저로 화면을 확인할 때'(Task 5) ⑥ 한계: 이 캡처의 실제 호출은 3번 모두 정답이었지만 합성 캡처 한 장이라 치수 읽기의 정확도로 쓰지 않는다. 링크: [평가 1회차 기록 6장 끝](평가/2026-10-31-1회차.md), [평가 B 기록](평가/2026-10-31-2회차.md).
- [ ] **Step 3: README 4장 한 문장** — 4-3 '평가와 판정'의 P5 문단 뒤에 한 문장과 링크(GPT 51번: 한 문장이면 충분하다): "평가 1회차와 평가 B에서 '치수 읽기가 사진에 없는 숫자를 냈다'고 기록한 것은 앞선 화면 확인이 브라우저에 남긴 모의 응답이었고, 서버 로그로 확인해 판정을 정정했다([AI 정확도 평가 기록 '평가 도구를 점검한 기록'](docs/ai-eval.md))." 같은 표 6행 '기록'에 평가 B 기록 링크([docs/평가/2026-10-31-2회차.md](docs/평가/2026-10-31-2회차.md))를 더한다. 5분 발표 시간표에는 넣지 않는다.
- [ ] **Step 4: 낡은 사실**(전 → 후, 그 밖의 문장은 그대로)
  - `PRD.md` 9장 앞 문단(275줄 근처)의 "(…중간 과제 뒤에는 AC01~AC68을 자동 테스트 1465개로 확인한다)" → "AC01~AC79를 자동 테스트 N개로"(updating-prd: 버전 0.39 · 9장 테스트 수 정정, `check_prd_refs.py` OK까지).
  - `README.md` 기능 소개 6번(50줄 근처)·하지 않는 것(61줄)·만들 때 지킨 원칙(80줄)의 다나와 문장에 "공개 배포 기본값은 다나와 자동 조회 꺼짐(켜면 비교 문장이 나온다)"을 한 번씩 맞춘다(평가 B 보안 C6).
  - `README.md` 4-3 마지막 문단의 "결정 30개" → 판정표의 실제 줄 수.
  - `TODO.md` 한눈에 보기 16단계 상태와 '남은 일'은 개발 2회차 준비 커밋에서 이미 고쳤다. 17단계 상태만 실제로 맞춘다(총괄).
  - README·PRD의 "완성 목표일: 2026-10-17 (1주)"와 마감일 '미정'은 제작자 몫이라 고치지 않고 보고에 적는다.
- [ ] **Step 5: 배포 계획 Task 17 보정** — `docs/superpowers/plans/2026-10-28-ai-stage1.md` Task 17:
  - Step 2 끝에 무료 한도를 적을 빈칸 한 줄: "무료 한도(AI Studio에서 읽음): 분당 ○번 · 하루 ○번 · 읽은 날짜 ○ (제작자가 채움, 2026-10-31 평가 B 보정)".
  - Step 4의 "세 주소를 한 번씩(사진 1장, 상품 1개, 녹음 1개)" → "네 주소를 한 번씩(가격표 사진 1장 `/api/read-tag`, 상품 1개 `/api/lowest-price`, 녹음 1개 `/api/voice-fill`, 상품 페이지 캡처 1장 `/api/read-size`)"이고, 끝에 "잘못된 본문 400과 같은 IP 11번째 429(`rate_limited`)는 Gemini를 부르지 않는다. 키를 넣기 전에 한 번 부르면 503 `disabled`가 와야 한다(PRD AC75, 2026-10-31 평가 B 보정)".
  - 바꾼 줄 끝에 `(2026-10-31 평가 B 보정: 전 세 주소 → 후 네 주소)`처럼 무엇이 바뀌었는지 남긴다.
- [ ] **Step 6: README 테스트 수** — 머리 상태 줄과 5장 표의 "(중간 과제 뒤 N개)"를 Step 1의 N으로. 상태 줄에 "2026-10-31 평가 B와 17단계(평가 2회차 개선)"를 더한다.
- [ ] **Step 7: 확인** — 링크 경로가 실제 파일인지(`ls`), 숫자가 Step 1과 같은지, `python .claude/skills/updating-prd/scripts/check_prd_refs.py PRD.md` OK, `python .claude/skills/checking-before-commit/scripts/check_all.py --quick`.
- [ ] **Step 8: 커밋** `docs: gather the P1 correction, fix stale facts and the deploy plan, update test counts`
