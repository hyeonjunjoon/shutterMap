---
category: integration-issues
tags: [nextjs, turbopack, dev-server, cache, css, metadata, next16]
related_files:
  - web/app/globals.css
  - web/app/layout.tsx
---

# Next 16 Turbopack dev 서버가 CSS/metadata만 바뀐 걸 반영 안 할 때가 있다

## 문제
`globals.css`의 컬러 토큰만 바꾸거나 `page.tsx`의 `metadata.title`만 바꿨는데, 파일 저장 후 브라우저를 새로고침해도 변경 전 상태가 그대로 보이는 일이 이번 세션에서 최소 3번 재현됐다(CSS 주석 문법 실수 1번, 컬러 토큰만 바꾼 경우 2번). 코드를 다시 읽어봐도 틀린 게 없어서 처음엔 "내가 뭘 잘못 짰나"하고 코드를 의심했다.

## 원인
Turbopack dev 서버 자체의 캐시가 CSS-only/metadata-only 변경을 감지하지 못하고 스테일 상태를 계속 서빙하는 경우가 있다 — 코드 버그가 아니라 dev 서버의 캐시 문제다. 페이지 새로고침으로도 해결 안 되고(캐시가 서버 쪽에 있어서), 코드가 맞는지 틀렸는지와 무관하게 발생한다.

## 해결책
매번 같은 절차로 해결됐다:
```bash
lsof -ti:3001 | xargs kill -9
rm -rf .next
nohup npm run dev > /tmp/frontend-dev.log 2>&1 &
```
서버를 완전히 죽이고 `.next` 빌드 캐시를 지운 뒤 재시작하면 변경사항이 즉시 반영됐다.

## 다음 작업 전 체크할 것
- [ ] **CSS나 `metadata`만 바꿨는데 브라우저에 변경이 하나도 안 보이면, 코드를 다시 의심하기 전에 먼저 dev 서버를 "kill → `rm -rf .next` → 재시작"으로 밀어보는 걸 1순위로 시도한다.** Next 16 + Turbopack에서 반복적으로 재현되는 알려진 패턴이다.
- [ ] 이 증상이 나오면 "코드가 틀렸다"는 결론을 내리기 전에 반드시 서버 재시작부터 — 디버깅 시간을 아낀다.
