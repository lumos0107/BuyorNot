"""화면 문구에서 이 앱이 쓰지 않기로 한 표현을 찾는다.

쓰는 법:
  python .claude/skills/checking-ui-copy/scripts/check_copy.py                 # src 전체(테스트 제외)
  python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff x.diff   # diff의 더한 줄만
  git diff | python .claude/skills/checking-ui-copy/scripts/check_copy.py --diff -
금지(error)가 있으면 1, 확인할 것(check)만 있거나 없으면 0으로 끝난다.
PRD 문장과 글자 그대로 같은지는 스크립트가 보지 않는다(SKILL.md 2단계).
확인한 예외 줄에는 끝에 `// copy-check: ignore <규칙> <이유>`를 붙인다. 그 규칙만 꺼진다.
규칙 이름: price advice assert term badge emoji josa bang
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
sys.stdin.reconfigure(encoding="utf-8")

# (규칙 이름, 수준, 정규식, 이유). error는 커밋을 막고, check는 사람이 보고 넘긴다.
RULES = [
    ("price", "error", r"최저가|싸요|싸다|이득", "가격 판단 말: 가격 확인은 '조회 시점 표시 가격'만 말한다(F31)"),
    ("advice", "error", r"사세요|사지 마세요|사지 말|꼭 사|지금 사|사도 괜찮아요|사는 게 좋아요|안 사는 게", "구매 권유: 앱은 사라·말라를 말하지 않는다(결정은 사용자)"),
    ("assert", "error", r"충동구매예요|충동구매입니다|낭비예요", "단정: 근거만 보이고 단정하지 않는다(F15)"),
    ("term", "error", r"숙려", "옛 용어: '숙려'는 '고민'으로 바꿨다(2026-10-11)"),
    ("badge", "error", r"재검토 가능", "옛 문구: 화면 배지는 '고민 기간 끝'(2026-10-13)"),
    ("emoji", "error", "[\U0001F300-\U0001FAFF\u2600-\u27BF\u2B50\u2705]", "이모지: 화면에 이모지를 쓰지 않는다"),
    ("josa", "check", r"\$\{[^}]+\}(을|를|이|가|은|는|과|와|으로|로)(?=[\s'’.,)·]|$)", "조사 고정: 변수 끝 글자가 늘 같은지 보고, 아니면 josa()·withJosa()를 쓴다"),
    ("bang", "check", r"[가-힣]!", "느낌표: 화면 문구는 차분한 평서문으로 쓴다"),
]
# 화면 문구가 아닌 줄: 주석, 할인 문구를 찾는 단어 목록(SALE_WORDS)
SKIP = [r"^\s*(//|\*|/\*)", r"SALE_WORDS ="]


def scan_line(text: str) -> list[tuple[str, str]]:
    if any(re.search(s, text) for s in SKIP):
        return []
    m = re.search(r"copy-check: ignore ([a-z ]+)", text)
    off = set(m.group(1).split()) if m else set()
    code = text.split("// copy-check:")[0]
    return [(level, why) for name, level, pat, why in RULES if name not in off and re.search(pat, code)]


def from_diff(raw: str) -> list[tuple[str, int, str]]:
    out, file, line_no = [], "?", 0
    for l in raw.split("\n"):
        if l.startswith("+++ "):
            file = l[4:].removeprefix("b/")
        elif l.startswith("@@"):
            m = re.search(r"\+(\d+)", l)
            line_no = int(m.group(1)) - 1 if m else 0
        elif l.startswith("+"):
            line_no += 1
            out.append((file, line_no, l[1:]))
        elif not l.startswith("-"):
            line_no += 1
    return [x for x in out if re.search(r"\.(tsx?|jsx?)$", x[0]) and ".test." not in x[0]]


def from_src(root: Path) -> list[tuple[str, int, str]]:
    out = []
    for p in sorted(root.rglob("*")):
        if p.suffix in (".ts", ".tsx") and ".test." not in p.name and "test" not in p.parts:
            for i, l in enumerate(p.read_text(encoding="utf-8").split("\n"), 1):
                out.append((p.as_posix(), i, l))
    return out


def main() -> int:
    args = sys.argv[1:]
    if args[:1] == ["--diff"]:
        raw = sys.stdin.read() if args[1] == "-" else Path(args[1]).read_text(encoding="utf-8")
        lines = from_diff(raw)
    else:
        lines = from_src(Path(args[0] if args else "src"))
    hits = [(lv, f, n, t.strip(), why) for f, n, t in lines for lv, why in scan_line(t)]
    errors = [h for h in hits if h[0] == "error"]
    checks = [h for h in hits if h[0] == "check"]
    for title, group in (("금지", errors), ("확인할 것", checks)):
        if group:
            print(f"{title} {len(group)}개")
            for _, f, n, t, why in group:
                print(f"- {f}:{n} | {t[:80]} | {why}")
    if not hits:
        print(f"OK · {len(lines)}줄 검사")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
