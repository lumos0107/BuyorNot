"""PRD.md의 번호 참조가 서로 맞는지 검사한다.

쓰는 법: python .claude/skills/updating-prd/scripts/check_prd_refs.py [PRD.md 경로]
문제가 없으면 'OK'와 요약을 찍고 0으로, 있으면 문제 목록을 찍고 1로 끝난다.
"""
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")


def ac_refs(text: str) -> set[int]:
    """'AC51~AC54, AC60' 같은 표기에서 번호를 모두 꺼낸다(범위는 펼친다)."""
    nums: set[int] = set()
    for a, b in re.findall(r"AC(\d+)(?:~AC(\d+))?", text):
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
    path = Path(sys.argv[1] if len(sys.argv) > 1 else "PRD.md")
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
        m = re.search(r"AC(\d+)~AC(\d+)", h11)
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
    print(f"OK · {short} · 기능 F{max_f}까지 · 검증 사례 AC{max_ac}까지({len(ids)}행)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
