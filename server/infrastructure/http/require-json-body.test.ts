import { Hono, type Context } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import type { ApiErrorResponse } from '../../../shared/leaderboard-contract.ts';
import { requireJsonBody } from './require-json-body.ts';

function appRequiringJson() {
  const onRejected = vi.fn();
  const handler = vi.fn((c: Context) => c.text('served'));
  const app = new Hono();
  app.post('/', requireJsonBody({ onRejected }), handler);
  return { app, onRejected, handler };
}

/**
 * A body that comes with its length, the way every real client sends one. A string body would get a content type of
 * its own from the platform, so bytes stand in when the point is that there is none.
 */
function withBody(contentType: string | undefined, body = '{}'): RequestInit {
  const headers: Record<string, string> = { 'content-length': String(body.length) };
  if (contentType !== undefined) {
    headers['content-type'] = contentType;
  }
  return { method: 'POST', headers, body: contentType === undefined ? new TextEncoder().encode(body) : body };
}

describe('requireJsonBody', () => {
  it.each([
    'application/json',
    'application/json; charset=utf-8',
    'application/json;charset=UTF-8',
    'APPLICATION/JSON',
    'Application/Json; charset=utf-8',
  ])('lets a body declared as %s through', async (contentType) => {
    const { app, handler } = appRequiringJson();

    const response = await app.request('/', withBody(contentType));

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['plain text', 'text/plain'],
    ['plain text that mentions JSON', 'text/plain; application/json'],
    ['a form', 'application/x-www-form-urlencoded'],
    ['a multipart form', 'multipart/form-data; boundary=x'],
    ['JSON Patch', 'application/json-patch+json'],
    ['a type that merely starts like it', 'application/jsonp'],
    ['text/json', 'text/json'],
    ['a vendor type', 'application/vnd.api+json'],
    ['two types at once', 'application/json, text/plain'],
    ['nothing', ''],
    ['no type at all', undefined],
  ])('refuses a body declared as %s with 415, without reaching the handler', async (_what, contentType) => {
    const { app, handler } = appRequiringJson();

    const response = await app.request('/', withBody(contentType));

    expect(response.status).toBe(415);
    expect(((await response.json()) as ApiErrorResponse).error.code).toBe('unsupported_media_type');
    expect(handler).not.toHaveBeenCalled();
  });

  it('tells who refused what: the content type it saw', async () => {
    const { app, onRejected } = appRequiringJson();

    await app.request('/', withBody('text/plain'));
    await app.request('/', withBody(undefined));

    expect(onRejected.mock.calls.map(([, contentType]) => contentType)).toEqual(['text/plain', undefined]);
  });

  describe('knows a body is there from how the request frames it', () => {
    it('by its announced length', async () => {
      const { app } = appRequiringJson();

      const response = await app.request('/', withBody('text/plain', 'hello'));

      expect(response.status).toBe(415);
    });

    it('by chunked transfer, which has no length', async () => {
      const { app } = appRequiringJson();

      const response = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'transfer-encoding': 'chunked' },
        body: 'hello',
      });

      expect(response.status).toBe(415);
    });

    it('and sees no body in a request of length zero, whatever its content type', async () => {
      const { app } = appRequiringJson();

      const response = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'content-length': '0' },
      });

      expect(response.status).toBe(200);
    });

    it('and sees no body in a request that says nothing about one, which is what the web client sends to start a session', async () => {
      const { app, onRejected } = appRequiringJson();

      const response = await app.request('/', { method: 'POST' });

      expect(response.status).toBe(200);
      expect(onRejected).not.toHaveBeenCalled();
    });
  });
});
