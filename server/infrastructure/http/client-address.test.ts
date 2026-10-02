import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createClientAddressResolver, networkOf } from './client-address.ts';

interface Call {
  readonly trustProxy: number;
  readonly forwardedFor?: string;
  /** The address of the socket; none stands for a request that did not come through one, as with app.request(). */
  readonly socket?: string;
}

/** Resolves the address of a request the way the server does, through the real conninfo helper. */
async function resolve({ trustProxy, forwardedFor, socket }: Call): Promise<string | undefined> {
  const resolver = createClientAddressResolver(trustProxy);
  const app = new Hono();
  app.get('/', (c) => c.json({ address: resolver(c) ?? null }));
  const headers = forwardedFor === undefined ? undefined : { 'x-forwarded-for': forwardedFor };
  const env = socket === undefined ? undefined : { incoming: { socket: { remoteAddress: socket } } };

  const response = await app.request('/', { headers }, env);

  return ((await response.json()) as { address: string | null }).address ?? undefined;
}

describe('createClientAddressResolver', () => {
  describe('with no proxy in front of the server', () => {
    it('uses the address of the socket', async () => {
      expect(await resolve({ trustProxy: 0, socket: '198.51.100.9' })).toBe('198.51.100.9');
    });

    it('ignores X-Forwarded-For, which is only text typed by the client', async () => {
      expect(await resolve({ trustProxy: 0, forwardedFor: '203.0.113.1', socket: '198.51.100.9' })).toBe('198.51.100.9');
      expect(await resolve({ trustProxy: 0, forwardedFor: '203.0.113.1' })).toBeUndefined();
    });

    it('has no address for a request that did not come through a socket', async () => {
      expect(await resolve({ trustProxy: 0 })).toBeUndefined();
    });
  });

  describe('behind trusted proxies', () => {
    it('takes the entry the one proxy appended, however much the client wrote before it', async () => {
      const forwardedFor = '6.6.6.6, 7.7.7.7, 203.0.113.9';

      expect(await resolve({ trustProxy: 1, forwardedFor, socket: '10.0.0.1' })).toBe('203.0.113.9');
    });

    it('takes the second entry from the right behind two proxies', async () => {
      const forwardedFor = '6.6.6.6, 203.0.113.5, 10.0.0.2';

      expect(await resolve({ trustProxy: 2, forwardedFor, socket: '10.0.0.1' })).toBe('203.0.113.5');
    });

    it('reads a header that arrived as several lines as one list', async () => {
      const resolver = createClientAddressResolver(1);
      const app = new Hono();
      app.get('/', (c) => c.text(resolver(c) ?? 'none'));

      const response = await app.request('/', {
        headers: [
          ['x-forwarded-for', '6.6.6.6'],
          ['x-forwarded-for', '203.0.113.7'],
        ],
      });

      expect(await response.text()).toBe('203.0.113.7');
    });

    it('understands IPv6 addresses', async () => {
      expect(await resolve({ trustProxy: 1, forwardedFor: '2001:db8::1' })).toBe('2001:db8::1');
    });

    it.each([
      ['has fewer entries than there are proxies', 3, '203.0.113.5, 10.0.0.2'],
      ['is missing', 1, undefined],
      ['is empty', 1, ''],
      ['ends in something that is not an address', 1, '203.0.113.5, unknown'],
      ['ends in an address with a port, as some proxies write it', 1, '203.0.113.5:4711'],
      ['ends in an empty entry', 1, '203.0.113.5,'],
      ['ends in a name', 1, 'client.example.com'],
    ])('falls back to the socket when the header %s', async (_why, trustProxy, forwardedFor) => {
      expect(await resolve({ trustProxy, forwardedFor, socket: '198.51.100.9' })).toBe('198.51.100.9');
    });
  });
});

describe('networkOf', () => {
  it.each([
    ['an IPv4 address', '203.0.113.5', '203.0.113.5'],
    ['an IPv6 address, by its first 64 bits', '2001:db8:1:2:3:4:5:6', '2001:db8:1:2::/64'],
    ['a compressed IPv6 address', '2001:db8::1', '2001:db8:0:0::/64'],
    ['a compressed IPv6 address that ends in the network', '2001:db8:1:2::', '2001:db8:1:2::/64'],
    ['leading zeros, which are not part of the number', '2001:0db8:0001:0002:0000:0000:0000:0001', '2001:db8:1:2::/64'],
    ['upper case, which is not part of the number', '2001:DB8:1:2::1', '2001:db8:1:2::/64'],
    ['the loopback address', '::1', '0:0:0:0::/64'],
    ['a zone, which says nothing about who is calling', 'fe80::1%eth0', 'fe80:0:0:0::/64'],
    ['an IPv4 address in IPv6 form, dotted', '::ffff:203.0.113.5', '203.0.113.5'],
    ['an IPv4 address in IPv6 form, in hexadecimal', '::ffff:cb00:7105', '203.0.113.5'],
    ['an address in a network that merely resembles the IPv4-mapped one', '64:ff9b::203.0.113.5', '64:ff9b:0:0::/64'],
  ])('reads %s', (_name, address, expected) => {
    expect(networkOf(address)).toBe(expected);
  });

  it('leaves alone what is not an address, and what is not there', () => {
    expect(networkOf(undefined)).toBeUndefined();
    expect(networkOf('client')).toBe('client');
  });
});
