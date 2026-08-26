import { Injectable, type OnApplicationShutdown } from '@nestjs/common';
import { Agent as HttpAgent, type AgentOptions } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { Agent as UndiciAgent, type Dispatcher } from 'undici';

export type FetchDependency = 'resend' | 'sms-gateway' | 'twilio' | 'weather';

export type NodeHttpDependency =
  | 'borica'
  | 'deepl'
  | 'google-oauth'
  | 'public-image'
  | 'r2'
  | 'stripe'
  | 'web-push';

/**
 * Each provider gets its own small pool. A slow Resend/Twilio/Weather upstream
 * can queue work for that provider, but cannot consume an unbounded number of
 * process sockets or drain another provider's pool.
 */
export const DEPENDENCY_FETCH_POOL_OPTIONS = Object.freeze({
  connections: 4,
  pipelining: 1,
  maxOrigins: 1,
  connectTimeout: 3_000,
  headersTimeout: 15_000,
  bodyTimeout: 20_000,
}) satisfies UndiciAgent.Options;

/** Node HTTP(S) equivalent for axios and SDK clients. */
export const DEPENDENCY_NODE_AGENT_OPTIONS = Object.freeze({
  keepAlive: true,
  maxSockets: 4,
  maxTotalSockets: 4,
  maxFreeSockets: 2,
  timeout: 30_000,
}) satisfies AgentOptions;

export interface DependencyNodeAgents {
  httpAgent: HttpAgent;
  httpsAgent: HttpsAgent;
}

const fetchDispatchers = new Map<FetchDependency, UndiciAgent>();
const nodeAgents = new Map<NodeHttpDependency, DependencyNodeAgents>();

export function getDependencyFetchDispatcher(
  dependency: FetchDependency,
): UndiciAgent {
  const existing = fetchDispatchers.get(dependency);
  if (existing) return existing;

  const dispatcher = new UndiciAgent(DEPENDENCY_FETCH_POOL_OPTIONS);
  fetchDispatchers.set(dependency, dispatcher);
  return dispatcher;
}

export function getDependencyNodeAgents(
  dependency: NodeHttpDependency,
): DependencyNodeAgents {
  const existing = nodeAgents.get(dependency);
  if (existing) return existing;

  const agents = {
    httpAgent: new HttpAgent(DEPENDENCY_NODE_AGENT_OPTIONS),
    httpsAgent: new HttpsAgent(DEPENDENCY_NODE_AGENT_OPTIONS),
  };
  nodeAgents.set(dependency, agents);
  return agents;
}

type DispatcherRequestInit = RequestInit & { dispatcher: Dispatcher };

/**
 * Keep `globalThis.fetch` as the seam so existing network-blocking tests and
 * mocks remain effective, while selecting a provider-specific dispatcher.
 */
export function fetchWithDependencyPool(
  dependency: FetchDependency,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): ReturnType<typeof fetch> {
  return globalThis.fetch(input, {
    ...init,
    dispatcher: getDependencyFetchDispatcher(dependency),
  } as DispatcherRequestInit);
}

export async function closeDependencyHttpPools(): Promise<void> {
  // Shutdown must not wait indefinitely for an already-hung upstream body.
  // The process is exiting, so abort in-flight provider requests explicitly.
  const dispatcherDestroys = Array.from(
    fetchDispatchers.values(),
    (dispatcher) => dispatcher.destroy(),
  );
  fetchDispatchers.clear();

  for (const agents of nodeAgents.values()) {
    agents.httpAgent.destroy();
    agents.httpsAgent.destroy();
  }
  nodeAgents.clear();

  await Promise.all(dispatcherDestroys);
}

@Injectable()
export class DependencyHttpPoolLifecycle implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await closeDependencyHttpPools();
  }
}
