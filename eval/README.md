# eval: 실제 AI 정확도 평가

실제 Gemini를 부르는 평가 스크립트와 채점기(PRD F43). CI(`npm test`)에서는 돌지 않고 손으로 돌린다.
`npm test`에는 채점기 테스트(`score.test.ts`, `lib.test.ts`)만 들어간다. 결과 기록은 `docs/ai-eval.md`.

| 파일 | 하는 일 |
| --- | --- |
| `score.ts` | F43 채점(칸별 맞음·틀림·못 읽음·표기 없는 칸 채움·더 읽음, 실패·제한 처리)과 분모 세기(`tally`) |
| `lib.ts` | 인자, 정답 파일 읽기·검사, 자료 머리(JPEG 크기·WAV 길이) 검사, 요청, 결과 파일 |
| `readTag.eval.ts` | 가격표 사진 읽기: 우리 서버 `/api/read-tag` |
| `voiceFill.eval.ts` | 말로 담기: 우리 서버 `/api/voice-fill` |
| `lowestPrice.eval.ts` | 다나와 같은 상품 고르기: 서버 없이 페이지 사본 + 서버 함수(`parseDanawaRows`·`buildPickPrompt`·`PICK_SCHEMA`·`pickRows`·`callGemini`) |
| `cases/*.json` | 정답 파일(사례 id·출처·정답만. 자료 파일은 커밋하지 않음) |

## 자료와 결과 위치(커밋하지 않음)

`_개인기록/평가/` 아래에만 둔다(`.gitignore`의 `/_개인기록/`).

- 사진: `사진/{조정용,평가용}/<id>.jpg` · 녹음: `녹음/{조정용,평가용}/<id>.<형식>` · 다나와: `다나와/{조정용,평가용}/<id>.html`(조회한 날 검색 결과 페이지 사본)
- 결과: `결과/<기능>_<묶음>_<시각>.json`(아래 `EvalResultFile` + 실행 기록 `meta` + 사례별 원시 응답 `raw`)

자료를 넣을 때 앱과 같은 전처리를 해 둔다. 사진은 긴 변 1600px 이하 JPEG(앱은 품질 0.85), 녹음은 브라우저가 만든 형식 그대로 20초 이하. 스크립트는 줄이지 않고 검사만 한다(JPEG가 아니거나 1600px보다 크거나 WAV가 20초를 넘으면 멈춤).

## 정답 파일 형식(`cases/*.json`)

배열 하나에 사례마다 객체 하나.

| 칸 | 뜻 |
| --- | --- |
| `id` | 중립 id(`rt01`·`vf11`·`dn11`처럼). 원본 파일 이름·상품명·쇼핑몰 이름을 쓰지 않는다 |
| `file` | `_개인기록/평가/` 기준 경로 `종류/묶음/파일`. 묶음 폴더는 `set`과 같아야 한다 |
| `source` · `license` · `edits` | 출처(주소), 이용 조건(원문과 맞게), 고친 내역(자르기·줄이기 등). 셋 다 비울 수 없다 |
| `set` | `조정용`(프롬프트를 고칠 때 씀) 또는 `평가용`(마지막 판에서 한 번) |
| `group` | 누출 묶음 id. 같은 원본에서 잘라 낸 사진·연속 촬영·같은 문장을 다시 녹음한 것·같은 날 같은 검색어 사본은 같은 묶음. 한 묶음이 조정용과 평가용에 함께 있으면 스크립트가 멈춘다 |
| `uncertain` · `uncertainReason` | 정답이 애매하면 `true`와 이유. 채점은 그대로 하고, 요약에 애매한 사례를 뺀 숫자도 함께 찍는다 |
| `synthetic` | 직접 만든 합성 자료면 `true` |
| `expected` | 아래 기능별 형식 |

- 가격표 사진 `expected`: 사진에 보이는 상품을 **모두** 적은 배열. 상품마다 `{ nameKeywords, price, priceCondition, size, unit, count }`.
  - `nameKeywords`: 공백으로 나눈 이름 키워드(AI 이름에 모두 들어 있으면 짝). 한 상품의 키워드가 다른 상품 이름에도 들어가면(예: '현미녹차'와 '캐모마일 현미녹차') 더 구체적인 상품을 먼저 적는다(정답 순서대로 짝짓기 때문).
  - `price`: 원 정수. 가격표가 없거나 읽을 수 없으면 `null`(표기 없음). 조건 없는 가격이 없고 회원가·카드 할인가만 있으면 그 가격과 `priceCondition`.
  - `size`·`unit`·`count`: 서버 읽기 규칙 그대로(F32). `size`는 낱개 용량, `count`는 포장에 적힌 낱개 수, 단위는 서버가 정규화한 `g`·`kg`·`mL`·`L`·`ea`. 환산하지 않는다. '100g당' 같은 단가 기준은 용량이 아니다(판정 R14: 용량·단위는 표기 없음, AI가 100을 넣으면 채움).
  - 상품이 하나도 없는 사진은 `[]`.
