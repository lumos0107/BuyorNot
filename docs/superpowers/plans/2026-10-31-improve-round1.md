# 살까말까 평가 1회차 개선(개발 1회차) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 다각도 평가 1회차의 결정(판정 R29)대로 PRD v0.35의 F24·F44·F31·F32·F06 보강(AC69~AC74)을 만들고, README를 사실에 맞추고 '스킬로 과제를 한 방법' 장을 더한다.

**Architecture:** 화면 문장은 지금처럼 `src/logic`의 상수·문장 함수(`draft.ts`, `sizeFill.ts`, `tagCompare.ts`, `bundleFill.ts`)에 두고 화면은 그 결과만 그린다. 담은 직후 포커스는 구매 포기 뒤 화면 제목으로 포커스를 옮기는 F18 방식(`WishlistScreen.tsx`의 `decide` → `headingRef.current?.focus()`, 그 아래 '결정 알림')과 F30 '적으러 가기'(카드 안 요소를 id로 찾아 `focus()`)를 그대로 쓴다. 캡처 크게 보기는 `PhotoPreview`가 이미 만든 미리보기 주소를 두 번째 `<img>`에도 쓴다. 서버(`worker/`)·프롬프트·스키마·저장 형식은 건드리지 않는다.

**Tech Stack:** React 19, TypeScript 6, Vite 8, Vitest 5 + Testing Library(jsdom), Node 24. 1·2단계 계획과 같다.

**Spec:** `PRD.md` v0.35 — F06 예시 줄 보강, F24 2026-10-31 보강, F31 '결과 맨 위'·'사진 초안의 링크', F32 단가 줄, F44 2단계 확인 상자 첫 줄·'캡처 크게 보기', 9장 '남은 결정 목록', 11장 AC69~AC74(바뀐 줄을 가리키는 AC53·AC56·AC67). 결정 근거: `docs/평가/2026-10-31-1회차.md` 4장(판정 R29), 원문 `docs/평가/2026-10-31-1회차/`(A_user.md 화면, D_a11y_copy.md 파일:줄, B_professor.md README·스킬). 제작자 판정 칸: `docs/평가/판정표.md`.

**작업 순서(구현 위험이 큰 것부터, README는 마지막):** 평가 결정의 항목과 작업 번호는 이렇게 짝을 짓는다.

| 작업 | 평가 항목 | 위험이 그 자리인 이유 |
| --- | --- | --- |
| Task 1 | P3 담은 직후 새 카드로 | 거의 모든 담기 테스트가 지나는 흐름과 `useWishlist().add`의 반환값을 바꾼다 |
| Task 2 | I1·N1 치수 읽기 문구·캡처 크게 보기 | F31·F32도 쓰는 `PhotoPreview`를 바꾸고, 미리보기 주소 만들기·해제 수를 세는 테스트 세 파일에 걸린다. 기존 AC67 테스트 문장을 바꾼다 |
| Task 3 | P2 사진 초안 옛 링크 | 담기 폼 상태 하나를 더하지만 담기 폼 안에서 끝난다 |
| Task 4 | I2 결과 화면 문구 | 문장 바꾸기와 버튼 하나 숨기기. 기존 테스트 문장을 여럿 바꾼다 |
| Task 5 | README 사실 정정·스킬 장 | 코드 없음. 테스트 수·작업 수를 Task 1~4 뒤의 실제 값으로 적는다 |

## Global Constraints

