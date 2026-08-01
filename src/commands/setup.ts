import {
  PROVIDER_ENV_VAR,
  configExists,
  loadConfig,
  requiresKey,
  resolveApiKey,
} from '../config/index.js';
import { checkConnectivity as realCheckConnectivity } from '../llm/connectivity.js';
import type { ConnectivityResult } from '../llm/connectivity.js';
import { providerDocsUrl } from '../llm/manifest.js';
import { type LLMTransport, createTransport, modeFromEnv } from '../llm/transport.js';
import type { ApiKeySource, MustardConfig, Provider } from '../schemas/config.js';
import { pc } from '../ui/color.js';
import type { Prompter } from '../ui/prompter.js';
import { applyConfigSet } from './config.js';

/**
 * Phase 0's "0.5" step (spec §8.3 step 0.5, §9.8) — API-key capture, connectivity
 * check and telemetry consent. Not a declarative `Question`: it is a special engine
 * step run after Phase 0's structured questions and before Phase 1's first LLM call.
 *
 * Idempotent by design: on `resume` (or a re-run) it reuses an existing config whose
 * provider matches and whose key resolves, asking nothing. Otherwise it runs the
 * interactive first-run setup for the provider the user chose in Phase 0.
 */

export type CheckConnectivityFn = (
  config: MustardConfig,
  opts: { transport: LLMTransport; apiKey?: string },
) => Promise<ConnectivityResult>;

export interface SetupDeps {
  prompter: Prompter;
  /** Config home (`~/.mustard`); injectable so tests isolate the filesystem. */
  home?: string;
  env?: NodeJS.ProcessEnv;
  transport?: LLMTransport;
  checkConnectivity?: CheckConnectivityFn;
  /** Injected so tests assert the failure exit without terminating the runner. */
  exit?: (code: number) => never;
  print?: (message: string) => void;
}

export interface SetupResult {
  config: MustardConfig;
  /** The resolved key (undefined for keyless Ollama). */
  apiKey?: string;
}

export async function runSetup(provider: Provider, deps: SetupDeps): Promise<SetupResult> {
  const env = deps.env ?? process.env;

  // Reuse path: an existing config for the same provider with a resolvable key.
  if (configExists(deps.home)) {
    const existing = loadConfig(deps.home);
    if (existing && existing.provider === provider) {
      const resolved = await resolveApiKey(existing, { env });
      if (resolved.source !== 'missing') {
        const apiKey = resolved.key ?? undefined;
        await verifyConnectivity(existing, apiKey, deps);
        return { config: existing, apiKey };
      }
    }
  }

  // Fresh setup for the chosen provider.
  let apiKey: string | undefined;
  let keySource: ApiKeySource = 'env';

  if (requiresKey(provider)) {
    const envVar = PROVIDER_ENV_VAR[provider];
    const fromEnv = envVar ? env[envVar]?.trim() : undefined;
    if (fromEnv) {
      apiKey = fromEnv;
      keySource = 'env';
      deps.prompter.note(`Using ${envVar} from your environment.`, 'Key');
    } else {
      const entered = await deps.prompter.text({
        message: `Paste your ${provider} API key:`,
        help: `Stored locally in your config file (mode 0600). Keys and models: ${providerDocsUrl(provider)}`,
      });
      apiKey = entered.trim();
      keySource = 'config';
    }
  }

  const telemetry = await deps.prompter.confirm({
    message: 'Share anonymous usage metrics to help improve MUSTARD?',
    help: 'Opt-in and off by default. Nothing is transmitted in this version.',
    initialValue: false,
  });

  const { config } = await applyConfigSet({ provider, apiKey, keySource, telemetry }, deps.home);
  const resolved = await resolveApiKey(config, { env });
  const key = resolved.key ?? apiKey ?? undefined;
  await verifyConnectivity(config, key, deps);
  return { config, apiKey: key };
}

/** One cheap structured call before Phase 1, so a bad key fails fast (§9.8). */
async function verifyConnectivity(
  config: MustardConfig,
  apiKey: string | undefined,
  deps: SetupDeps,
): Promise<void> {
  const check = deps.checkConnectivity ?? realCheckConnectivity;
  const transport = deps.transport ?? createTransport(modeFromEnv());
  const result = await check(config, { transport, apiKey });
  if (result.status === 'ok') {
    deps.prompter.note(pc.green(`Connected to ${config.provider}.`), 'Recon');
    return;
  }

  const print = deps.print ?? ((m: string) => console.error(m));
  const exit = deps.exit ?? ((code: number) => process.exit(code) as never);
  if (result.status === 'invalid-key') {
    print(
      pc.red(
        `Your ${config.provider} API key was rejected. Fix it with \`mustard config set --api-key <key>\`, then run \`mustard resume\`.`,
      ),
    );
  } else {
    print(
      pc.red(
        `Couldn't reach ${config.provider}. Check your connection, then run \`mustard resume\`.\n(${result.detail})`,
      ),
    );
  }
  return exit(1);
}
