import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// vitest.config.ts에 globals:true가 없어서 Testing Library의 자동 afterEach
// 클린업이 전역 afterEach를 못 찾는다 — 명시적으로 등록해서 테스트 간 DOM이
// 누적되는 걸 막는다(여러 render() 호출이 쌓이면 getByRole 등이 여러 개를
// 찾아 테스트가 깨진다).
afterEach(cleanup);

// jsdom은 Element.scrollIntoView를 구현하지 않는다(실제 브라우저는 전부
// 있음) — 이걸 호출하는 컴포넌트를 렌더링만 해도 "not a function"으로
// 터진다. 테스트 환경 전용 갭이라 프로덕션 코드가 아니라 여기서 스텁한다.
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
