import { describe, expect, it } from 'vitest';
import { MAX_SESSION_ID_LENGTH } from '../domain/score-submission.ts';
import { createSessionId } from './session-id.ts';

describe('createSessionId', () => {
  it('is 128 bits written as 22 URL-safe characters', () => {
    expect(createSessionId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it('fits in what a submission may carry', () => {
    expect(createSessionId().length).toBeLessThanOrEqual(MAX_SESSION_ID_LENGTH);
  });

  it('is different every time', () => {
    const ids = new Set(Array.from({ length: 2_000 }, createSessionId));
    expect(ids.size).toBe(2_000);
  });
});
