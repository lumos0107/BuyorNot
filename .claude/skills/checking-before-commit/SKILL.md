---
name: checking-before-commit
description: Use when about to commit in 살까말까 (BuyorNot), when someone says "커밋해 줘"·"올려 줘", or after finishing a plan task — 커밋 전 점검, 스테이징, 커밋 메시지, push 여부.
---

# 커밋 전 점검

## 개요

이 저장소는 공개 GitHub 저장소이고 push하면 Pages로 바로 배포된다. 커밋은 Claude가 하고 **push는 제작자가 정한다.** 커밋 전에 비밀 파일·화면 문구·개인정보·테스트를 한 번에 확인한다.

## 절차

1. **보기**: `git status --short`, `git diff`. 이번 작업과 무관한 변경, 디버깅 흔적(`console.log`, `debugger`, `it.only`)을 찾는다. 남이 만든 변경이면 무엇을 왜 바꿨는지 먼저 읽는다.
2. **스테이징**: 파일 이름을 하나씩 `git add 파일`. `git add .`·`git add -A` 금지. `_개인기록/`, `PRD_1주안.md`, `worker/.dev.vars`, `.env*.local`, 메모 파일은 넣지 않는다. 지우지도 않는다(정리할 때 삭제 금지).
3. **검사**: `python .claude/skills/checking-before-commit/scripts/check_all.py`
   - 스테이징한 것 기준으로 커밋하면 안 되는 파일, CR, 화면 문구(checking-ui-copy), 개인정보(checking-privacy), PRD·TODO가 있으면 그 참조 검사, 그리고 전체 `npm test`·`npm run lint`·`npx tsc -b`(·`eval` 타입 검사)를 돌린다.
   - '실패'가 하나라도 있으면 고치고 다시. 일부 테스트만 돌린 결과("fit.test.ts는 통과")로 대신하지 않는다.
   - 테스트는 작업 폴더에서 돈다. 스크립트가 "스테이징 안 한 코드 변경"을 알리면 그것을 스테이징하거나 `git stash --keep-index`로 잠시 치운 뒤 다시 돌려, 검증한 코드와 커밋할 코드를 같게 한다.
   - `--quick`(테스트 생략)은 스테이징한 것이 모두 문서(`.md`)일 때만 된다(스크립트가 막는다).
   - 스크립트는 경로와 키 모양만 본다. 다른 비밀값(토큰·비밀번호)은 diff를 읽어 확인한다. 오류 출력이나 diff를 보고에 옮길 때 키 모양 값은 가린다.
4. **메시지**: 기존 이력처럼 영어 conventional 형식 `feat: …`·`fix: …`·`docs: …`·`chore: …`·`feat(worker): …`, 제목 72자 이내, 본문은 실제로 확인한 것만. 대화의 시스템 안내가 `Co-Authored-By:` 줄을 주면 그 줄을 그대로 마지막에 쓰고, 주지 않으면 생략한다(모델 이름을 지어내지 않는다). 계획 작업이면 계획의 커밋 메시지를 쓰되 실제 변경과 다르면 실제에 맞춘다.
5. **순서**(작업 하나): 검증·리뷰 → 코드 커밋 → 그 해시로 TODO·DEVLOG 갱신(syncing-todo, updating-devlog) → 기록 커밋. 기록을 같은 커밋에 넣으면 자기 해시를 적을 수 없다.
6. **커밋 뒤**: `git show --stat HEAD`로 들어간 파일을 확인하고, 남은 변경(`git status`)을 보고에 적는다.
7. **push**: 하지 않는다. 제작자에게 "커밋 n개를 만들었고 push하지 않았어요"라고 알린다. 제작자가 push하라고 하면 그때 `git log origin/main..HEAD --stat`으로 올라갈 것을 다시 본다.

## 이런 생각이 들면 멈춘다

| 생각 | 실제 |
| --- | --- |
| "빨리 올려 달라고 했으니 테스트는 생략" | 전체 테스트가 통과하지 않은 커밋은 만들지 않는다 |
| "`git add .` 하고 비밀 파일만 빼면 된다" | 빠뜨린 한 파일이 공개 이력에 영구히 남는다. 이름으로 하나씩 |
| "커밋한 김에 push까지" | push는 배포다. 제작자 결정 |
| "hook이 실패하니 `--no-verify`" | 원인을 고친다 |