- PRD v0.35의 새 문장과 동작은 모두 'Claude 결정, 제작자 확인 전'이다. 작업을 시작하기 전에 `docs/평가/판정표.md`에서 그 작업의 줄을 본다. 제작자가 '아니오'나 '바꿈'으로 적었으면 코드보다 PRD를 먼저 고치고(updating-prd) 이 계획의 문장도 바꾼다. 빈칸이면 PRD v0.35 문장대로 만든다.
- 화면 문구는 PRD에 적힌 문장 그대로 쓴다(따옴표 안 글자, `·`, `‘ ’`, 마침표까지). F31 결과에는 '최저가'·'싸요'·'이득'을 쓰지 않고, 어디서도 사라·말라를 말하지 않는다. 문구를 바꾼 작업은 checking-ui-copy 스킬로 점검한다.
- 저장 형식은 바꾸지 않는다(WishItem 새 필드 없음, `schemaVersion: 1`). "방금 담았어요."와 사진 초안 링크 기록은 화면 상태일 뿐 저장하지 않는다.
- 실제 Gemini를 부르지 않는다. 프롬프트(`READ_TAG_PROMPT`·`READ_SIZE_PROMPT` 등)와 응답 스키마, `worker/`는 바꾸지 않는다.
- 앱 값 그대로: `PHOTO_TIMEOUT_MS = 60_000`, `VOICE_TIMEOUT_MS = 60_000`(`src/ai/config.ts`), 사진 긴 변 1600px. `VITE_AI_SERVER_URL`이 없으면 AI 탭·버튼을 그리지 않고, F35와 F44 1단계는 그대로 보인다.
- 앱이 담기 폼에 값을 넣을 때는 빈 칸만 채운다(F21·F31·F33 규칙 그대로).
- 색은 `src/index.css`의 변수만 쓰고 그라데이션·이모지는 쓰지 않는다. 읽은 글은 글자로만 그린다(`dangerouslySetInnerHTML` 금지).
- 테스트의 가짜 전역(createImageBitmap·canvas·URL.createObjectURL·fetch)은 `src/test/aiMocks.ts`의 것만 쓰고, 쓰는 파일은 `afterEach`에서 `vi.unstubAllGlobals()`·`vi.unstubAllEnvs()`·`vi.useRealTimers()`로 되돌린다.
- 테스트 이름은 한국어 문장 + 끝에 검증 번호(예: `'… (AC70)'`). 기대 문장은 PRD에서 복사한다(writing-tests-from-spec).
- 기존 테스트는 고치지 않는다. PRD v0.35가 문장을 바꾼 곳(AC56·AC67과 F31 '결과 맨 위')만 작업에 적힌 대로 고치고, 커밋 메시지에 그 AC를 적는다.
- 작업마다 끝에 `npm test`, `npm run lint`, `npx tsc -b`가 통과해야 한다. 커밋 전 `python .claude/skills/checking-before-commit/scripts/check_all.py`(코드가 있으면 `--quick` 없이). 커밋만 하고 push하지 않는다. `_개인기록/`, `PRD_1주안.md`, `worker/.dev.vars`, `.env*.local`은 커밋하지 않는다. 파일은 LF.
- TODO·DEVLOG는 총괄이 코드 커밋 뒤 그 해시로 고친다(구현자는 고치지 않음, syncing-todo·updating-devlog).

## Review Focus

1. 같은 이름의 물건이 이미 있을 때 담으면 포커스와 "방금 담았어요."가 이름이 아니라 새 물건 id의 카드로 간다 → Task 1 `같은 이름의 물건이 이미 있어도 새로 담은 카드로 포커스가 간다 (AC70)`.
2. 사진 초안 뒤 다른 길로 폼이 바뀌어도(가격 비교에서 담기, 예시 물건 넣기, 두 번째 사진 결과) 링크가 엉뚱하게 지워지거나 안내가 잘못 바뀌지 않는다 → Task 3 `예시 물건 넣기로 폼이 바뀐 뒤 상품명을 고쳐도 링크 안내가 나오지 않는다 (AC69)`, `두 번째 사진 결과가 링크를 채우지 않았으면 첫 사진의 링크 기준이 그대로다 (AC69)`.
3. 캡처를 크게 본 채로 새 캡처를 고르거나, 패널을 접거나, 물건을 결정해도 미리보기 주소가 새지 않고 두 번 해제되지 않는다 → Task 2 `크게 본 채로 새 캡처를 고르면 앞 주소를 한 번만 해제하고 큰 사진도 새 주소를 쓴다 (AC71)`.
4. 담은 직후 줄은 한 카드에만 있고 폼에 다시 입력하면 담은 직후 안내와 함께 사라진다(다른 물건을 결정·삭제해도 엉뚱한 카드에 남지 않는다) → Task 1 `담은 뒤 다른 물건을 구매 포기해도 "방금 담았어요."는 새 카드에만 있다 (AC70)`.
5. 상품이 둘인 묶음 사진에서 단가 가격표와 보통 가격표를 번갈아 고르면 '채우기'가 사라졌다 다시 생기고 다시 누를 수 있다 → Task 4에서 고치는 기존 테스트 `AC56·AC73: 고른 상품이 단가 가격표이면 채우기가 없고, 채울 수 있는 상품으로 바꾸면 다시 보인다`(`App.photoBundle.test.tsx` 609줄).

---

### Task 1: 담은 직후 새 카드로 포커스와 "방금 담았어요." (P3)

**Files:**
- Modify: `src/store/useWishlist.ts`(`add`), `src/screens/WishlistScreen.tsx`(Props `onAdd`, `AddForm`, `WishlistScreen`, `CardProps`·`WishCard`), `src/index.css`(`.just-added`)
- Create: `src/App.justAdded.test.tsx`
- Modify(새 테스트만 더함): `src/App.multitab.test.tsx`(그 파일의 `otherTabWrites`를 쓰는 AC70 넷째 경우)

