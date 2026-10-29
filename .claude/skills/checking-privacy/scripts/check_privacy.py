"""AI 기능의 개인정보·외부 전송 규칙 중 기계로 볼 수 있는 것을 검사한다.

쓰는 법(저장소 루트에서):
  python .claude/skills/checking-privacy/scripts/check_privacy.py              # 저장소 전체
  python .claude/skills/checking-privacy/scripts/check_privacy.py --files a.ts b.tsx c.json   # 초안 파일만
금지(error)가 있으면 1, 없으면 0. 키 값은 절대 찍지 않는다(파일과 줄 번호만).
"""
import json
import re
import subprocess
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

KEY_PATTERN = re.compile(r"AIza[0-9A-Za-z_\-]{35}")
SECRET_PATHS = ["_개인기록/", "worker/.dev.vars", "PRD_1주안.md", "gemini_key", ".env.local", ".env.development.local"]
GITIGNORE_NEEDS = ["/_개인기록/", "worker/.dev.vars", ".wrangler/"]
CASE_FIELDS = ["source", "license", "edits"]

found: list[tuple[str, str, str]] = []  # (level, where, why)


def hit(level: str, where: str, why: str) -> None:
    found.append((level, where, why))


def check_worker(path: str, text: str) -> None:
    for i, l in enumerate(text.split("\n"), 1):
        if "privacy-check: ok" in l:
            continue
        if re.search(r"\bconsole\.(log|info|warn|error|debug)\(", l):
            hit("error", f"{path}:{i}", "서버 console 출력: 요청·응답 본문·키를 로그에 남기지 않는다. 남겨야 하면 상태 코드·걸린 시간만 찍고 줄 끝에 'privacy-check: ok <이유>'")
        if re.search(r"GEMINI_API_KEY\s*\.\s*(slice|substring|substr)|`[^`]*\$\{[^}]*GEMINI_API_KEY", l):
            hit("error", f"{path}:{i}", "키를 자르거나 문자열에 넣는다: 키는 x-goog-api-key 헤더로만 쓴다")
        if re.search(r"new Response\(", l) and not path.endswith("http.ts"):
            hit("check", f"{path}:{i}", "응답을 직접 만든다: no-store·CORS 헤더와 정규화가 빠지지 않았는지 본다(보통은 json())")


def check_app(path: str, text: str) -> None:
    sends_photo = re.search(r"PhotoPicker|/api/read-(tag|size)", text)
    sends_voice = re.search(r"useRecorder|/api/voice-fill", text)
    if sends_photo and "PHOTO_NOTICE" not in text and "PhotoPicker.tsx" not in path:
        hit("error", path, "사진을 보내는 화면에 PHOTO_NOTICE(구글 Gemini로 보내진다는 안내)가 없다")
    if sends_voice and "VOICE_NOTICE" not in text and "useRecorder" not in Path(path).name:
        hit("error", path, "녹음을 보내는 화면에 VOICE_NOTICE가 없다")
    for i, l in enumerate(text.split("\n"), 1):
        if "dangerouslySetInnerHTML" in l:
            hit("error", f"{path}:{i}", "읽은 글을 HTML로 넣는다: 글자로만 렌더한다")


def check_cases(path: str, text: str) -> None:
    try:
        cases = json.loads(text)
    except json.JSONDecodeError:
        hit("error", path, "JSON으로 읽히지 않는다")
        return
    for c in cases if isinstance(cases, list) else []:
        cid = c.get("id", "?")
        missing = [f for f in CASE_FIELDS if not c.get(f)]
        if missing:
            hit("error", f"{path} {cid}", "평가 자료에 출처·이용 조건·편집 내역이 없다: " + ", ".join(missing))
        f = str(c.get("file", ""))
        if f and not f.startswith(("사진/", "녹음/", "다나와/", "치수/")):
            hit("check", f"{path} {cid}", "자료 경로가 _개인기록/평가/ 아래 정해진 폴더가 아니다")


def classify(path: str, text: str) -> str | None:
    if path.endswith(".json") and '"expected"' in text:
        return "cases"
    if path.endswith(".tsx"):
        return "app"
    if path.endswith(".ts") and ("worker/" in path.replace("\\", "/") or "env: Env" in text):
        return "worker"
    if path.endswith(".ts"):
        return "app"
    return None


def check_file(path: str) -> None:
    text = Path(path).read_text(encoding="utf-8")
    if KEY_PATTERN.search(text):
        hit("error", path, "Gemini 키처럼 생긴 값이 파일에 있다(값은 찍지 않음)")
    kind = classify(path, text)
    if kind == "worker":
        check_worker(path, text)
    elif kind == "app":
        check_app(path, text)
    elif kind == "cases":
        check_cases(path, text)


def check_repo() -> None:
    tracked = subprocess.run(["git", "ls-files", "-z"], capture_output=True, text=True, encoding="utf-8").stdout.split("\0")
    for t in tracked:
        if any(t.startswith(s) or t.endswith(s) for s in SECRET_PATHS):
            hit("error", t, "커밋하면 안 되는 파일이 Git에 올라가 있다")
    gi = Path(".gitignore").read_text(encoding="utf-8") if Path(".gitignore").exists() else ""
    ex_path = Path(".git/info/exclude")
    ex = ex_path.read_text(encoding="utf-8") if ex_path.exists() else ""
    for need in GITIGNORE_NEEDS:
        if need in gi:
            continue
        if need.startswith(("worker/", ".wrangler")) and not Path("worker").exists():
            continue  # 서버 폴더가 생기기 전에는 볼 것이 없다
        if need in ex:
            hit("check", ".gitignore", f"'{need}'가 .git/info/exclude에만 있다(이 PC에서만 보호, 다른 PC에서 클론하면 보호되지 않는다)")
        else:
            hit("error", ".gitignore", f"'{need}'가 .gitignore에도 .git/info/exclude에도 없다")
    for t in tracked:
        p = Path(t)
        if p.suffix in (".ts", ".tsx", ".json", ".md", ".js", ".jsonc", ".html") and p.exists():
            if t.startswith(("worker/src/", "src/", "eval/cases/")) and ".test." not in t:
                check_file(t)
            elif KEY_PATTERN.search(p.read_text(encoding="utf-8", errors="ignore")):
                hit("error", t, "Gemini 키처럼 생긴 값이 파일에 있다(값은 찍지 않음)")


def main() -> int:
    args = sys.argv[1:]
    if args[:1] == ["--files"]:
        for f in args[1:]:
            check_file(f)
    else:
        check_repo()
    errors = [x for x in found if x[0] == "error"]
    checks = [x for x in found if x[0] == "check"]
    for title, group in (("금지", errors), ("확인할 것", checks)):
        if group:
            print(f"{title} {len(group)}개")
            for _, where, why in group:
                print(f"- {where} | {why}")
    if not found:
        print("OK")
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
