---
name: consulting-gpt
description: Use when the 살까말까 (BuyorNot) 제작자 asks to consult GPT ("GPT랑 상의해", "상의 후 결정해"), at the planned review points (new or changed PRD spec, a new plan, a new skill, a decision delegated to Claude), or when GPT's earlier point needs a reply — GPT 상의, Codex CLI 검토, 검토 기록, 이견 토론.
---

# GPT 상의

## 개요

이 프로젝트는 단계마다 GPT(Codex CLI)와 의견을 맞추고, 모든 상의를 `_개인기록/GPT_검토_기록.md`에 번호를 붙여 남긴다. 개발은 Claude, 결정은 제작자, GPT는 검토자다. GPT 의견은 제작자가 받아들이기 전까지 제안이다.

## 절차

1. **번호**: 기록 파일의 마지막 `# NN.` 다음 번호. 같은 주제를 둘로 나눠 물으면 `NN-가`, `NN-나`.
2. **프롬프트 파일** `_개인기록/gpt/NN_prompt.md`(UTF-8, LF)를 이 순서로 쓴다:
   - `# NN. 제목 (이전 번호 후속)`
   - 역할 줄: `너는 "살까말까"의 ○○ 검토 담당이다. 개발은 Claude, 결정은 제작자. **도구(셸·파일 읽기·웹 검색)를 쓰지 말고 아래 첨부만으로 답하라.** 한국어, N자 이내.`
   - `## 상황`·`## 제약`(로그인·DB 없음, 무료, AI는 읽기만, 서버는 저장 안 함 등 이번 주제에 걸리는 것), `## 이전 상의`(번호와 결론 한두 줄), `## 묻는 것`(번호 매긴 질문), `## 출력`(표 형식과 "한 줄 결론"), `## 첨부 …`(필요한 PRD 절·계획 작업을 그대로 붙임).
   - 첨부는 파일 경로를 주지 말고 내용을 붙인다(GPT는 파일을 읽지 않는다). 키, 개인정보, 평가용 자료의 원본·사례별 정답과 원시 응답은 넣지 않는다. 집계된 점수나 채점 규칙은 넣어도 된다.
3. **실행**(저장소 루트, 오래 걸리므로 백그라운드로):
   ```bash
   codex exec --sandbox read-only --color never -C "$(pwd)" -o "_개인기록/gpt/NN_answer.md" - < "_개인기록/gpt/NN_prompt.md" > "_개인기록/gpt/NN_log.txt" 2>&1
   ```
   답은 `-o` 파일에 남는다. 출력을 버리거나(`> /dev/null`) 같은 상의를 두 번 돌리지 않는다. 실패하면 `NN_log.txt` 끝을 보고, 다시 돌릴 때는 앞 로그를 `NN_log_1.txt`로 남긴다. `--sandbox read-only`는 파일 쓰기만 막으므로, 로그에 셸 실행·파일 읽기 흔적이 있으면 "도구를 쓰지 말라"를 앞에 다시 적고 다시 받는다.
4. **대조 확인** `_개인기록/gpt/NN_check.md`: 첫 줄 `## NN. Claude 대조 확인`, 그다음 표 `| GPT 의견 | 판단 |`. GPT 의견마다 동의/부분 동의/이견과 무엇을 고쳤는지(파일·커밋). 'Claude가 동의함'과 '제작자가 채택함'은 다르다. 제작자 결정이 필요한 것은 "제작자 결정 대기"로 적는다.
5. **기록**: `python .claude/skills/consulting-gpt/scripts/append_record.py NN` → 기록 파일 끝에 프롬프트 전문 / `## NN. GPT 답변 원문` / 대조 확인이 붙는다(LF, 번호 중복 거부).
6. **이견**: GPT 지적이 합당하지 않으면 근거를 붙여 다음 번호로 다시 묻는다. 최대 2라운드. 그래도 맞지 않으면 두 의견을 나란히 적어 제작자에게 묻는다.
7. **보고**: 제작자에게는 결론과 바뀐 것만 짧게, 기록 위치(`GPT_검토_기록.md` NN번)를 함께.

## 자주 하는 실수

- 첨부 없이 "PRD를 읽어 보라"고 한다 → GPT는 도구를 쓰지 않으므로 내용을 붙인다.
- GPT 결론을 제작자 결정처럼 PRD에 적는다 → 제작자가 받아들인 것만 명세에. 출처는 `(GPT NN번)`.
- 대조 확인 없이 원문만 붙인다 → 무엇을 받아들이고 왜 거절했는지가 기록의 핵심이다.