**Interfaces:**
- Produces:
  - `useWishlist().add(input: NewWishInput): string | null` — 화면에 반영됐으면(저장 실패·손상으로 화면에만 반영된 경우 포함) 새 물건 id, 다른 탭 기록을 불러와 반영하지 않았으면 null. `newId()`를 먼저 만들고 `commit(...)`이 true면 그 id.
  - `WishlistScreen` Props `onAdd: (input: NewWishInput) => string | null | void`(id를 돌려주지 않는 호출부와 `vi.fn()`도 그대로 쓴다. 문자열일 때만 포커스를 옮긴다)
  - `const JUST_ADDED = '방금 담았어요.'`(WishlistScreen.tsx), `const cardNameId = (id: string) => \`card-name-${id}\``, `const justAddedId = (id: string) => \`just-added-${id}\``
  - `AddForm`의 새 prop `onJustAdded: (id: string | null) => void`. 담은 직후 안내 상태를 `{ id: string | null; text: string } | null`로 바꾸고, 그 id가 바뀔 때마다 `useEffect`에서 `onJustAdded(id)`를 부른다(그리는 중에 부모 상태를 바꾸지 않게). 안내가 지워지는 모든 길(지금 `setAdded(null)`이 있는 곳)에서 id도 null이 된다.
  - `CardProps`에 `justAdded: boolean`. 카드 이름 `<p className="card-title">`에 `id={cardNameId(item.id)}`, `tabIndex={-1}`, `justAdded`일 때 `aria-describedby={justAddedId(item.id)}`. 이름 줄(`card-row`) 바로 아래에 `justAdded`일 때만 `<p id={justAddedId(item.id)} className="just-added">{JUST_ADDED}</p>`(알림 칸이 아님, PRD F24 보강).
  - `WishlistScreen`: `const [justAdded, setJustAdded] = useState<string | null>(null)`, `useEffect(() => { if (justAdded) document.getElementById(cardNameId(justAdded))?.focus() }, [justAdded])`, 각 `WishCard`에 `justAdded={item.id === justAdded}`.
  - `.just-added { color: var(--accent); font-weight: 600; }`

- [ ] **Step 1: 실패하는 테스트** — `src/App.justAdded.test.tsx`(App 전체, `localStorage`에 고민 중인 물건 둘: 남은 1일·2일, `App.f24.test.tsx`처럼 저장 형식 그대로 넣음). 포커스는 `document.activeElement`로 본다.
  - `물건 둘이 있을 때 3일로 담으면 셋째 카드 이름으로 포커스가 가고 그 아래에 "방금 담았어요."가 보인다 (AC70)` — `screen.getAllByRole('article')[2]`의 이름이 '나이키 에어포스', `document.activeElement?.closest('article')`가 그 카드, `expect(document.activeElement).toHaveAccessibleDescription('방금 담았어요.')`, 그 카드 안 `getByText('방금 담았어요.')`, 다른 두 카드에는 `queryByText('방금 담았어요.')`가 null, 폼의 `getByRole('status', { name: '담은 물건' })`은 그대로 있음
  - `담은 뒤 상품명에 한 글자 넣으면 "방금 담았어요."와 담은 직후 안내가 함께 사라진다 (AC70)`
  - `이어서 다른 물건을 담으면 그 카드로 옮겨 가고 줄은 그 카드에만 있다 (AC70)`('책장', 1일)
  - `담은 뒤 새로고침하면 "방금 담았어요."는 없다 (AC70)`(unmount 뒤 다시 render)
  - `같은 이름의 물건이 이미 있어도 새로 담은 카드로 포커스가 간다 (AC70)`(이미 있는 '나이키 에어포스' 하나 + 같은 이름 담기 → 포커스 카드의 남은 시간이 '3일 남음')
  - `담은 뒤 다른 물건을 구매 포기해도 "방금 담았어요."는 새 카드에만 있다 (AC70)`
  - `src/App.multitab.test.tsx` '물건 기록: 여러 탭' 안에 `다른 탭이 먼저 저장해 담기가 반영되지 않으면 포커스를 옮기지 않고 "방금 담았어요."도 없다 (AC70)` — `otherTabWrites(STORAGE_KEY, …, false)` 뒤 `addWish`, `expect(wishForm().getByRole('button', { name: '담아 두기' })).toHaveFocus()`, `screen.queryByText('방금 담았어요.')` null
- [ ] **Step 2: 실패 확인** — `npx vitest run src/App.justAdded.test.tsx src/App.multitab.test.tsx` → 포커스·문장 단언으로 실패(모듈 없음이 아니라 기대값 불일치까지 본다).
- [ ] **Step 3: 구현** — 위 Interfaces대로. `App.tsx`의 `onAdd={wishlist.add}`는 그대로 둔다.
- [ ] **Step 4: 통과 확인** — `npm test`(기존 담기 테스트 전부 포함), `npm run lint`, `npx tsc -b`.
- [ ] **Step 5: 커밋** `feat: focus the new card after 담아 두기 and say 방금 담았어요 (F24, AC70)`

