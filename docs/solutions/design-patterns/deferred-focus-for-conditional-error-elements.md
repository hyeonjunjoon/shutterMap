---
category: design-patterns
tags: [react, accessibility, focus-management, ref, useeffect, conditional-render]
related_files:
  - web/app/login/login-form.tsx
  - web/app/register/register-form.tsx
---

# 조건부 렌더링되는 에러 엘리먼트로 `ref.current?.focus()`를 동기 호출하면 실패한다

## 문제
로그인 실패 시 접근성을 위해 에러 메시지로 포커스를 옮기려고, `catch` 블록에서 `setError(msg)` 바로 다음 줄에 `errorRef.current?.focus()`를 호출했다. 코드는 멀쩍이 자연스러워 보였지만, 실제 브라우저로 확인(`document.activeElement`)하니 포커스가 `<body>`에 머물러 있었다 — 아무 데도 안 옮겨짐.

## 원인
에러 `<p>`가 `{error && <p ref={errorRef}>...}`처럼 조건부로 렌더링된다. `setError(msg)`를 호출한 시점에 React는 아직 리렌더를 커밋하지 않았으므로, 그 다음 줄에서 `errorRef.current`는 여전히 `null`이다(DOM에 그 엘리먼트가 아직 없음). 이벤트 핸들러 안에서 `setState` 다음 줄에 바로 그 상태에 의존하는 ref를 읽는 건 항상 이 문제를 겪는다.

## 해결책
"포커스를 어디로 옮길지"라는 의도만 ref에 기록해두고, 실제 `.focus()` 호출은 `error` state가 바뀐 뒤 커밋이 끝난 시점에 실행되는 `useEffect`로 미뤘다:

```tsx
const focusTargetRef = useRef<'email' | 'alert' | null>(null);

useEffect(() => {
  if (!error) return;
  (focusTargetRef.current === 'email' ? emailRef.current : errorRef.current)?.focus();
}, [error]);

// catch 블록 안:
focusTargetRef.current = 'alert';
setError('...');
```

`useEffect`는 DOM이 커밋된 뒤에 실행되므로, 그 시점엔 조건부 엘리먼트가 실제로 존재한다. 실 브라우저에서 `document.activeElement`로 이메일/비밀번호/alert 세 케이스 모두 재확인했다.

## 다음 작업 전 체크할 것
- [ ] **이벤트 핸들러 안에서 `setState()` 직후 같은 상태에 조건부로 렌더링되는 엘리먼트의 ref를 동기적으로 읽지 않는다.** 그 시점에 DOM은 아직 이전 렌더 상태다.
- [ ] 포커스 이동처럼 "state가 바뀐 뒤 DOM이 존재해야 하는" 작업은 `useEffect(..., [해당 state])`로 미루고, "무엇에 포커스할지"는 별도 ref(또는 state)에 의도만 기록한다.
- [ ] 이런 포커스/DOM 타이밍 버그는 jsdom 단위 테스트로 잘 안 잡힌다 — 실 브라우저에서 `document.activeElement`를 직접 확인하는 걸로 검증한다.
