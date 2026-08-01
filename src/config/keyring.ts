import type { Provider } from '../schemas/config.js';

/**
 * Optional OS-keychain storage via `@napi-rs/keyring` (spec §9.1). The package is
 * an `optionalDependency` with a native binary that may be absent — under `npx`,
 * on an unsupported platform, or when the install skipped optional deps. Every
 * entry point degrades silently to "no keyring available" so a missing binary
 * never breaks the tool; callers fall back to config-file storage.
 *
 * The import is dynamic and cached so a hard `import` can never crash module load.
 */

const SERVICE = 'inglorious-mustard';

type KeyringModule = {
  Entry: new (
    service: string,
    account: string,
  ) => {
    getPassword(): string;
    setPassword(password: string): void;
    deletePassword(): boolean;
  };
};

let cached: KeyringModule | null | undefined;

async function loadKeyring(): Promise<KeyringModule | null> {
  if (cached !== undefined) {
    return cached;
  }
  try {
    // Dynamic so a missing optional native dep degrades instead of throwing at load.
    cached = (await import('@napi-rs/keyring')) as unknown as KeyringModule;
  } catch {
    cached = null;
  }
  return cached;
}

/** True when the native keyring is importable on this machine. */
export async function keyringAvailable(): Promise<boolean> {
  return (await loadKeyring()) !== null;
}

/** Read a provider's key from the OS keychain, or null if unavailable/absent. */
export async function readKey(provider: Provider): Promise<string | null> {
  const mod = await loadKeyring();
  if (!mod) {
    return null;
  }
  try {
    const entry = new mod.Entry(SERVICE, provider);
    return entry.getPassword() || null;
  } catch {
    // No stored password, or a keychain access error — treat as absent.
    return null;
  }
}

/** Store a provider's key in the OS keychain. Returns false if it could not be saved. */
export async function writeKey(provider: Provider, key: string): Promise<boolean> {
  const mod = await loadKeyring();
  if (!mod) {
    return false;
  }
  try {
    new mod.Entry(SERVICE, provider).setPassword(key);
    return true;
  } catch {
    return false;
  }
}

/** Remove a provider's key from the OS keychain. Returns false if nothing was removed. */
export async function deleteKey(provider: Provider): Promise<boolean> {
  const mod = await loadKeyring();
  if (!mod) {
    return false;
  }
  try {
    return new mod.Entry(SERVICE, provider).deletePassword();
  } catch {
    return false;
  }
}