### Task 2: 치수 읽기 "AI가 읽은 내용"과 캡처 크게 보기 (I1·N1)

**Files:**
- Modify: `src/logic/sizeFill.ts`(`CandidateView`, `candidateView`), `src/screens/ai/SizePhotoFill.tsx`(라디오 이름, `PhotoPreview` 호출), `src/screens/ai/PhotoPreview.tsx`, `src/index.css`(`.photo-large`)
- Modify(테스트): `src/logic/sizeFill.test.ts`, `src/App.fitPhoto.test.tsx`

**Interfaces:**
- Produces (`sizeFill.ts`):
  - `CandidateView`에 `choice: string` — `"{label} · "`(label이 있을 때) + `AI가 읽은 내용: ‘{text}’`. 라디오 이름.
  - `read`는 `` `${choice} · 사진과 같은지 확인해 주세요` ``. 확인 상자 첫 줄(단위 mixed일 때도 첫 줄).
- Produces (`PhotoPreview.tsx`): `PhotoPreview({ file, enlarge }: { file: Blob; enlarge?: { label: string; alt: string } })`. `enlarge`가 있으면 작은 미리보기 바로 아래 `<details>`(모양은 `index.css`의 `details > summary` 그대로) + `<summary>{enlarge.label}</summary>` + `<img alt={enlarge.alt} className="photo-large" />`. 두 `<img>`의 `src`는 같은 효과 안에서 만든 주소 하나이고 정리에서 한 번만 해제한다. F31·F32 호출(`enlarge` 없음)은 지금과 같은 DOM이다.
- `SizePhotoFill`: `<PhotoPreview file={photo} enlarge={{ label: '캡처 크게 보기', alt: '고른 캡처' }} />`, 라디오 이름은 `candidateView(candidate, null, current).choice`.
- `.photo-large { display: block; width: 100%; height: auto; border: 1px solid var(--line); border-radius: 8px; }`

- [ ] **Step 1: 기존 테스트를 PRD v0.35에 맞춤(AC67·AC71)** — `sizeFill.test.ts`와 `App.fitPhoto.test.tsx`의 `READ_LINE`을 `'AI가 읽은 내용: ‘제품 크기: 가로 32 x 깊이 25 x 높이 47cm’ · 사진과 같은지 확인해 주세요'`로, `App.fitPhoto.test.tsx:344-345`의 라디오 이름을 `'접었을 때 · AI가 읽은 내용: ‘접었을 때 30 x 20 x 10cm’'`·`'펼쳤을 때 · AI가 읽은 내용: ‘펼쳤을 때 60 x 40 x 10cm’'`로, `:351` 첫 줄을 `'접었을 때 · AI가 읽은 내용: ‘접었을 때 30 x 20 x 10cm’ · 사진과 같은지 확인해 주세요'`로, 두 파일 머리 주석의 "적힌 내용" 가정을 새 문장으로 바꾼다. 테스트 이름의 '적힌 내용'은 'AI가 읽은 내용'으로.
- [ ] **Step 2: 실패하는 새 테스트** — `sizeFill.test.ts`: `라디오 이름은 확인 요청 없이 label과 AI가 읽은 내용만이에요 (AC71)`(`choice` 두 경우), `확인 상자 첫 줄은 AI가 읽은 내용 뒤에 사진과 같은지 확인해 달라고 붙여요 (AC71)`(단위 mixed 포함). `App.fitPhoto.test.tsx`:
  - `응답을 받은 뒤 캡처 크게 보기를 누르면 같은 주소의 큰 사진이 보이고 새 주소·요청은 없다 (AC71)` — `getByRole('img', { name: '고른 캡처' })`가 보이고 `src`가 작은 미리보기 `img`의 `src`와 같음, `urls.created` 길이 그대로, `server.callsTo(READ)` 1번
  - `다시 누르면 큰 사진이 접힌다 (AC71)`(`not.toBeVisible()`)
  - `크게 본 채로 넣으면 미리보기와 큰 사진이 함께 사라지고 주소가 해제된다 (AC71)`
  - `읽는 중에도 캡처 크게 보기로 큰 사진을 볼 수 있고 요청은 1번이다 (AC71)`
  - `크게 본 채로 새 캡처를 고르면 앞 주소를 한 번만 해제하고 큰 사진도 새 주소를 쓴다 (AC71)`
  - F31·F32 화면은 `enlarge`를 넘기지 않으므로 `App.photoTag.test.tsx`·`App.photoBundle.test.tsx`를 고치지 않고 통과하는 것으로 확인한다.
