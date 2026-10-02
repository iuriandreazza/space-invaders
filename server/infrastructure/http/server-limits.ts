import type { ServerOptions } from 'node:http';

/**
 * Slow-request protection: a client that trickles its request out can otherwise hold a socket for minutes (Node's
 * defaults are 60 s for the headers and 5 min for the request). A client gets 10 s to finish the headers and 15 s
 * for the whole request, and an idle keep-alive socket is dropped after 5 s. The price is paid by a slow uploader:
 * the largest body there is, 1 MiB, needs about 70 KB/s to arrive in time, and only a body that size asks that much.
 * Node only looks for expired deadlines every `connectionsCheckingInterval`, 30 s by default, which would let the
 * 10 s limit fire up to 40 s late: hence the 2 s.
 */
export const HTTP_SERVER_LIMITS: ServerOptions = {
  headersTimeout: 10_000,
  requestTimeout: 15_000,
  keepAliveTimeout: 5_000,
  connectionsCheckingInterval: 2_000,
};
