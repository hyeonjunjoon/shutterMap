import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';

describe('proxy (route guard)', () => {
  it('redirects to /login when visiting /upload without a session cookie', () => {
    const req = new NextRequest(new URL('http://localhost:3001/upload'));
    const res = proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('redirects to /login when visiting /me without a session cookie', () => {
    const req = new NextRequest(new URL('http://localhost:3001/me'));
    const res = proxy(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('passes through /upload when a session cookie is present (존재만 확인 — 유효성은 페이지가 재확인)', () => {
    const req = new NextRequest(new URL('http://localhost:3001/upload'), {
      headers: { cookie: 'session=fake-jwt' },
    });
    const res = proxy(req);
    expect(res.status).toBe(200);
  });

  it('does not redirect public paths like / without a cookie', () => {
    const req = new NextRequest(new URL('http://localhost:3001/'));
    const res = proxy(req);
    expect(res.status).toBe(200);
  });
});