- [ ] **Step 3: 실패 확인** — `npx vitest run src/logic/sizeFill.test.ts src/App.fitPhoto.test.tsx`.
- [ ] **Step 4: 구현** — 위 Interfaces대로. 파일 끝 `afterEach`의 주소 짝 맞추기 단언이 그대로 통과해야 한다.
- [ ] **Step 5: 통과 확인** — `npm test`(`App.photoTag.test.tsx`·`App.photoBundle.test.tsx`의 미리보기 주소 단언 포함), `npm run lint`, `npx tsc -b`, `git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -`.
- [ ] **Step 6: 커밋** `feat: say AI가 읽은 내용 and let the capture be viewed large (F44, AC67, AC71)` — 본문에 기존 AC67 테스트 문장을 바꾼 이유(PRD v0.35 R29-I1)를 적는다.

### Task 3: 상품명을 바꾸면 사진 초안의 다나와 링크를 지운다 (P2)

**Files:**
- Modify: `src/logic/draft.ts`, `src/screens/WishlistScreen.tsx`(`AddForm`)
- Modify(새 테스트만 더함): `src/logic/draft.test.ts`, `src/screens/WishlistScreen.photoDraft.test.tsx`

**Interfaces:**
- Produces (`draft.ts`):
  - `export type PhotoLink = { name: string; url: string }` — 사진 결과가 빈 링크 칸을 채운 직후의 상품명과 링크
  - `export const PHOTO_LINK_CLEARED = '상품명을 바꿔서 가격표 사진에서 가져온 다나와 검색 링크를 지웠어요. 바꾼 상품명의 검색 링크는 담은 뒤 카드의 ‘비교해 볼 곳’에 있어요.'`
  - `export function isStaleLink(link: PhotoLink | null, form: { name: string; url: string }): boolean` — `link !== null && form.url === link.url && form.name.trim() !== link.name.trim()`
- `AddForm` 상태 `photoLink: PhotoLink | null`:
  - 사진 결과가 링크를 채웠으면(지금 `setDraftFilledLink`가 true가 되는 조건) `{ name: merged.name, url: merged.url }`. 링크를 채우지 않은 사진 결과와 가격 비교 결과(F21)는 그대로 둔다.
  - 링크 칸을 손으로 고치면, 담으면, 예시 물건 넣기로 폼이 채워지면 null.
  - 상품명 칸이 바뀔 때 `isStaleLink(photoLink, { name: 새 값, url: raw.url })`이면 링크 칸을 ''로, `draftNotice`를 `PHOTO_LINK_CLEARED`로(같은 알림 칸의 글을 바꿈), `photoLink`를 null로.

- [ ] **Step 1: 실패하는 테스트** — `draft.test.ts`: `isStaleLink는 링크가 그대로이고 앞뒤 공백을 뺀 상품명이 다를 때만 참이에요 (AC69)`(null, 공백만 더함, 링크를 고침, 이름을 고침 네 경우). `WishlistScreen.photoDraft.test.tsx`(그 파일의 `screenWith`·`PHOTO`·`GUIDE`):
  - `사진 결과 뒤 상품명을 고치면 링크를 지우고 안내를 바꾼다 (AC69)` — 링크 칸 `toHaveValue('')`, `getByText(PHOTO_LINK_CLEARED 문장)`, `queryByText(GUIDE)` null
  - `그 뒤 이유를 적고 담으면 링크 없이 담긴다 (AC69)` — `onAdd`의 인자에 `url: null`(빈 링크 칸은 `validateWishInput`의 `parseUrl`이 null로 바꾼다)
  - `상품명 끝에 공백만 더하면 링크와 안내가 그대로다 (AC69)`
  - `링크를 손으로 고친 뒤 상품명을 고치면 고친 링크와 안내가 그대로다 (AC69)`
  - `상품명·가격을 적어 둔 폼에서 사진이 링크만 채운 뒤 상품명을 고치면 링크를 지운다 (AC69)`
  - `링크를 적어 둔 폼은 사진 결과 뒤 상품명을 고쳐도 링크가 그대로다 (AC69)`
  - `지운 링크는 상품명을 되돌려도 다시 넣지 않는다 (AC69)`
  - `가격 비교에서 담기 뒤 상품명을 적어도 링크·안내가 그대로다 (AC69)`(draft `{ source: 'compare', … }`)
  - `예시 물건 넣기로 폼이 바뀐 뒤 상품명을 고쳐도 링크 안내가 나오지 않는다 (AC69)`(`exampleFill` prop을 올려 다시 그림)
  - `두 번째 사진 결과가 링크를 채우지 않았으면 첫 사진의 링크 기준이 그대로다 (AC69)`
