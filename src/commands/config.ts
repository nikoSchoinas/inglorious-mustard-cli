import { Command } from 'commander';
import {
  configExists,
  configPath,
  keyringAvailable,
  loadConfig,
  resolveApiKey,
  saveConfig,
  writeKey,
} from '../config/index.js';
import { bundledDefaults, providerDocsUrl } from '../llm/manifest.js';
import type { ApiKeySource, MustardConfig, Provider } from '../schemas/config.js';
import { pc } from '../ui/color.js';

/**
 * `mustard config` (spec §9.6) — the M4 skeleton: show the current provider/model
 * config and set provider, models, key and telemetry. The interactive first-run
 * wizard belongs to `init` (M6) and `config models --list` (remote manifest
 * browsing) is deferred to M14; this command is the resolution layer with a thin,
 * flag-driven surface so it is fully unit-testable.
 */

export interface ConfigSetOptions {
  provider?: Provider;
  fast?: string;
  deep?: string;
  telemetry?: boolean;
  apiKey?: string;
  keySource?: ApiKeySource;
}

export type KeyStorage = 'config' | 'keyring' | 'env' | 'none';

export interface ConfigSetResult {
  config: MustardConfig;
  /** Where the key ended up (or 'none' when no key was provided). */
  keyStored: KeyStorage;
  /** Set when a requested keyring store degraded to config-file storage. */
  degradedFromKeyring?: boolean;
}

/**
 * Apply a set of overrides to the stored config, creating one from manifest
 * defaults when none exists. Pure over the filesystem `home` so tests isolate it.
 * A key is written to keyring/config/env per `keySource`; keyring unavailability
 * degrades to config-file storage rather than failing.
 */
export async function applyConfigSet(
  options: ConfigSetOptions,
  home?: string,
): Promise<ConfigSetResult> {
  const existing = loadConfig(home);
  const provider = options.provider ?? existing?.provider;
  if (!provider) {
    throw new Error('No provider configured. Pass --provider <anthropic|openai|google|ollama>.');
  }

  // Reseed models from the manifest when the provider changes and no explicit
  // override is given; otherwise keep what the user had.
  const providerChanged = existing?.provider !== provider;
  const base = existing && !providerChanged ? existing.models : bundledDefaults(provider);
  const models = {
    fast: options.fast ?? base.fast,
    deep: options.deep ?? base.deep,
  };

  const telemetry = options.telemetry ?? existing?.telemetry ?? false;

  // Resolve where the key should live.
  const requestedSource: ApiKeySource = options.keySource ?? existing?.apiKeySource ?? 'env';

  let apiKeySource: ApiKeySource = requestedSource;
  let apiKey: string | undefined =
    existing?.apiKeySource === 'config' ? existing.apiKey : undefined;
  let keyStored: KeyStorage = existing?.apiKey ? 'config' : 'none';
  let degradedFromKeyring = false;

  if (options.apiKey) {
    // A key was supplied — persist it per the requested source.
    if (requestedSource === 'keyring') {
      const ok = await writeKey(provider, options.apiKey);
      if (ok) {
        apiKeySource = 'keyring';
        apiKey = undefined; // never also write it to the file
        keyStored = 'keyring';
      } else {
        // Degrade to config-file storage (spec §9.1) rather than lose the key.
        apiKeySource = 'config';
        apiKey = options.apiKey;
        keyStored = 'config';
        degradedFromKeyring = true;
      }
    } else if (requestedSource === 'config') {
      apiKeySource = 'config';
      apiKey = options.apiKey;
      keyStored = 'config';
    } else {
      // 'env' can't persist a value; record the source and keep the key out of disk.
      apiKeySource = 'env';
      apiKey = undefined;
      keyStored = 'env';
    }
  } else if (options.keySource && options.keySource !== 'config') {
    // Switching source without a new key: drop any file-stored key.
    apiKey = undefined;
    keyStored = 'none';
  }

  const next: MustardConfig = {
    provider,
    models,
    apiKeySource,
    telemetry,
    // Only carry a key on disk when the source is 'config'.
    ...(apiKeySource === 'config' && apiKey ? { apiKey } : {}),
  };

  const saved = saveConfig(next, home);
  return { config: saved, keyStored, degradedFromKeyring };
}

/** Human-readable summary of the current config (or its absence). Pure — returns a string. */
export async function describeConfig(home?: string): Promise<string> {
  if (!configExists(home)) {
    return [
      `${pc.yellow('No configuration yet.')} Set one up with:`,
      '',
      `  ${pc.cyan('mustard config set --provider anthropic --api-key <key>')}`,
      '',
      `Config will be written to ${pc.dim(configPath(home))} (mode 0600).`,
    ].join('\n');
  }

  const config = loadConfig(home);
  if (!config) {
    return pc.red('Configuration is present but unreadable.');
  }

  const resolved = await resolveApiKey(config, {});
  const keyLine =
    resolved.source === 'none'
      ? pc.dim('not required (local provider)')
      : resolved.key
        ? `${pc.green('resolved')} from ${resolved.source}`
        : pc.red('missing — set one with `mustard config set --api-key <key>`');

  return [
    pc.bold('MUSTARD configuration'),
    `  provider    ${config.provider}`,
    `  fast model  ${config.models.fast}`,
    `  deep model  ${config.models.deep}`,
    `  key source  ${config.apiKeySource}`,
    `  api key     ${keyLine}`,
    `  telemetry   ${config.telemetry ? 'on (opt-in)' : 'off'}`,
    `  file        ${pc.dim(configPath(home))}`,
    `  docs        ${pc.dim(providerDocsUrl(config.provider))}`,
  ].join('\n');
}

/** Build the `config` command with `show` (default) and `set` subcommands. */
export function buildConfigCommand(): Command {
  const config = new Command('config').description('Provider, keys, models.');

  config
    .command('show', { isDefault: true })
    .description('Show the current provider, models, key source and telemetry.')
    .action(async () => {
      console.log(await describeConfig());
    });

  config
    .command('set')
    .description('Set provider, models, API key or telemetry.')
    .option('--provider <provider>', 'anthropic | openai | google | ollama')
    .option('--fast <model>', 'model ID for the fast (ANALYSE) tier')
    .option('--deep <model>', 'model ID for the deep (SYNTHESISE) tier')
    .option('--api-key <key>', 'API key to store')
    .option('--key-source <source>', 'env | config | keyring (where to keep the key)')
    .option('--telemetry', 'enable anonymised telemetry (opt-in, off by default)')
    .option('--no-telemetry', 'disable telemetry')
    .action(async (opts) => {
      const result = await applyConfigSet({
        provider: opts.provider,
        fast: opts.fast,
        deep: opts.deep,
        apiKey: opts.apiKey,
        keySource: opts.keySource,
        telemetry: opts.telemetry,
      });
      if (result.degradedFromKeyring) {
        console.log(
          pc.yellow('Keyring unavailable — key saved to the config file (mode 0600) instead.'),
        );
      }
      console.log(pc.green('Saved.'));
      console.log(await describeConfig());
    });

  return config;
}

/** Whether the OS keyring is usable here — surfaced by `describeConfig`/setup later. */
export { keyringAvailable };
