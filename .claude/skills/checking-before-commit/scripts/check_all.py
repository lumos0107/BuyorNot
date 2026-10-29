"""커밋 직전 검사를 한 번에 돌린다(저장소 루트에서).

  python .claude/skills/checking-before-commit/scripts/check_all.py           # 스테이징한 것 기준
  python .claude/skills/checking-before-commit/scripts/check_all.py --quick   # 테스트·빌드 없이 파일 검사만

하나라도 실패하면 1. 출력의 '실패' 줄을 고친 뒤 다시 돌린다. 커밋·push는 하지 않는다.
"""
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

SKILLS = Path(".claude/skills")
NEVER = ("_개인기록/", "PRD_1주안.md", "worker/.dev.vars", ".env.local", ".env.development.local", "gemini_key")
TEXT = (".ts", ".tsx", ".js", ".json", ".jsonc", ".md", ".css", ".html", ".py", ".yml")

results: list[tuple[bool, str, str]] = []


def run(name: str, cmd: list[str], input_text: str | None = None, pick: str | None = None) -> None:
    """pick: 출력에서 이 말이 든 줄만 요약으로 보인다(없으면 마지막 세 줄)."""
    res = subprocess.run(cmd, capture_output=True, encoding="utf-8", errors="replace", input=input_text, shell=(sys.platform == "win32" and cmd[0] in ("npm", "npx")))
    out = (res.stdout + res.stderr).strip().splitlines()
    picked = [l.strip() for l in out if pick and pick in l]
    tail = " / ".join(picked[-2:] if picked else out[-3:]) if out else ""
    results.append((res.returncode == 0, name, tail))


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, encoding="utf-8").stdout


def main() -> int:
    quick = "--quick" in sys.argv
    staged = [f for f in git("diff", "--cached", "--name-only", "-z").split("\0") if f]
    if not staged:
        print("스테이징한 파일이 없다. 파일 이름을 하나씩 git add 한 뒤 다시 돌린다(git add . 금지)")
        return 1

    bad = [f for f in staged if any(f.startswith(s) or f.endswith(s) for s in NEVER)]
    results.append((not bad, "커밋하면 안 되는 파일", ", ".join(bad) or "없음"))

    cr = [f for f in staged if f.endswith(TEXT) and Path(f).exists() and b"\r" in Path(f).read_bytes()]
    results.append((not cr, "줄 끝 CR(LF만)", ", ".join(cr) or "없음"))

    diff = git("diff", "--cached")
    run("화면 문구(check_copy)", [sys.executable, str(SKILLS / "checking-ui-copy/scripts/check_copy.py"), "--diff", "-"], diff)
    run("개인정보(check_privacy)", [sys.executable, str(SKILLS / "checking-privacy/scripts/check_privacy.py")])
    if "PRD.md" in staged:
        run("PRD 참조(check_prd_refs)", [sys.executable, str(SKILLS / "updating-prd/scripts/check_prd_refs.py"), "PRD.md"])
    if "TODO.md" in staged:
        run("TODO(check_todo)", [sys.executable, str(SKILLS / "syncing-todo/scripts/check_todo.py")])

    if quick and any(not f.endswith(".md") for f in staged):
        results.append((False, "--quick", "문서(.md)만 스테이징했을 때만 테스트를 건너뛴다"))
        quick = False

    # 테스트는 작업 폴더에서 돈다. 스테이징 안 한 코드 변경이 있으면 검증한 코드와 커밋할 코드가 다르다
    code_dirty = [l[3:] for l in git("status", "--porcelain").splitlines()
                  if l[1] in "MD" and l[3:].startswith(("src/", "worker/", "eval/", "vite.config", "package", "tsconfig"))]
    if code_dirty and not quick:
        results.append((False, "검증 대상 일치", "스테이징 안 한 코드 변경: " + ", ".join(code_dirty[:6]) + " (스테이징하거나 git stash --keep-index 뒤 다시)"))

    if not quick:
        run("npm test", ["npm", "test"], pick="Tests")
        run("npm run lint", ["npm", "run", "lint"], pick="Found")
        run("npx tsc -b", ["npx", "tsc", "-b"])
        if Path("eval/tsconfig.json").exists():
            run("npx tsc -p eval/tsconfig.json", ["npx", "tsc", "-p", "eval/tsconfig.json"])

    print(f"스테이징 {len(staged)}개: " + ", ".join(staged[:12]) + (" …" if len(staged) > 12 else ""))
    for ok, name, tail in results:
        print(f"{'통과' if ok else '실패'} · {name} · {tail}")
    unstaged = [l[3:] for l in git("status", "--porcelain").splitlines() if l[:2] in ("??", " M", " D")]
    if unstaged:
        print("스테이징 안 한 것(이번 커밋에 안 들어감): " + ", ".join(unstaged[:12]))
    return 0 if all(ok for ok, _, _ in results) else 1


if __name__ == "__main__":
    sys.exit(main())