- [ ] **Step 2: 실패 확인** — `npx vitest run src/logic/draft.test.ts src/screens/WishlistScreen.photoDraft.test.tsx`.
- [ ] **Step 3: 구현** — 위 Interfaces대로. 지금의 `draftFilledLink`(그린 뒤 링크 영역 펼치기)는 그대로 둔다.
- [ ] **Step 4: 통과 확인** — `npm test`, `npm run lint`, `npx tsc -b`, `git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -`.
- [ ] **Step 5: 커밋** `fix: clear the photo-draft Danawa link when the product name changes (F31, AC69)`

### Task 4: 결과 화면 문구 — F31 맨 위 줄, F32 단가 거절, 가격 비교 예시 안내 (I2)

**Files:**
- Modify: `src/logic/tagCompare.ts`, `src/screens/ai/TagPhotoCheck.tsx:378`, `src/logic/bundleFill.ts`(`unitPriceMessage`), `src/screens/ai/BundlePhotoFill.tsx:213-216`(채우기 버튼), `src/screens/CompareScreen.tsx:611`
- Modify(테스트): `src/logic/tagCompare.test.ts`, `src/App.photoTag.test.tsx`, `src/logic/bundleFill.test.ts`, `src/App.photoBundle.test.tsx`, `src/App.exampleIntro.test.tsx`

**Interfaces:**
- Produces (`tagCompare.ts`):
  - `export const PRICE_GAP_NOTE = '가격 차이로는 필요한 물건인지 알 수 없어요.'`
  - `export const DANAWA_OFF_NOTE = '지금은 다나와 가격을 자동으로 가져오지 않아요. 가격은 다나와에서 직접 확인해 주세요.'`
  - `export function resultTopLine(status: LowestPriceResponse['status']): string | null` — found·not_confirmed → `PRICE_GAP_NOTE`, off → `DANAWA_OFF_NOTE`, unavailable → null(그 자리는 지금의 "다나와 결과를 가져오지 못했어요."가 맨 위가 된다)
- `TagPhotoCheck`: `<p>가격 차이는 필요 여부를 판단해 주지 않아요.</p>`를 `resultTopLine(online.status)`가 있을 때만 그 글로 바꾼다. 제목 "온라인 가격 확인 결과"와 포커스는 그대로.
- `bundleFill.ts`: `unitPriceMessage(basis)` → `` `AI가 이 가격을 ${basis}당 가격으로 읽었어요. 묶음 전체 가격이 아니라서 채우지 않았어요. 사려는 묶음의 전체 가격과 용량·개수를 직접 입력해 주세요.` ``
- `BundlePhotoFill`: 고른 상품이 거절(`fill?.ok === false`)이면 '채우기' 버튼을 그리지 않고 '취소'만 둔다. 그 밖은 지금 그대로(`disabled={!canApply}`).
- `CompareScreen.tsx` `ExampleIntro`의 안내: `처음에는 예시 값이 들어 있어요. 비교할 금액과 조건으로 바꿔 보세요. ‘초기화’를 누르면 입력칸을 비우고, ‘예시 넣기’를 누르면 예시 값을 다시 넣어요.` `startWithExample`은 그대로.

- [ ] **Step 1: 기존 테스트를 PRD v0.35에 맞춤** — `App.photoTag.test.tsx`의 `TOP_NOTE`를 `'가격 차이로는 필요한 물건인지 알 수 없어요.'`로 바꾸고, off 응답인 `:805-807`(https가 아닌 검색 주소)은 `TOP_NOTE` 대신 `DANAWA_OFF_NOTE` 문장을 단언한다(AC72). `bundleFill.test.ts:117·134`의 메시지를 새 문장(100g·1kg)으로, `App.photoBundle.test.tsx:33`의 `UNIT_PRICE`를 새 문장(100g)으로, 단가 가격표를 고른 상태의 `expect(confirmButton(B)).toBeDisabled()` 두 곳(530줄, 613줄)을 '채우기' 버튼이 없다는 단언(`box(B).queryByRole('button', { name: '채우기' })` null)으로 바꾸고, 609줄 테스트 이름을 `AC56·AC73: 고른 상품이 단가 가격표이면 채우기가 없고, 채울 수 있는 상품으로 바꾸면 다시 보인다`로 바꾼다(그 뒤 `toBeEnabled()` 단언은 그대로). 415·570·588줄(단위를 아직 안 고른 경우 등)은 그대로 둔다.
- [ ] **Step 2: 실패하는 새 테스트**
  - `tagCompare.test.ts`: `결과 맨 위 줄은 다나와 상태마다 정해진 문장이고 못 읽었으면 없어요 (AC72)`(네 상태)
  - `App.photoTag.test.tsx`: `found·not_confirmed면 제목 다음 첫 줄이 가격 차이 문장이다 (AC72)`, `off면 첫 줄이 자동으로 가져오지 않는다는 문장이고 가격 차이 문장은 없으며 다나와에서 직접 보기 링크가 있다 (AC72)`, `unavailable이면 첫 줄이 다나와 결과를 가져오지 못했어요이고 가격 차이 문장은 없다 (AC72)`. "제목 다음 첫 줄"은 결과 영역에서 제목 `h4` 다음 형제 요소의 글로 본다.
  - `App.photoBundle.test.tsx`: `100mL당 단가 가격표(6480원·355mL·6개)면 새 문장과 취소만 보이고 칸은 그대로다 (AC73)`(문장의 '100mL' 자리는 응답의 priceBasis), `그 상자에서 취소하면 사진으로 채우기로 포커스가 돌아간다 (AC73)`. 상품 둘을 번갈아 고르는 경우는 Step 1에서 고친 609줄 테스트가 본다.
  - `App.exampleIntro.test.tsx`: `할인 비교와 묶음상품 비교의 이럴 때 써요 안내가 처음부터 채워진 칸과 맞다 (AC74)`(두 탭 문장, 예전 "‘예시 넣기’를 누르면 아래 칸이 채워져요."는 없음, A안 상품 금액 '80000'), `초기화 뒤와 예시 넣기 뒤에도 같은 안내다 (AC74)`
