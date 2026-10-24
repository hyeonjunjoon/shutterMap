---
category: security-issues
tags: [cors, nestjs, security, origin-validation, cors-package]
related_files:
  - src/main.ts
  - test/cors.e2e-spec.ts
---

# NestJS `enableCors({ origin: '문자열' })`는 모든 Origin에 그대로 반사(reflect)된다

## 문제
프론트 스캐폴드 플랜 리뷰에서 CORS 설정을 "쿠키의 SameSite/Domain까지 확인"하라는 요구가 있었는데, 그걸 확인하기 전에 `enableCors({ origin: webOrigin, credentials: true })`처럼 `origin`에 문자열 하나를 그대로 넘기는 흔한 방식이 실제로는 Origin 검증을 안 하고 있다는 걸 발견했다.

## 원인
NestJS가 내부에서 쓰는 `cors` npm 패키지는 `origin`이 **문자열**이면, 설정값이 요청의 실제 `Origin` 헤더와 같은지 비교하지 않고 그 문자열을 그대로 `Access-Control-Allow-Origin`에 박아 넣는다 — 즉 어떤 Origin에서 요청이 와도 서버는 같은 값을 반사(reflect)한다. 실제 차단은 브라우저의 same-origin 정책에만 의존하게 되고, 브라우저가 아닌 클라이언트(서버-to-서버, curl 등)에서는 사실상 검증이 없는 것과 같다. `Vary: Origin` 헤더도 안 붙는다.

## 해결책
`origin`을 함수(`CustomOrigin`, `@nestjs/common/interfaces/external/cors-options.interface`)로 넘겨서 요청의 실제 Origin과 명시적으로 비교했다:

```ts
import { CustomOrigin } from '@nestjs/common/interfaces/external/cors-options.interface';

const corsOrigin: CustomOrigin = (requestOrigin, callback) =>
  callback(null, requestOrigin === webOrigin);
app.enableCors({ origin: corsOrigin, credentials: true });
```

이렇게 하면 `cors` 패키지가 실제 매칭 로직을 타면서 `Vary: Origin`도 올바르게 붙이고, 다른 Origin에서의 요청은 `Access-Control-Allow-Origin` 자체가 안 붙는다. `test/cors.e2e-spec.ts`로 허용된 Origin과 아닌 Origin 둘 다 실제 응답 헤더로 검증했다.

## 다음 작업 전 체크할 것
- [ ] **`app.enableCors({ origin: ... })`를 쓸 때 `origin`에 문자열/문자열배열을 그대로 넘기지 않는다.** 단일 오리진이라도 함수 형태(`CustomOrigin`)로 명시적 비교를 한다 — "문자열이면 된다"는 직관이 틀렸다.
- [ ] CORS 설정을 리뷰할 때 "허용된 Origin"만 테스트하지 말고, 반드시 **허용 안 된 Origin으로 보낸 요청의 응답 헤더**(특히 `Access-Control-Allow-Origin`이 없어야 함)도 e2e로 확인한다.
