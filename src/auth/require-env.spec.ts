import { requireEnv } from './require-env';

describe('requireEnv', () => {
  const KEY = 'REQUIRE_ENV_TEST_VAR';
  const original = process.env[KEY];
  afterEach(() => {
    process.env[KEY] = original;
  });

  it('throws naming the missing variable', () => {
    delete process.env[KEY];
    expect(() => requireEnv(KEY)).toThrow(KEY);
  });

  it('returns the value when set', () => {
    process.env[KEY] = 'a-value';
    expect(requireEnv(KEY)).toBe('a-value');
  });
});
