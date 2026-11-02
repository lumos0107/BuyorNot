# Claude 인계 이후 GPT 커밋 목록

- 기준: Claude 인계 당시 `saving` HEAD `dda8c0d` 다음부터 인계 문서 작성 직전 완료 개발 HEAD `c9141ba`까지.
- 총 104개. 날짜와 제목은 `git log --reverse --format`의 실제 출력이다.
- 이 목록은 커밋한 작업만 담는다. 중단된 29~31단계 UX 변경은 별도 인계 문서의 미커밋 절에 있다.

| 번호 | 날짜 | 커밋 | 제목 |
| ---: | --- | --- | --- |
| 1 | 2026-11-01 | `67ad0b1` | refactor: share the storage check helpers in guards.ts (1a review M8) |
| 2 | 2026-11-01 | `1445b4f` | docs: plan saving phase 1b and record storage guard work |
| 3 | 2026-11-01 | `8be9237` | feat: call the fixed cost storage notice 고정비 (F45, AC102) |
| 4 | 2026-11-01 | `a3f5b86` | feat: store bills in a new key and carry them in backup v2 (F53, F20) |
| 5 | 2026-11-01 | `82169d6` | docs: record fixed cost notice and bills storage tasks |
| 6 | 2026-11-01 | `0787cbc` | feat: record and compare monthly utility bills (F53, AC113-AC115) |
| 7 | 2026-11-01 | `ec3afd4` | docs: record utility bill screen task |
| 8 | 2026-11-01 | `b3a7e16` | feat: let recurring deliveries repeat every n weeks (F45, AC100-AC101) |
| 9 | 2026-11-01 | `4b7fbb2` | docs: record weekly delivery task |
| 10 | 2026-11-01 | `0f3bb97` | docs: use verified phone comparison link in F52 |
| 11 | 2026-11-01 | `6d1c752` | feat: show contract dates and phone comparison link (F52, AC111-AC112) |
| 12 | 2026-11-01 | `392c67e` | docs: record contract and phone link task |
| 13 | 2026-11-01 | `952b577` | feat: show subscriptions used for the same thing (F51, AC109-AC110) |
| 14 | 2026-11-01 | `585045f` | docs: record overlapping membership task |
| 15 | 2026-11-01 | `4ab399a` | feat: record why and when a fixed cost price changed (F50, F47) |
| 16 | 2026-11-01 | `0971572` | docs: record price change task |
| 17 | 2026-11-01 | `dff0adb` | feat: count my own price cuts in reduced fixed costs (F48, AC107) |
| 18 | 2026-11-01 | `cfe0dd8` | docs: record reduced fixed cost task |
| 19 | 2026-11-01 | `93a52d5` | feat: add calendar event before a free trial ends (F46, AC103) |
| 20 | 2026-11-01 | `0edd19d` | docs: complete saving phase 1b and update test counts |
| 21 | 2026-11-01 | `f15ff2a` | docs: specify saving phase 2 pantry and small spending |
| 22 | 2026-11-01 | `0b570b4` | feat: store pantry and small spending with backup v3 (F20, F54, F59) |
| 23 | 2026-11-01 | `121c45d` | docs: record phase 2 storage task |
| 24 | 2026-11-01 | `6e94c6d` | docs: specify pantry screen and storage messages |
| 25 | 2026-11-01 | `c4db428` | feat: track items at home and what is running low (F54, AC117-AC118) |
| 26 | 2026-11-01 | `6753c77` | docs: record pantry inventory task |
| 27 | 2026-11-01 | `d8a86e7` | feat: show expiring ingredients and discarded records (F55, AC119-AC120) |
| 28 | 2026-11-01 | `3b676b0` | docs: record expiring ingredient task |
| 29 | 2026-11-01 | `500ed5d` | feat: compare manually recorded pantry prices (F56, AC121-AC122) |
| 30 | 2026-11-01 | `d1e240b` | docs: record pantry price task |
| 31 | 2026-11-01 | `df2052a` | docs: specify cooked amount as separate record |
| 32 | 2026-11-01 | `e0351e3` | feat: track meals made from ingredients at home (F57, AC123-AC124) |
| 33 | 2026-11-01 | `8e03b80` | docs: record meals at home task |
| 34 | 2026-11-01 | `309639a` | docs: specify stock skip notices |
| 35 | 2026-11-01 | `88deb28` | feat: record purchases skipped because an item is at home (F58) |
| 36 | 2026-11-01 | `3a18fb8` | docs: record stock skip task |
| 37 | 2026-11-01 | `2895f2b` | docs: specify small spending screen messages |
| 38 | 2026-11-01 | `77345b7` | feat: track small recurring spending and skipped purchases (F59) |
| 39 | 2026-11-01 | `f4811ae` | docs: record small spending task |
| 40 | 2026-11-01 | `37be816` | docs: specify delivery comparison copy and order boundary |
| 41 | 2026-11-01 | `6f62128` | feat: compare delivery app totals and order thresholds (F60) |
| 42 | 2026-11-01 | `6a4b518` | fix: choose latest same-day pantry price and stabilize AC19 boundary test |
| 43 | 2026-11-01 | `18644cd` | docs: complete saving phase 2 and update test counts |
| 44 | 2026-11-01 | `31a22ab` | docs: specify saving phase 3 before and after buying |
| 45 | 2026-11-01 | `68f9a70` | feat: add optional before and after purchase fields (F61-F67, F20) |
| 46 | 2026-11-01 | `afe9b9b` | docs: record phase 3 storage task |
| 47 | 2026-11-01 | `bd865b3` | feat: show installment totals before buying (F61, AC133-AC134) |
| 48 | 2026-11-01 | `e4fc2a8` | docs: record installment total task |
| 49 | 2026-11-01 | `6e58690` | feat: show cost per use and borrowing alternatives (F62) |
| 50 | 2026-11-01 | `f700986` | docs: record cost per use task |
| 51 | 2026-11-01 | `61ba7f0` | feat: point out matching items already at home (F63, AC137-AC138) |
| 52 | 2026-11-01 | `fecbe27` | docs: record pantry duplicate task |
| 53 | 2026-11-01 | `38d3af7` | feat: compare bulk use duration with shelf life (F64, AC139-AC140) |
| 54 | 2026-11-01 | `2f83f54` | docs: record bulk use task |
| 55 | 2026-11-01 | `369b118` | feat: track a target price and manually seen prices (F65, AC141-AC142) |
| 56 | 2026-11-01 | `661c319` | docs: record target price task |
| 57 | 2026-11-01 | `d62ab99` | docs: specify return and resale amount notices |
| 58 | 2026-11-01 | `0e4fd28` | docs: correct phase 3 decision provenance in PRD |
| 59 | 2026-11-02 | `b499ce5` | feat: track return deadlines and returned items (F66, AC143-AC145) |
| 60 | 2026-11-02 | `007a9c3` | docs: record return deadline task |
| 61 | 2026-11-02 | `e3e89ae` | feat: record resale and separate proceeds from savings (F67, AC146-AC147) |
| 62 | 2026-11-02 | `4870cb8` | feat: simplify entry forms and area choices (AC149-AC150) |
| 63 | 2026-11-02 | `7d2c37d` | fix: keep fixed-cost draft when add is not applied (AC150) |
| 64 | 2026-11-02 | `e3676b9` | docs: record phase 3 completion and screen review |
| 65 | 2026-11-02 | `931f868` | docs: define phase 4 benefits and settlement work |
| 66 | 2026-11-02 | `8ba4a4f` | feat: persist benefits and include them in backups (F20, F68-F71) |
| 67 | 2026-11-02 | `b143b43` | docs: record phase 4 storage and backup task |
| 68 | 2026-11-02 | `a816ec8` | feat: track official benefit checks without eligibility guesses (F68) |
| 69 | 2026-11-02 | `7d8afbf` | docs: record official benefits task |
| 70 | 2026-11-02 | `89aba7d` | feat: show manually entered card spending gaps (F69) |
| 71 | 2026-11-02 | `41a558d` | docs: record card progress task |
| 72 | 2026-11-02 | `0c91f44` | feat: track point and coupon expiry dates (F70) |
| 73 | 2026-11-02 | `161d40a` | docs: record expiry tracking task |
| 74 | 2026-11-02 | `462f271` | feat: track personal settlements separately from savings (F71) |
| 75 | 2026-11-02 | `15d823d` | docs: record settlement tracking task |
| 76 | 2026-11-02 | `f742125` | style: unify entry and disclosure visuals |
| 77 | 2026-11-02 | `7c3727d` | test: verify benefits backup restore in the app (AC162) |
| 78 | 2026-11-02 | `583f5a0` | docs: record phase 4 completion and screen review |
| 79 | 2026-11-02 | `b8885e0` | docs: plan today's actions and quick entry with a new skill |
| 80 | 2026-11-02 | `8ac5109` | feat: collect due actions from existing records (F72) |
| 81 | 2026-11-02 | `310de9d` | docs: record new skill use and today-action task |
| 82 | 2026-11-02 | `d748045` | feat: show today's actions on the first screen (F72) |
| 83 | 2026-11-02 | `b4bf626` | docs: record today-action navigation task |
| 84 | 2026-11-02 | `c1e70d5` | feat: support wishes with reasons added later (F73) |
| 85 | 2026-11-02 | `13245e2` | docs: record quick-entry storage task |
| 86 | 2026-11-02 | `ef63617` | feat: add a two-field quick wish flow (F73) |
| 87 | 2026-11-02 | `ccc4734` | docs: record quick-entry stage and screen review |
| 88 | 2026-11-02 | `c34bae7` | docs: plan payment calendar and shopping draft |
| 89 | 2026-11-02 | `6f46252` | feat: calculate recurring payments over thirty days (F74) |
| 90 | 2026-11-02 | `73f3dfa` | docs: record recurring payment calculation task |
| 91 | 2026-11-02 | `8701f6f` | feat: show a thirty-day payment calendar (F74) |
| 92 | 2026-11-02 | `86f9069` | docs: record payment calendar screen task |
| 93 | 2026-11-02 | `a3816f4` | feat: derive a shopping draft from pantry records (F75) |
| 94 | 2026-11-02 | `e13dbed` | docs: record shopping draft calculation task |
| 95 | 2026-11-02 | `c2c7bbe` | feat: add a temporary shopping checklist (F75) |
| 96 | 2026-11-02 | `efe83a5` | docs: record payment calendar and shopping draft stage |
| 97 | 2026-11-02 | `b8fd3e0` | feat: connect weekly meals and delivery inventory checks |
| 98 | 2026-11-02 | `3761fa4` | docs: plan and record saving action stages |
| 99 | 2026-11-02 | `b93ee55` | feat: surface spending experiments and purchase evidence |
| 100 | 2026-11-02 | `8b702e5` | docs: record spending and prebuy stage |
| 101 | 2026-11-02 | `4f33c8f` | feat: connect payment reviews and task starts |
| 102 | 2026-11-02 | `b136ea7` | fix: clarify payment and spending period labels |
| 103 | 2026-11-02 | `82f2873` | feat: persist one weekly spending experiment |
| 104 | 2026-11-02 | `c9141ba` | docs: finalize saving action checks and weekly experiment |
