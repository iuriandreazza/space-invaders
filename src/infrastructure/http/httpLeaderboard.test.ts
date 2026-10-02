import { describe, expect, it, vi } from 'vitest';
import type { LeaderboardEntry } from '../../../shared/leaderboard-contract.ts';
import { ENGINE_VERSION } from '../../../shared/game/replay.ts';
import { LeaderboardError } from '../../application/ports.ts';
import { HttpLeaderboard } from './httpLeaderboard.ts';

const entry: LeaderboardEntry = { rank: 1, initials: 'ABC', score: 4200, achievedAt: '2026-10-01T12:00:00.000Z' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function leaderboardAnswering(response: Response | Error) {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  return { leaderboard: new HttpLeaderboard('/api', fetchImpl), fetchImpl };
}

describe('HttpLeaderboard', () => {
  it('starts a session with an empty POST', async () => {
    const { leaderboard, fetchImpl } = leaderboardAnswering(json({ sessionId: 'abc' }, 201));
    await expect(leaderboard.startSession()).resolves.toBe('abc');
    expect(fetchImpl).toHaveBeenCalledWith('/api/sessions', expect.objectContaining({ method: 'POST', body: undefined }));
  });

  it('submits a score as JSON and returns the ranked entry', async () => {
    const { leaderboard, fetchImpl } = leaderboardAnswering(json({ entry }, 201));
    const input = { sessionId: 'abc', initials: 'ABC', run: { score: 4200, replay: [1, 3, 16, 2] } };

    await expect(leaderboard.submitScore(input)).resolves.toEqual(entry);

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('/api/scores');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init?.body as string)).toEqual({
      sessionId: 'abc',
      initials: 'ABC',
      score: 4200,
      engineVersion: ENGINE_VERSION,
      replay: [1, 3, 16, 2],
    });
  });

  it('asks for the top scores with a limit', async () => {
    const { leaderboard, fetchImpl } = leaderboardAnswering(json({ entries: [entry] }));
    await expect(leaderboard.topScores(5)).resolves.toEqual([entry]);
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/scores?limit=5');
  });

  it('turns API errors into typed errors', async () => {
    const { leaderboard } = leaderboardAnswering(
      json({ error: { code: 'session_already_used', message: 'Already submitted.' } }, 409),
    );
    await expect(
      leaderboard.submitScore({ sessionId: 'abc', initials: 'ABC', run: { score: 1, replay: [1, 1] } }),
    ).rejects.toMatchObject({
      name: 'LeaderboardError',
      code: 'session_already_used',
      message: 'Already submitted.',
    });
  });

  it('reports an unreachable server as a network error', async () => {
    const { leaderboard } = leaderboardAnswering(new TypeError('Failed to fetch'));
    await expect(leaderboard.topScores()).rejects.toEqual(new LeaderboardError('network', 'The leaderboard cannot be reached.'));
  });

  it('gives up on a server that never answers', async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
        }),
    );
    const leaderboard = new HttpLeaderboard('/api', fetchImpl, 20);

    await expect(leaderboard.topScores()).rejects.toMatchObject({ name: 'LeaderboardError', code: 'network' });
  });

  it('copes with a successful answer that is not JSON', async () => {
    const { leaderboard } = leaderboardAnswering(new Response('<html>Welcome</html>', { status: 200 }));
    await expect(leaderboard.topScores()).rejects.toMatchObject({ name: 'LeaderboardError', code: 'unexpected' });
  });

  it('copes with answers that are not the API error format', async () => {
    const { leaderboard } = leaderboardAnswering(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(leaderboard.topScores()).rejects.toMatchObject({ code: 'unexpected' });
  });
});
