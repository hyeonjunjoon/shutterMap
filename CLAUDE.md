## gstack (REQUIRED — global install)

**Before doing ANY work, verify gstack is installed:**

```bash
_GS=""
for _D in "${GSTACK_ROOT:-}" "$HOME/.claude/skills/gstack" "$HOME/.codex/skills/gstack" "$HOME/.factory/skills/gstack" "$HOME/.kiro/skills/gstack" "$HOME/.config/opencode/skills/gstack" "$HOME/.slate/skills/gstack" "$HOME/.cursor/skills/gstack" "$HOME/.openclaw/skills/gstack" "$HOME/.hermes/skills/gstack" "$HOME/.gbrain/skills/gstack" "$HOME/.gstack/repos/gstack"; do
  [ -z "$_GS" ] && [ -n "$_D" ] && [ -d "$_D/bin" ] && _GS="$_D"
done
[ -n "$_GS" ] && echo "GSTACK_OK: $_GS" || echo "GSTACK_MISSING"
```

If GSTACK_MISSING: STOP. Do not proceed. Tell the user:

> gstack is required for all AI-assisted work in this repo.
> Install it:
> ```bash
> git clone --depth 1 https://github.com/garrytan/gstack.git ~/.claude/skills/gstack
> cd ~/.claude/skills/gstack && ./setup --team
> ```
> Then restart your AI coding tool.

Do not skip skills, ignore gstack errors, or work around missing gstack.

Using gstack skills: After install, skills like /qa, /ship, /review, /investigate,
and /browse are available. Use /browse for all web browsing (Aside first, the bundled gstack browser as fallback).
Use the resolved install path above for gstack file paths
(default: ~/.claude/skills/gstack).

---

## 한글 출력
- 도구 호출 인자(AskUserQuestion, TodoWrite 등)에 한글을 쓸 때는
  \uXXXX 이스케이프를 쓰지 말고 UTF-8 문자 그대로 쓴다.

## 기획 및 설계
- 기획/리뷰/QA는 gstack, 구현 계획과 코딩은 Superpowers이 담당한다

## 언어
- 설계문서, 결과 리뷰, 주석은 한국어로 한다.

## 레포
- PR, 커밋메세지도 한국어로 한다.
- 공동 작업자에 claude가 없도록한다.

## 작업 전 확인
- 새 기능 계획을 세우기 전에 docs/solutions/(카테고리별 폴더, 각 문서에 category/tags 있음)를 먼저 읽는다.
- push는 사용자 확인 후에만 한다.

## 백엔드 작업 규칙
- `@nestjs/*` 계열 패키지는 전부 11.x로 고정한다.
- 환경변수는 `process.env.X` 직접 참조 대신 `requireEnv()`로 읽는다.
- 경쟁 조건은 사전 체크 대신 원자적 조건부 쓰기(unique 제약+에러 캐치, 또는 조건부 UPDATE)로 처리한다.
- 패키지 설치/업그레이드 전에는 `npm view <pkg> dist-tags`로 안정판을 확인한다.
- `npm test`가 통과해도 `npm run typecheck`와 `npm run build`까지 돌린다 — ts-jest가 못 잡는 타입/빌드 에러가 있다.
- 동작이 불확실한 라이브러리 조합(네이티브 바인딩, 버전별 기능차이)은 계획 전에 스크래치에서 스파이크로 직접 확인한다.