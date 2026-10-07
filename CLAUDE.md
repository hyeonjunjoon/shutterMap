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
- 새 기능 계획을 세우기 전에 docs/solutions/를 먼저 읽는다.
- push는 사용자 확인 후에만 한다.

## 기술 규칙 (사고에서 나온 것, docs/solutions/ 참고)
- `@nestjs/*`는 11.x(CJS)로 고정한다. 12.x는 ESM이라 Jest가 못 읽는다 — 버전 명시 없이 설치하지 않는다.
- 패키지를 새로 깔거나 메이저를 올릴 땐 `npm view <pkg> dist-tags`로 latest가 안정판인지 먼저 확인한다.
- DB는 Prisma 마이그레이션으로만 바꾼다 (확장 설치 등도 schema.prisma에 선언, 직접 `psql`로 손대지 않는다).
- 커밋 전 `npm run typecheck`와 `npm run build`도 돌린다 — ts-jest는 느슨해서 테스트만으론 못 잡는 타입 에러가 있다.
- find-or-create류 로직은 사전 체크(`findUnique`) 대신 처음부터 unique 제약 + P2002 캐치로 짠다.
- 비밀값(JWT_SECRET 등)은 `?? '기본값'` 폴백 없이, 없으면 기동 시 바로 throw한다.
- 사람이 입력하는 이메일은 저장·조회 전에 항상 정규화(trim+lowercase)한다.