- [ ] **Step 3: 실패 확인** — 위 다섯 파일만 `npx vitest run …`.
- [ ] **Step 4: 구현** — 위 Interfaces대로.
- [ ] **Step 5: 통과 확인** — `npm test`, `npm run lint`, `npx tsc -b`, `git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -`(금지 0개), 바꾼 문장마다 PRD 따옴표 안 문장과 글자 그대로인지 checking-ui-copy 2단계로 대조.
- [ ] **Step 6: 커밋** `fix: say why on the F31 result, F32 unit-price refusal and the example notice (AC56, AC72-AC74)` — 본문에 바꾼 기존 테스트와 그 AC를 적는다.

### Task 5: README 사실 정정과 "스킬로 과제를 한 방법" 장

**Files:** Modify `README.md`

updating-devlog 스킬의 'README에서 고치는 곳'을 따른다. 장단점·개선점·결론의 학생 주장 문장은 다시 쓰지 않는다(판정 R29 (1)·(3): 사실·숫자만, 학생 서술 칸은 비움). 이 작업은 Task 1~4 커밋 뒤에 한다(테스트 수·작업 수를 그 뒤의 실제 값으로).

- [ ] **Step 1: 숫자를 실제 값으로 모은다** — `npm test`의 통과 수(N), `TODO.md`의 `- [x]` 수와 체크박스 전체 수, `git log --oneline -1`. 짐작한 숫자는 쓰지 않는다.
- [ ] **Step 2: 정해진 곳의 사실 정정**(전 → 후, 그 밖의 문장은 그대로)
  - 6줄 상태: 15-8a(치수 읽기 40초 실패 고침), 2026-10-31 다각도 평가 1회차와 16단계(평가 1회차 개선) 상태를 더하고 "자동 테스트 1465개 통과(2026-10-31)" → "자동 테스트 N개 통과(날짜)".
  - 1-1: "완성 목표일: 2026-10-17 (1주)" 아래에 "- 중간 과제(인공지능 프로그래밍) 마감: 미정 (제작자 확인 필요)"(PRD 머리말과 같게).
  - 1-4의 11번: 끝에 "읽은 치수는 'AI가 읽은 내용'으로 보여 주고, 고른 캡처를 크게 보며 사진과 같은지 확인할 수 있다." 한 문장.
  - 3장: "작업 221개 중 215개를 마쳤습니다" → Step 1의 수. 표의 15 행에 "15-8a 완료", 새 행 `| 중간 과제 (평가) | 16 평가 1회차 개선: 담은 직후 새 카드, 치수 읽기 문구·크게 보기, 사진 초안 링크, 결과 화면 문구, README (16-1~16-5) | {상태} |`. "이렇게 나눈 이유"의 "단계마다 배포 링크로 바로 확인했다." 뒤에 "(중간 과제 14단계부터는 브랜치 `ai-stage1`에서 로컬로만 확인했고 아직 배포하지 않았다.)".
  - 장단점 장의 "단계별 코드 검토 일부는 GPT(Codex CLI)에 맡겼고(13단계부터 중단)" → "(13단계에서 중단했다가 10/13 목적 점검부터 다시 상의했고, 중간 과제에서는 결정·명세·계획을 GPT 33~50번으로 상의했다)".
  - 장단점 장 표의 "(자동 테스트 532개)" → "(자동 테스트 1주 과제 532개, 중간 과제 뒤 N개)".
  - 2장의 "(AI 화면은 아직 스크린샷이 없습니다)"는 사실이므로 그대로 둔다.
