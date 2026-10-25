import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { Agent, fetch as fetchWithDispatcher } from 'undici';
import { AgentError } from '../contracts/errors.js';

interface Address {
  address: string;
  family: number;
}

export type ModelResolver = (
  hostname: string,
  options: { all: true; verbatim: true },
) => Promise<Address[]>;

export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address) || address.includes('%')) return false;
  const parsed = ipaddr.process(address);
  if (parsed.range() !== 'unicast') return false;
  // Only global IPv6 unicast is eligible; exclude translation and local scopes.
  return parsed.kind() !== 'ipv6' || (parsed.toByteArray()[0] & 0xe0) === 0x20;
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  let onAbort: () => void = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        signal.addEventListener('abort', onAbort, { once: true });
      }),
    ]);
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

export async function resolveModelAddresses(
  url: URL,
  allowPrivate: boolean,
  signal: AbortSignal,
  resolver: ModelResolver = lookup,
  purpose: 'model' | 'source' | 'search' = 'model',
): Promise<Address[]> {
  const reject = (reason: string) =>
    new AgentError(
      400,
      purpose === 'model' ? 'misconfigured' : 'invalid_input',
      `${purpose}_${reason}`,
    );
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (purpose === 'model' && url.search) ||
    url.hash
  ) {
    throw reject('url_invalid');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (
    !allowPrivate &&
    (hostname.replace(/\.$/, '') === 'localhost' ||
      hostname.replace(/\.$/, '').endsWith('.localhost') ||
      hostname.replace(/\.$/, '') === 'metadata.google.internal')
  ) {
    throw reject('host_blocked');
  }
  let addresses: Address[];
  try {
    addresses = isIP(hostname)
      ? [{ address: hostname, family: isIP(hostname) }]
      : await withAbort(
          resolver(hostname, { all: true, verbatim: true }),
          signal,
        );
  } catch {
    signal.throwIfAborted();
    throw reject('dns_failed');
  }
  if (
    addresses.length === 0 ||
    addresses.some(
      ({ address, family }) =>
        !isIP(address) ||
        isIP(address) !== family ||
        (!allowPrivate && !isPublicAddress(address)),
    )
  ) {
    throw reject('host_blocked');
  }
  return addresses;
}

/** Resolve once per turn and pin every connection, retaining the hostname for TLS and Host. */
export async function createModelTransport(
  baseUrl: string,
  allowPrivate: boolean,
  signal: AbortSignal,
  resolver?: ModelResolver,
  idleTimeoutMs = 120_000,
  purpose: 'model' | 'source' | 'search' = 'model',
) {
  const base = new URL(baseUrl);
  const addresses = await resolveModelAddresses(
    base,
    allowPrivate,
    signal,
    resolver,
    purpose,
  );
  const selected = addresses[0];
  const hostname = base.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  const dispatchers = new Set<Agent>();

  const controlledFetch: typeof globalThis.fetch = async (input, init) => {
    signal.throwIfAborted();
    const target = new URL(
      input instanceof Request ? input.url : String(input),
    );
    if (target.origin !== base.origin || target.username || target.password) {
      throw new AgentError(
        400,
        purpose === 'model' ? 'misconfigured' : 'invalid_input',
        `${purpose}_origin_changed`,
      );
    }
    const idle = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const touch = () => {
      clearTimeout(timer);
      timer = setTimeout(
        () =>
          idle.abort(
            new AgentError(504, 'upstream_unavailable', `${purpose}_timeout`),
          ),
        idleTimeoutMs,
      );
      timer.unref();
    };
    touch();
    const requestSignal = AbortSignal.any([
      signal,
      idle.signal,
      ...(input instanceof Request ? [input.signal] : []),
      ...(init?.signal ? [init.signal] : []),
    ]);
    const dispatcher = new Agent({
      headersTimeout: 0,
      bodyTimeout: 0,
      connect: {
        lookup(requested, options, callback) {
          if (requested.toLowerCase() !== hostname) {
            callback(new Error('Model connection host changed'), '', 0);
          } else if (options.all) {
            callback(null, [selected]);
          } else {
            callback(null, selected.address, selected.family);
          }
        },
      },
    });
    dispatchers.add(dispatcher);
    try {
      const response = await fetchWithDispatcher(
        input as Parameters<typeof fetchWithDispatcher>[0],
        {
          ...(init as Parameters<typeof fetchWithDispatcher>[1]),
          dispatcher,
          signal: requestSignal,
          // Never follow a Location header, including one pointing back to this origin.
          redirect: 'manual',
        },
      );
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        throw new AgentError(
          400,
          purpose === 'model' ? 'misconfigured' : 'invalid_input',
          `${purpose}_redirect_blocked`,
        );
      }
      void dispatcher
        .close()
        .catch(() => dispatcher.destroy())
        .finally(() => {
          dispatchers.delete(dispatcher);
        });
      if (!response.body) {
        clearTimeout(timer);
        return response as unknown as Response;
      }
      const reader = response.body.getReader();
      const body = new ReadableStream<Uint8Array>({
        async pull(controller) {
          try {
            const part = await reader.read();
            if (part.done) {
              clearTimeout(timer);
              controller.close();
            } else {
              touch();
              controller.enqueue(part.value);
            }
          } catch (error) {
            clearTimeout(timer);
            controller.error(idle.signal.aborted ? idle.signal.reason : error);
          }
        },
        async cancel(reason) {
          clearTimeout(timer);
          await reader.cancel(reason);
        },
      });
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    } catch (error) {
      clearTimeout(timer);
      await dispatcher.destroy();
      dispatchers.delete(dispatcher);
      throw idle.signal.aborted ? idle.signal.reason : error;
    }
  };

  return {
    fetch: controlledFetch,
    async close() {
      await Promise.all(
        [...dispatchers].map((dispatcher) => dispatcher.destroy()),
      );
      dispatchers.clear();
    },
  };
}
