import { getConnInfo } from '@hono/node-server/conninfo';
import type { Context } from 'hono';
import { isIP } from 'node:net';

/** Tells who is calling, for the rate limit and the logs; undefined when there is no way to tell. */
export type ClientAddressResolver = (c: Context) => string | undefined;

function socketAddress(c: Context): string | undefined {
  try {
    return getConnInfo(c).remote.address;
  } catch {
    // getConnInfo throws when no Node socket stands behind the request, as with app.request().
    return undefined;
  }
}

/** The eight 16-bit groups of an IPv6 address, or undefined when the text is not one. */
function ipv6Groups(address: string): number[] | undefined {
  let text = address.split('%')[0]!;
  // A dotted IPv4 tail, as in ::ffff:203.0.113.5, stands for the last two groups.
  const tail = text.slice(text.lastIndexOf(':') + 1);
  if (tail.includes('.')) {
    const octets = tail.split('.').map(Number);
    if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
      return undefined;
    }
    const high = ((octets[0]! << 8) | octets[1]!).toString(16);
    const low = ((octets[2]! << 8) | octets[3]!).toString(16);
    text = `${text.slice(0, text.lastIndexOf(':') + 1)}${high}:${low}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) {
    return undefined;
  }
  const head = halves[0] === '' ? [] : halves[0]!.split(':');
  const rest = halves.length === 2 && halves[1] !== '' ? halves[1]!.split(':') : [];
  const gap = halves.length === 2 ? 8 - head.length - rest.length : 0;
  const groups = [...head, ...Array<string>(Math.max(gap, 0)).fill('0'), ...rest].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => group >= 0 && group <= 0xffff) ? groups : undefined;
}

/**
 * What a rate limit counts by. An IPv6 customer is usually given a whole /64, billions of addresses, so counting by
 * the full address would let one client escape every limit just by changing address: its first 64 bits stand for it.
 * An IPv4 address that a dual-stack socket reports in IPv6 form (::ffff:203.0.113.5) counts as the IPv4 address.
 */
export function networkOf(address: string | undefined): string | undefined {
  if (address === undefined || isIP(address) !== 6) {
    return address;
  }
  const groups = ipv6Groups(address);
  if (groups === undefined) {
    return address;
  }
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return `${groups[6]! >> 8}.${groups[6]! & 0xff}.${groups[7]! >> 8}.${groups[7]! & 0xff}`;
  }
  return `${groups.slice(0, 4).map((group) => group.toString(16)).join(':')}::/64`;
}

function forwardedAddress(header: string | undefined, proxies: number): string | undefined {
  const entries = (header ?? '').split(',').map((entry) => entry.trim());
  const entry = entries[entries.length - proxies];
  // Only an IP literal is a usable key: anything else must not become an unbounded set of keys. A proxy that appends
  // `ip:port` therefore falls back to the socket, and all of its clients share the proxy's allowance.
  return entry !== undefined && isIP(entry) !== 0 ? entry : undefined;
}

/**
 * X-Forwarded-For is a list that every proxy extends with the address it received the request from, and a client can
 * start the list with anything it likes. Behind `trustProxy` proxies that append to it, the entry the first of them
 * added is the `trustProxy`-th from the right, and it is the only one that can be believed. With no proxy in front of
 * the server the header is ignored: it is nothing but text typed by the client. Whenever the header does not hold what
 * it should, the address of the socket is used.
 */
export function createClientAddressResolver(trustProxy: number): ClientAddressResolver {
  return (c) => {
    if (trustProxy > 0) {
      const forwarded = forwardedAddress(c.req.header('x-forwarded-for'), trustProxy);
      if (forwarded !== undefined) {
        return forwarded;
      }
    }
    return socketAddress(c);
  };
}
