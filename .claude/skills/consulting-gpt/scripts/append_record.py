"""GPT 상의 한 번을 기록 파일 끝에 기존 형식대로 붙인다.

쓰는 법(저장소 루트에서):
  python .claude/skills/consulting-gpt/scripts/append_record.py NN
기본 위치: _개인기록/gpt/NN_prompt.md, NN_answer.md, NN_check.md → _개인기록/GPT_검토_기록.md
붙이는 순서: 프롬프트 전문(첫 줄이 '# NN. 제목') / '## NN. GPT 답변 원문' / NN_check.md('## NN. Claude 대조 확인'으로 시작)
같은 번호가 이미 있으면 붙이지 않는다. 줄 끝은 LF만 쓴다.
"""
import re
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

GPT_DIR = Path("_개인기록/gpt")
RECORD = Path("_개인기록/GPT_검토_기록.md")


def main() -> int:
    if len(sys.argv) < 2 or not re.fullmatch(r"\d+(-[가-힣a-z])?", sys.argv[1]):
        print("번호를 주세요. 예: append_record.py 44")
        return 2
    n = sys.argv[1]
    gpt = Path(sys.argv[2]) if len(sys.argv) > 2 else GPT_DIR
    record = Path(sys.argv[3]) if len(sys.argv) > 3 else RECORD
    files = {k: gpt / f"{n}_{k}.md" for k in ("prompt", "answer", "check")}
    missing = [str(p) for p in files.values() if not p.exists()]
    if missing:
        print("없는 파일: " + ", ".join(missing))
        return 1
    read = lambda p: p.read_text(encoding="utf-8").replace("\r\n", "\n").strip("\n")
    prompt, answer, check = (read(files[k]) for k in ("prompt", "answer", "check"))
    if len(answer.strip()) < 20:
        print("답 파일이 비었거나 너무 짧다(실행 실패?). 로그를 보고 다시 받는다")
        return 1
    if not prompt.startswith(f"# {n}. "):
        print(f"프롬프트 첫 줄이 '# {n}. 제목'이 아니다")
        return 1
    if not check.startswith(f"## {n}. Claude 대조 확인"):
        print(f"대조 확인 첫 줄이 '## {n}. Claude 대조 확인'이 아니다")
        return 1
    before = record.read_bytes() if record.exists() else b""
    if re.search(rf"^# {re.escape(n)}\. ".encode("utf-8"), before, re.M):
        print(f"{n}번은 이미 기록에 있다. 붙이지 않았다")
        return 1
    body = "\n\n".join([prompt, f"## {n}. GPT 답변 원문\n\n" + answer, check])
    with open(record, "a", encoding="utf-8", newline="\n") as f:
        f.write(("\n" if before and not before.endswith(b"\n") else "") + "\n" + body + "\n")
    after = record.read_bytes()
    first_line = len(before.decode("utf-8").split("\n")) + 1 if before else 1
    print(f"{n}번을 붙였다: {record} {first_line}줄부터, {len(after) - len(before)}바이트, CR {after.count(b'\r')}")
    return 0 if after.count(b"\r") == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
