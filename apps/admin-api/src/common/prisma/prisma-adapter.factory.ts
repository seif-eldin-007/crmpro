import { PrismaPg } from '@prisma/adapter-pg';
import type { Pool } from 'pg';

/**
 * pg forbids issuing a query to a client that is already executing one
 * (deprecated in pg 8.20+, removed in pg 9). Prisma's query engine
 * dispatches multiple queries concurrently onto the single pinned client of
 * a transaction (batch `$transaction([...])`, writes with multiple
 * `include` relations), which triggers that deprecated pg behavior today and
 * will break on pg 9. Upstream fix: prisma/orm#29407 (still open as of
 * adapter-pg 7.10.0).
 *
 * This wrapper serializes `queryRaw`/`executeRaw` per transaction so the
 * pinned client never receives a query while one is still in flight. It
 * deliberately does NOT touch the top-level adapter: non-transactional
 * queries go through the pool and keep their concurrency.
 */
function serializeTransactionQueryable<T extends object>(target: T): T {
  let queue: Promise<unknown> = Promise.resolve();

  const enqueue = (fn: () => Promise<unknown>): Promise<unknown> => {
    const result = queue.then(fn);
    queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  return new Proxy(target, {
    get(tx, prop, receiver) {
      const value: unknown = Reflect.get(tx, prop, receiver);

      if (prop === 'queryRaw' || prop === 'executeRaw') {
        return (...args: unknown[]) =>
          enqueue(() =>
            (value as (...a: unknown[]) => Promise<unknown>).apply(tx, args),
          );
      }

      if (typeof value === 'function') {
        return (value as (...a: unknown[]) => unknown).bind(tx);
      }

      return value;
    },
  });
}

export function createPrismaPgAdapter(pool: Pool): PrismaPg {
  // `new PrismaPg(pool)` is an adapter factory: Prisma calls `connect()` on
  // it and uses the returned adapter, so `startTransaction` must be wrapped
  // there, not on the factory.
  return new Proxy(new PrismaPg(pool), {
    get(factory, prop, receiver) {
      const value: unknown = Reflect.get(factory, prop, receiver);

      if (prop === 'connect') {
        return async (...args: unknown[]) => {
          const adapter = await (
            value as (...a: unknown[]) => Promise<object>
          ).apply(factory, args);
          return new Proxy(adapter, {
            get(inner, innerProp, innerReceiver) {
              const innerValue: unknown = Reflect.get(
                inner,
                innerProp,
                innerReceiver,
              );

              if (innerProp === 'startTransaction') {
                return async (...txArgs: unknown[]) =>
                  serializeTransactionQueryable(
                    await (
                      innerValue as (...a: unknown[]) => Promise<object>
                    ).apply(inner, txArgs),
                  );
              }

              if (typeof innerValue === 'function') {
                return (innerValue as (...a: unknown[]) => unknown).bind(inner);
              }

              return innerValue;
            },
          });
        };
      }

      if (typeof value === 'function') {
        return (value as (...a: unknown[]) => unknown).bind(factory);
      }

      return value;
    },
  });
}
