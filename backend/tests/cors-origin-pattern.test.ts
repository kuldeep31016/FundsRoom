import { describe, expect, it } from 'vitest';
import { originMatchesPattern } from '../src/app';

describe('originMatchesPattern', () => {
  it('matches an exact origin with no wildcard', () => {
    expect(originMatchesPattern('https://funds-room.vercel.app', 'https://funds-room.vercel.app')).toBe(true);
    expect(originMatchesPattern('https://evil.test', 'https://funds-room.vercel.app')).toBe(false);
  });

  it('matches every per-deployment Vercel preview URL against one wildcard pattern', () => {
    const pattern = 'https://funds-room-*-kuldeep31016s-projects.vercel.app';
    expect(originMatchesPattern('https://funds-room-ktpr4gd74-kuldeep31016s-projects.vercel.app', pattern)).toBe(
      true,
    );
    expect(originMatchesPattern('https://funds-room-hl1m5iuwl-kuldeep31016s-projects.vercel.app', pattern)).toBe(
      true,
    );
  });

  it('does not let the wildcard match across origins it should not', () => {
    const pattern = 'https://funds-room-*-kuldeep31016s-projects.vercel.app';
    expect(originMatchesPattern('https://funds-room-x.evil.test', pattern)).toBe(false);
    expect(originMatchesPattern('http://funds-room-x-kuldeep31016s-projects.vercel.app', pattern)).toBe(false);
  });
});
