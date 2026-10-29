"""TODO.md가 PRD·계획과 어긋난 곳을 찾는다(저장소 루트에서).

  python .claude/skills/syncing-todo/scripts/check_todo.py [TODO.md] [PRD.md]

보는 것: 머리말 '기준: PRD vX'와 PRD 버전, PRD의 F31 이후 기능 번호가 TODO에 나오는지,
docs/superpowers/plans/의 계획 파일 이름이 TODO에 나오는지, 줄 끝 '(계획 ai-stage1 T3)'로 계획 작업을
가리키는 체크박스의 중복(문제)과 빠진 작업(확인할 것), 그 완료(- [x]) 줄의 커밋 해시가 있는지(확인할 것)·
이 저장소의 실제 커밋인지(문제), '한눈에 보기' 절, CR. 문제가 있으면 1.
줄과 작업의 뜻이 맞는지(14-3이 정말 T3의 일인지)는 보지 않는다.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def main() -> int:
    todo_p = Path(sys.argv[1] if len(sys.argv) > 1 else "TODO.md")
    prd_p = Path(sys.argv[2] if len(sys.argv) > 2 else "PRD.md")
    raw = todo_p.read_bytes()
    todo = raw.decode("utf-8")
    prd = prd_p.read_text(encoding="utf-8")
    problems: list[str] = []
    checks: list[str] = []

    if b"\r" in raw:
        problems.append("줄 끝에 CR이 있다(LF만)")
    pv = re.search(r"^버전: (\d+\.\d+)", prd, re.M)
    tv = re.search(r"기준: \[?PRD v?(\d+\.\d+)", todo)
    if not tv:
        problems.append("머리말에 '기준: PRD vX.YY' 줄이 없다")
    elif pv and tv.group(1) != pv.group(1):
        problems.append(f"머리말 기준 PRD v{tv.group(1)}이 실제 PRD 버전 {pv.group(1)}과 다르다")
    if "## 한눈에 보기" not in todo:
        problems.append("'## 한눈에 보기' 절이 없다")

    feats = sorted({int(n) for n in re.findall(r"^### F(\d+) ", prd, re.M) if int(n) >= 31})
    missing = [f"F{n}" for n in feats if not re.search(rf"\bF{n}\b", todo)]
    if missing:
        problems.append("PRD에 있는데 TODO에 없는 기능: " + ", ".join(missing))

    plans = sorted(Path("docs/superpowers/plans").glob("*.md"))
    plan_lines: list[str] = []
    for plan in plans:
        if plan.name not in todo:
            problems.append(f"계획 {plan.name}이 TODO에 나오지 않는다")
            continue
        tasks = len(re.findall(r"^### Task \d+", plan.read_text(encoding="utf-8"), re.M))
        # 계획 작업 줄은 끝에 '(계획 ai-stage1 T3)'처럼 날짜를 뺀 계획 이름과 작업 번호를 단다
        short = re.sub(r"^\d{4}-\d{2}-\d{2}-", "", plan.stem)
        boxes = [l for l in todo.split("\n") if re.match(r"\s*- \[[ x]\]", l) and re.search(rf"계획 {re.escape(short)} T\d+", l)]
        plan_lines += boxes
        if boxes:
            nums = [int(m) for l in boxes for m in re.findall(rf"계획 {re.escape(short)} T(\d+)", l)]
            dup = sorted({n for n in nums if nums.count(n) > 1})
            miss = sorted(set(range(1, tasks + 1)) - set(nums))
            if dup:
                problems.append(f"{plan.name}: 같은 작업을 가리키는 줄이 둘 이상 — T" + ", T".join(map(str, dup)))
            if miss:
                checks.append(f"{plan.name}: TODO에 없는 작업 — T" + ", T".join(map(str, miss)))

    # 계획 작업을 옮긴 완료 줄만 본다(예전 단계의 완료 줄에는 해시를 적지 않았다)
    for l in plan_lines:
        if not re.match(r"\s*- \[x\]", l):
            continue
        hashes = re.findall(r"\b[0-9a-f]{7,40}\b", l)
        if not hashes:
            checks.append(f"커밋 해시 없는 완료 작업: {l.strip()[:60]}")
        for h in hashes:
            if subprocess.run(["git", "cat-file", "-e", f"{h}^{{commit}}"], capture_output=True).returncode != 0:
                problems.append(f"완료 줄의 해시 {h}가 이 저장소의 커밋이 아니다: {l.strip()[:50]}")

    for c in checks:
        print("확인할 것 · " + c)
    if problems:
        for p in problems:
            print("문제 · " + p)
        return 1
    print(f"OK · 기준 PRD v{tv.group(1) if tv else '?'} · 기능 F31~ {len(feats)}개 모두 나옴 · 계획 {len(plans)}개 연결")
    return 0


if __name__ == "__main__":
    sys.exit(main())
