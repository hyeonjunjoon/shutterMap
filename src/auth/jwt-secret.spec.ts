import { getJwtSecret } from './jwt-secret';

describe('getJwtSecret', () => {
  const original = process.env.JWT_SECRET;
  afterEach(() => {
    process.env.JWT_SECRET = original;
  });

  it('throws when JWT_SECRET is unset', () => {
    delete process.env.JWT_SECRET;
    expect(() => getJwtSecret()).toThrow('JWT_SECRET');
  });

  it('returns the secret when set', () => {
    process.env.JWT_SECRET = 'a-real-secret';
    expect(getJwtSecret()).toBe('a-real-secret');
  });
});
