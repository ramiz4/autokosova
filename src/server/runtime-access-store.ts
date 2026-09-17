import { AccessStore } from './access';

const DEV_ACCESS_STORES = Symbol.for('autokosova.dev.access-stores');

/**
 * Angular's development SSR runtime reloads server modules in place. Keep opaque local sessions
 * for the lifetime of that exact dev-server process, but never share them with another starter
 * or with a production runtime.
 */
export function accessStoreForRuntime(environment: NodeJS.ProcessEnv = process.env): AccessStore {
  const instance = environment['AUTOKOSOVA_DEV_INSTANCE'];
  if (environment['NODE_ENV'] !== 'development' || !instance) return new AccessStore();

  const runtime = globalThis as typeof globalThis & {
    [DEV_ACCESS_STORES]?: Map<string, AccessStore>;
  };
  const stores = runtime[DEV_ACCESS_STORES] ?? new Map<string, AccessStore>();
  runtime[DEV_ACCESS_STORES] = stores;
  const existing = stores.get(instance);
  if (existing) return existing;

  const store = new AccessStore();
  stores.set(instance, store);
  return store;
}