- [ ] **Step 3: 새 장** `## 4. 스킬로 과제를 한 방법`을 3장 뒤에 넣고 뒤의 장 번호를 하나씩 민다(장단점 5, 개선점 6, 결론 7, 실행 8). 개선점 장의 "(4절의 단점에서)"만 "(5절의 단점에서)"로 고친다. 내용은 사실과 표만:
  - 한 단락: 스킬이 무엇이고 어디 있는지(`.claude/skills/<이름>/SKILL.md`, 기계로 보는 규칙은 `scripts/`), 자세한 표는 [.claude/skills/README.md](.claude/skills/README.md).
  - 표 `| 스킬 | 언제 쓰나 | 이 과제에서 쓴 곳 | 스크립트 |` 13줄. '언제 쓰나'·'스크립트'는 `.claude/skills/README.md` 표에서 옮긴다. '쓴 곳'은 기록에 있는 것만: 구현 서브에이전트 규칙의 기본 스킬 `writing-tests-from-spec`·`checking-before-commit`(`.superpowers/sdd/*/project-rules.md`), `testing-ai-screens`(DEVLOG 751·818·961줄), `applying-ai-results`(805·818·961줄), `evaluating-ai`·`checking-privacy`(844·896줄, 판정 R5에서 주석 우회를 막도록 스크립트를 고침), `adding-ai-endpoint`(948줄), `updating-prd`의 `check_prd_refs.py`(626·795·808·821줄, 평가 1회차 P5에서 대조 검사를 더함), `syncing-todo`의 `mark_done.py`(14·15단계 완료 줄). 기록을 찾지 못한 칸은 "기록 없음"이라고 쓴다.
  - 표 `| 묶음 | 스킬 없이 → 함께 | 토큰 | 시간 |` 세 줄(첫 묶음·두 번째 묶음·구현 중 추가)과 한계 한 줄: `.claude/skills/README.md` '시험 결과'의 숫자 그대로(합계 토큰 약 26%·시간 약 31% 감소, 약 20%·약 40% 감소와 '새 AI 기능 틀'을 빼면 약 11.5%, `testing-ai-screens` 버그 18개 중 16개 → 22개 중 20개, 과제마다 1회 비교).
  - 표 `| 단계 | 한 일 |`로 평가 과정: 평가 에이전트 5명(실제 사용자·교수·보안·접근성·기능 기획) → 세 관점 토론 2라운드 → GPT 50번 → 판정 R29 → 고정 기준 [docs/평가/평가기준.md](docs/평가/평가기준.md), 원문 [docs/평가/2026-10-31-1회차.md](docs/평가/2026-10-31-1회차.md). 평가가 찾은 스킬 규칙 위반(P5)과 그 뒤 스크립트 검사를 더한 사실 한 줄, 제작자 판정표 [docs/평가/판정표.md](docs/평가/판정표.md).
  - 학생 서술 칸 셋을 비워 둔다. 각 칸은 `> **(제작자가 직접 쓸 칸)** 스킬을 만들며 배운 점:`처럼 굵은 글씨 제목과 빈 인용 한 줄이고, 바로 위에 `<!-- 학생 서술 칸: 비워 둠 (판정 R29 (3)) -->`. 칸 제목: "스킬을 만들며 배운 점", "스킬이 없었다면 틀렸을 일 하나", "판정표를 보고 바꾼 결정".
- [ ] **Step 4: 학생 말이 필요한 어긋남은 고치지 않고 확인만** — 아래가 README에 그대로 남는지 본다(제작자 몫, 보고에 그대로 옮긴다): ① 장단점 장에 AI 단계(서브에이전트 구현·리뷰 + 스킬)의 장단점이 없다 ② 단점 셋째 "직접 화면을 확인해야 했다"와 달리 AI 단계의 '(제작자) 로컬 확인'은 서브에이전트가 Playwright로 했다(DEVLOG 987줄, 평가 B H4) ③ 개선점 장의 "알림이 없어 고민 기간이 끝나도 직접 열어야 한다"와 F35 캘린더(알림 보장은 아님) ④ 개선점 장에 AI 쪽 한계(실제 자료 정확도 없음, 서버 배포 전, 숫자 반복 위험)가 없다 ⑤ 결론에 AI·스킬로 배운 점이 없다.
- [ ] **Step 5: 확인** — README의 링크 경로가 실제 파일인지(`ls`), 숫자가 Step 1 값과 같은지, `python .claude/skills/checking-before-commit/scripts/check_all.py --quick`.
- [ ] **Step 6: 커밋** `docs: correct README facts and add the skills chapter skeleton`
