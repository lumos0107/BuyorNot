"""계획 작업 하나를 TODO.md에서 완료로 표시한다(저장소 루트에서).

  python .claude/skills/syncing-todo/scripts/mark_done.py ai-stage1 3 9110cb6 [--dry-run] [--todo TODO.md]

'(계획 ai-stage1 T3)'이 붙은 체크박스 줄을 정확히 하나 찾아 '- [ ]'를 '- [x]'로 바꾸고 줄 끝에 ' — `해시7자리`'를 붙인다.
해시는 이 저장소의 커밋이어야 한다. 줄이 없거나 둘 이상이면, 이미 다른 해시로 완료돼 있으면 파일을 바꾸지 않고 1.
이미 같은 해시로 완료돼 있으면 바꾸지 않고 0. 완료 판정(검증·리뷰·코드 커밋)은 이 스크립트를 부르기 전에 끝낸다.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def fail(msg: str) -> int:
    print("거부 · " + msg)
    return 1


def main() -> int:
    args = sys.argv[1:]
    dry = "--dry-run" in args
    args = [a for a in args if a != "--dry-run"]
    todo_p = Path("TODO.md")
    if "--todo" in args:
        i = args.index("--todo")
        todo_p = Path(args[i + 1])
        del args[i:i + 2]
    if len(args) != 3 or not args[1].isdigit():
        print(__doc__)
        return 2
    plan, task, given = args

    r = subprocess.run(["git", "rev-parse", "--verify", "--quiet", f"{given}^{{commit}}"], capture_output=True, text=True)
    if r.returncode != 0:
        return fail(f"{given}는 이 저장소의 커밋이 아니다")
    short = r.stdout.strip()[:7]

    raw = todo_p.read_bytes()
    if b"\r" in raw:
        return fail(f"{todo_p}에 CR이 있다(LF만)")
    lines = raw.decode("utf-8").split("\n")
    mark = re.compile(rf"\(계획 {re.escape(plan)} T{task}\)")
    hits = [i for i, l in enumerate(lines) if re.match(r"\s*- \[[ x]\]", l) and mark.search(l)]
    if len(hits) != 1:
        return fail(f"'(계획 {plan} T{task})' 체크박스 줄이 {len(hits)}개다(하나여야 한다)")
    i = hits[0]
    line = lines[i]
    if re.match(r"\s*- \[x\]", line):
        if short in line:
            print(f"그대로 · 이미 {short}로 완료: {line.strip()}")
            return 0
        return fail(f"이미 다른 해시로 완료돼 있다: {line.strip()}")

    new = re.sub(r"- \[ \]", "- [x]", line, count=1) + f" — `{short}`"
    print(f"{'미리 보기' if dry else '바꿈'} · {todo_p}:{i + 1}")
    print(f"  전: {line.strip()}")
    print(f"  후: {new.strip()}")
    if not dry:
        lines[i] = new
        todo_p.write_bytes("\n".join(lines).encode("utf-8"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
