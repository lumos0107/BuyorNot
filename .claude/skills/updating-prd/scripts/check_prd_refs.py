"""PRD.md의 번호 참조가 서로 맞는지 검사한다.

쓰는 법: python .claude/skills/updating-prd/scripts/check_prd_refs.py [PRD.md 경로] [--list]
문제가 없으면 'OK'와 요약을 찍고 0으로, 있으면 문제 목록을 찍고 1로 끝난다.
--list를 붙이면 '제작자 확인 전' 표시가 있는 곳을 모두 찍는다(9장에 맞는 줄이 있는지와 함께).

'제작자 확인 전' 대조(2026-10-31, 평가 1회차 P5): 'Claude 결정, 제작자 확인 전'('Claude 결정·제작자 확인 전'도)이
9장 밖에 있으면 9장 '남은 결정'에 그 결정의 줄이 있어야 한다. 9장의 줄은 '- '로 시작하는 목록 줄 하나, 또는 문단의 한 문장이다.
- 본문 표시: 그 줄에 판정 번호(R10, R14·R15, R25~R27, R29-P2)가 있으면 번호마다 그 번호와 절 이름이 함께 있는 9장 줄,
  없으면 표시 앞의 날짜와 절 이름이 함께 있는 9장 줄. 절 이름은 '### Fnn'이면 Fnn, 다른 '###' 절이면 괄호 앞 제목이다.
- 버전 줄의 판(0.NN: …) 표시: 본문 표시를 다시 적은 것이라 번호마다 그 번호가 있는 9장 줄, 번호가 없으면
  그 판의 날짜와 판에 적힌 Fnn이 함께 있는 9장 줄이면 된다.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

UNCONFIRMED = re.compile(r"Claude 결정\s*[,·]\s*제작자 확인 전")
# R10 · R14·R15(둘) · R25~R27(셋) · R29-P2(판정 R29의 평가 항목 P2)
RULING = re.compile(r"\bR(\d+)(?:-([A-Z]\d+))?(?:\\?~R(\d+))?(?![\w-])")
DATE = re.compile(r"\b20\d\d-\d\d-\d\d\b")


def rulings(text: str) -> list[str]:
    """'판정 R25~R27, R29-P2' 같은 표기에서 판정 번호를 꺼낸다(범위는 펼친다)."""
    out: list[str] = []
    for m in RULING.finditer(text):
        lo, sub, hi = m.group(1), m.group(2), m.group(3)
        if hi:
            out += [f"R{n}" for n in range(int(lo), int(hi) + 1)]
        else:
            out.append(f"R{lo}-{sub}" if sub else f"R{lo}")
    return list(dict.fromkeys(out))


def has_label(entry: str, label: str | None) -> bool:
    if label is None:
        return True
    if re.fullmatch(r"F\d+", label):
        return re.search(rf"\b{label}\b", entry) is not None
    return label in entry


def unconfirmed(lines: list[str]) -> tuple[list[tuple[str, str, bool]], list[str]]:
    """'제작자 확인 전' 표시가 있는 곳마다 (위치, 맞출 열쇠, 9장에 있음)과 문제 목록을 돌려준다."""
    entries: list[str] = []
    places: list[tuple[str, str, str | None, str]] = []  # (종류, 위치, 절 이름, 글)
    chapter9 = False
    label: str | None = None
    for i, l in enumerate(lines):
        if l.startswith("## "):
            chapter9 = l.startswith("## 9.")
            label = None
            continue
        if l.startswith("### "):
            m = re.match(r"### (F\d+) ", l)
            label = m.group(1) if m else re.sub(r"\s*\(.*$", "", l[4:]).strip()
            continue
        if chapter9:
            if l.lstrip().startswith("- "):
                entries.append(l)
            else:
                entries += [s for s in re.split(r"(?<=[.?!])\s+", l) if s.strip()]
            continue
        if l.startswith("버전: "):
            for part in re.split(r"(?:^버전: | · )(?=0\.\d+)", l):
                if UNCONFIRMED.search(part):
                    places.append(("version", "버전 " + part.split(":")[0].split(" ")[0], None, part))
        elif UNCONFIRMED.search(l):
            places.append(("body", f"{i + 1}줄", label, l))

    listed: list[tuple[str, str, bool]] = []
    problems: list[str] = []
    for kind, where, lab, text in places:
        where_l = f"{where}({lab})" if lab else where
        nums = rulings(text)
        if nums:
            need = lab if kind == "body" else None
            missing = [r for r in nums if not any(r in rulings(e) and has_label(e, need) for e in entries)]
            listed.append((where_l, "판정 " + "·".join(nums), not missing))
            if missing:
                together = f"번호와 절 이름({need})이" if need else "번호가"
                problems.append(f"{where_l}의 '제작자 확인 전' 결정({', '.join(missing)})이 9장 남은 결정에 없다({together} 9장 한 줄에 있어야 함)")
            continue
        mark = UNCONFIRMED.search(text)
        before = DATE.findall(text[: mark.start()]) if mark else []
        date = before[-1] if before else (DATE.findall(text) or [None])[0]
        if date is None:
            listed.append((where_l, "열쇠 없음", False))
            problems.append(f"{where_l}의 '제작자 확인 전' 결정에 판정 번호도 날짜도 없어 9장과 맞출 수 없다")
            continue
        feats = [lab] if kind == "body" and lab else ([] if kind == "body" else re.findall(r"\bF\d+\b", text))
        found = any(date in e and all(has_label(e, f) for f in feats) for e in entries)
        key = " · ".join([date, *feats])
        listed.append((where_l, key, found))
        if not found:
            problems.append(f"{where_l}의 '제작자 확인 전' 결정({key})이 9장 남은 결정에 없다(날짜와 절 이름이 9장 한 줄에 있어야 함)")
    return listed, problems


def ac_refs(text: str) -> set[int]:
    """'AC51~AC54, AC60' 같은 표기에서 번호를 모두 꺼낸다(범위는 펼친다)."""
    nums: set[int] = set()
    for a, b in re.findall(r"AC(\d+)(?:\\?~AC(\d+))?", text):
        lo = int(a)
        hi = int(b) if b else lo
        nums.update(range(lo, hi + 1))
    return nums


def head_version(path: Path, text: str) -> float | None:
    """저장소의 PRD.md이고 커밋된 판과 내용이 다르면 커밋된 판의 버전을, 아니면 None."""
    try:
        res = subprocess.run(["git", "show", f"HEAD:./{path.name}"], cwd=path.parent or ".",
                             capture_output=True, encoding="utf-8")
    except OSError:
        return None
    if res.returncode != 0 or res.stdout == text:
        return None
    m = re.search(r"^버전: (\d+\.\d+)", res.stdout, re.M)
    return float(m.group(1)) if m else None


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    path = Path(args[0] if args else "PRD.md")
    raw = path.read_bytes()
    text = raw.decode("utf-8")
    lines = text.split("\n")
    problems: list[str] = []

    if b"\r" in raw:
        problems.append(f"줄 끝에 CR이 {raw.count(b'\r')}개 있다(LF만 써야 함)")

    version = next((l for l in lines if l.startswith("버전: ")), None)
    if version is None:
        problems.append("'버전: ' 줄이 없다")
    else:
        m = re.match(r"버전: (\d+\.\d+)", version)
        if not m:
            problems.append("'버전: ' 줄이 '버전: 0.NN · …' 형식이 아니다")
        else:
            prev = head_version(path, text)
            if prev is not None and float(m.group(1)) <= prev:
                problems.append(f"내용이 커밋된 PRD와 다른데 버전이 {m.group(1)}로 커밋된 {prev}보다 높지 않다")

    # 검증 사례 표의 행
    # 'AC33-2'처럼 덧붙인 행은 AC33과 다른 행으로 본다
    rows = [(i + 1, int(m.group(1)), m.group(2) or "") for i, l in enumerate(lines) if (m := re.match(r"\| AC(\d+)(-\d+)?[ |]", l))]
    ids = [n for _, n, _ in rows]
    seen: set[int] = set(ids)
    keys: set[str] = set()
    for line_no, n, suffix in rows:
        key = f"AC{n:02d}{suffix}"
        if key in keys:
            problems.append(f"{line_no}줄: {key}이 표에 두 번 있다")
        keys.add(key)
    # 행마다 입력과 기대 결과를 ' / '로 나눈 개수가 같아야 한다(사례 하나에 결과 하나)
    warnings: list[str] = []
    for line_no, n, suffix in rows:
        # 따옴표 안 문장의 '236 / 255칸' 같은 글은 구분자가 아니다
        row = re.sub(r'"[^"]*"|“[^”]*”|`[^`]*`', '""', lines[line_no - 1])
        cells = [c.strip() for c in row.strip().strip("|").split("|")]
        if len(cells) >= 3:
            ins, outs = cells[1].count(" / ") + 1, cells[2].count(" / ") + 1
            if ins != outs:
                warnings.append(f"{line_no}줄 AC{n:02d}{suffix}: 입력 {ins}개와 기대 결과 {outs}개의 수가 다르다")
    max_ac = max(ids) if ids else 0
    gaps = sorted(set(range(1, max_ac + 1)) - seen)
    if gaps:
        problems.append("표에 빠진 검증 사례 번호: " + ", ".join(f"AC{n:02d}" for n in gaps))

    # 11장 제목의 범위
    h11 = next((l for l in lines if l.startswith("## 11.")), None)
    if h11:
        m = re.search(r"AC(\d+)\\?~AC(\d+)", h11)
        if not m or int(m.group(2)) != max_ac:
            problems.append(f"11장 제목 '{h11}'의 끝 번호가 표의 마지막 AC{max_ac}와 다르다")

    # 완료 기준이 가리키는 AC가 표에 있는지
    referenced: set[int] = set()
    for i, l in enumerate(lines):
        if "완료 기준" in l:
            refs = ac_refs(l)
            referenced |= refs
            missing = sorted(refs - seen)
            if missing:
                problems.append(f"{i + 1}줄 완료 기준이 표에 없는 " + ", ".join(f"AC{n}" for n in missing) + "를 가리킨다")
    # 중간 과제 이후(AC51~)의 사례는 어느 기능의 완료 기준에든 걸려 있어야 한다
    orphan = sorted(n for n in seen if n >= 51 and n not in referenced)
    if orphan:
        warnings.append("어느 완료 기준에도 없는 사례: " + ", ".join(f"AC{n}" for n in orphan))

    # 기능 번호
    heads = [int(m.group(1)) for l in lines if (m := re.match(r"### F(\d+) ", l))]
    for n in sorted({h for h in heads if heads.count(h) > 1}):
        problems.append(f"### F{n} 제목이 두 번 있다")
    feats = sorted(set(heads))
    max_f = max(feats) if feats else 0
    overview = next((l for l in lines if l.startswith("기능 번호와 검증 사례:")), None)
    if overview is None:
        problems.append("한눈에 보기의 '기능 번호와 검증 사례:' 줄이 없다")
    else:
        if f"AC{max_ac}" not in overview:
            problems.append(f"'기능 번호와 검증 사례:' 줄에 마지막 검증 사례 AC{max_ac}가 없다")
        if f"F{max_f}" not in overview:
            problems.append(f"'기능 번호와 검증 사례:' 줄에 마지막 기능 F{max_f}가 없다")

    # 새 기능 절(F31 이후)은 '- 완료 기준:' 줄을 가져야 한다
    starts = [i for i, l in enumerate(lines) if re.match(r"### F(\d+) ", l)]
    for k, s in enumerate(starts):
        n = int(re.match(r"### F(\d+) ", lines[s]).group(1))
        if n < 31:
            continue
        e = starts[k + 1] if k + 1 < len(starts) else len(lines)
        e = next((j for j in range(s + 1, e) if lines[j].startswith("## ")), e)
        if not any("완료 기준" in lines[j] for j in range(s, e)):
            problems.append(f"{s + 1}줄 F{n} 절에 '완료 기준' 줄이 없다")

    # Claude가 정하고 제작자가 아직 확인하지 않은 결정은 9장 '남은 결정'에 한 줄씩 있어야 한다(updating-prd 출처 표기)
    listed, missing_decisions = unconfirmed(lines)
    problems += missing_decisions
    if "--list" in sys.argv:
        print(f"'제작자 확인 전' {len(listed)}곳")
        for where, key, ok in listed:
            print(f"- {where} · {key} · {'9장 있음' if ok else '9장 없음'}")

    if warnings:
        print("확인할 것 " + str(len(warnings)) + "개(한 입력에 결과가 여럿이면 그대로 둔다)")
        for w in warnings:
            print("- " + w)
    if problems:
        print("문제 " + str(len(problems)) + "개")
        for p in problems:
            print("- " + p)
        return 1
    short = version.split(" · ")[0] if version else "버전 없음"
    print(f"OK · {short} · 기능 F{max_f}까지 · 검증 사례 AC{max_ac}까지({len(ids)}행) · 제작자 확인 전 {len(listed)}곳 모두 9장에 있음")
    return 0


if __name__ == "__main__":
    sys.exit(main())
