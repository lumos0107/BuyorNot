---
name: checking-ui-copy
description: Use when adding or changing text that 살까말까 (BuyorNot) users see or hear — screen sentences, result and error messages, notices, button names, aria-labels, empty states, sentences built in src/logic — before committing that change. 화면 문구, 안내 문장, 결과 문장, 오류 문구 점검.
---

# 화면 문구 점검

## 개요

살까말까의 화면 문구는 PRD에 적힌 문장 그대로 쓰고, 사라·말라를 말하지 않으며, 근거만 보인다. 금지어·이모지·옛 용어처럼 기계로 볼 수 있는 것은 스크립트가 보고, PRD 문장과 같은지·문맥상 맞는지는 사람이 본다.

## 절차

1. **스크립트**(저장소 루트에서): `git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -`
   - 스테이징한 것은 `git diff --cached`, 새 파일은 `git add -N` 뒤. 인자 없이 실행하면 `src` 전체.
   - **금지**: 문맥을 보고 고친다. 인용이나 PRD가 정한 문구라서 맞는 경우에만 줄 끝에 `// copy-check: ignore <규칙> <이유>`(그 규칙만 꺼진다. 규칙 이름은 스크립트 머리말).
   - **확인할 것**: 조사는 변수의 끝 글자가 늘 같으면(`formatWon()` → '원', 상품 'A'·'B') `// copy-check: ignore josa <이유>`, 아니면 `josa(word, '을/를')`·`withJosa`.
2. **PRD 대조**: 바뀐 문구마다(화면 글, 오류 문구, 빈 상태, `aria-label`·접근 가능한 이름, 문장 함수가 조합해 내는 결과) PRD의 해당 기능 절(`### Fnn`)에서 따옴표 안 문장을 찾아 글자 그대로 비교한다. 다르면 코드를 PRD에 맞춘다. PRD 문장이 틀렸다고 보이면 코드를 고치지 말고 PRD부터(updating-prd).
3. **빠진 것·겹친 것**: 명세에 있는데 화면에 없는 문장(결과의 마지막 안내 줄, 접힌 제목의 요약 등), 같은 판정이 두 번 나오거나 서로 다른 판정이 함께 보이는 곳.

## 규칙 한눈에

| 규칙 | 출처 |
| --- | --- |
| 가격 확인 결과에 '최저가'·'싸요'·'이득'을 쓰지 않는다(할인·묶음 비교의 "…원 저렴해요"는 기존에 정한 문구) | PRD F31 |
| 사라·말라, "충동구매예요" 같은 단정을 쓰지 않는다. 근거만 보이고 결정은 사용자 | PRD F15·F44 |
| '숙려' → '고민', '재검토 가능' → '고민 기간 끝' | PRD 한눈에 보기 용어·문구 점검 |
| 이모지·느낌표 없이 해요체 평서문 | 디자인 규칙 |
| 변수 뒤 조사는 `josa()`·`withJosa()` | `src/logic/number.ts` |
| 판정·결과 문장은 `src/logic`의 문장 함수에서 만들고 화면은 그 결과를 그린다. 단순 버튼·레이블은 기존 화면처럼 컴포넌트에 둔다 | 기존 구조(`fitLines`, `compareLines` 등) |

## 스크립트의 한계

정해진 낱말만 찾는다. 동의어("제일 싼"), 여러 조각으로 나눠 이어 붙인 문장, 실행 중에 조합되는 문장은 놓친다 → 2단계에서 문장 함수의 결과를 테스트 기대값과 함께 읽는다.

## 자주 하는 실수

- 화면 컴포넌트에 결과 문장을 직접 써서 logic의 문장 함수와 겹친다 → 컴포넌트 쪽을 지우고 함수 결과만 쓴다.
- 테스트의 기대 문구를 코드에 맞춰 고친다 → 기대 문구는 PRD에서 복사한다.
- 스크립트가 OK라서 끝낸다 → 2·3단계는 스크립트가 보지 않는다.