- 녹음 `expected`: `{ nameKeywords, price, reasonKeywords, desire, periodDays }`. 말하지 않은 것은 `null`. `desire`는 1~5, `periodDays`는 1~30.
- 다나와 `expected`: `{ wanted, accepted }`. `wanted`는 앱이 보내는 요청(`LowestPriceRequest`), `accepted`는 사본에서 `parseDanawaRows`로 뽑은 줄 번호(1부터) 중 같은 상품·같은 규격·같은 묶음인 줄(사람이 확인, 없으면 `[]`). 줄 목록은 `--check`로 본다. 광고 줄·가격만 같은 다른 상품은 허용 줄이 아니다.

## 채점(PRD F43)

- 값이 있는 칸: 같으면 맞음, 다르면 틀림, 빈칸이면 못 읽음. 이름·이유는 키워드가 모두 들어 있으면 맞음(AI 값의 띄어쓰기·대소문자는 무시). 숫자는 글자로 바꿔 비교한다(`1.5`와 `1.50`은 JSON에서 같은 수).
- 표기 없는 칸: AI도 비우면 맞음(`blank-ok`, 값이 있는 칸 정확도에는 넣지 않음), 값을 내면 채움(`filled`).
- 가격표: 정답 순서대로 키워드로 AI 상품과 짝짓는다. 짝 없는 정답은 값이 있는 칸 못 읽음·표기 없는 칸 맞음, 짝 없는 AI 상품은 더 읽음(`extra`).
- 다나와: 고른 줄이 모두 허용 줄이고 가장 낮은 가격의 허용 줄을 포함하면 맞음(판정 R15: 가장 낮은 가격이 같은 허용 줄이 여럿이면 그중 하나면 됨. 앱에 보이는 가장 낮은 가격이 같다). 허용 줄 밖을 하나라도 고르거나 가장 낮은 허용 줄을 빠뜨리면 틀림, 허용 줄이 있는데 못 고르면 못 읽음, 허용 줄이 없는데 고르면 채움, 허용 줄이 없고 안 고르면 `blank-ok`.
- 요청: `httpStatus`는 채점용 분류다. 200 = 쓸 수 있는 응답. 429·503(우리 서버의 제한·꺼짐) = `fields: []`, 정확도에서 빼고 따로 센다. `null` = 시간 초과(60초)·네트워크 오류. 그 밖(서버 오류, 200인데 모양이 다른 응답은 502로 적음, 다나와 직접 호출의 Gemini 실패 502)은 실패: 값이 있는 칸 못 읽음, 표기 없는 칸 `unscored`(분모에서 뺌).
- 다시 보내지 않는다(사례당 1번). 다나와 직접 호출은 서버의 `callGemini` 규칙(503일 때만 남은 시간이 15초 이상이면 1번 더)을 그대로 쓴다.

## 실행

```bash
# 1. 자료 검사(모델을 부르지 않음. 다나와는 줄 목록과 허용 줄을 보임)
node eval/readTag.eval.ts --set 평가용 --check
node eval/voiceFill.eval.ts --set 평가용 --check
node eval/lowestPrice.eval.ts --set 평가용 --check

# 2. 정답 잠금: 실행 전에 cases/*.json의 SHA-256을 docs/ai-eval.md에 적는다
sha256sum eval/cases/*.json

# 3. 서버(사진·녹음만): worker/.dev.vars에 GEMINI_API_KEY와 ALLOWED_ORIGINS=http://localhost:5173
npm run worker:dev

# 4. 조정용 → (프롬프트를 고칠 일이 있으면 tuning-prompts) → 평가용 한 번. 한 번에 하나씩.
node eval/readTag.eval.ts --set 조정용 --server http://localhost:8787
node eval/voiceFill.eval.ts --set 조정용 --server http://localhost:8787
node eval/lowestPrice.eval.ts --set 조정용
```

- 사례 사이 7초를 둔다. 스크립트 여러 개를 동시에 돌리지 않는다(결과 폴더의 `.running` 잠금 파일로 막음).
- 고른 묶음의 사례가 0개면 아무것도 보내지 않고 실패로 끝난다(종료 코드 1).
- 평가용 결과가 이미 있으면 `--again` 없이는 멈춘다. 평가용 결과를 본 뒤 프롬프트를 고치면 평가용 자료를 새로 모으고 본 자료는 조정용으로 옮긴다(F43 누출 막기).
- 다나와 스크립트는 키를 `worker/.dev.vars`에서 읽어 쓰고 화면·결과에 남기지 않는다. `--check`는 키를 읽지 않는다.
- 끝나면 분모(사례·요청·실패·제한·꺼짐, 값이 있는 칸·표기 없는 칸·채점하지 않은 칸·더 읽음, 응답 시간)를 모두 찍고 결과 파일 경로를 보인다. 실행 중에 정답 파일이 바뀌면 실패로 끝난다.

## 결과 파일

`EvalResultFile`(`score.ts`) = `{ date, model, feature, set, promptVersion, cases: EvalCase[] }`. `promptVersion`은 프롬프트와 응답 스키마의 SHA-256 앞 8자리, `model`은 `worker/src/gemini.ts`의 모델 이름. 결과 파일에는 이것과 함께 `meta`(정답 파일 해시 전후, Git 커밋·바뀐 파일, 서버 주소, 간격, 재시도 규칙, 애매한 사례 id)와 `raw`(사례별 원시 응답)를 남긴다. 결과 파일은 `_개인기록/평가/결과/`에만 있고 커밋하지 않는다. 성적표(F43)의 요약 파일은 평가용 결과로만 만든다.
