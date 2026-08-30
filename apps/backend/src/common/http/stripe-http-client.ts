import Stripe from 'stripe';
import { fetchWithDependencyPool } from './dependency-http';
import {
  createProviderCircuit,
  classifyProviderError,
} from './provider-circuit';

/** Both Stripe clients share the bounded pool and request's cancellation signal. */
export function createStripeHttpClient(): ReturnType<
  typeof Stripe.createFetchHttpClient
> {
  const circuit = createProviderCircuit('stripe');
  return {
    getClientName: () => 'fetch',
    async makeRequest(...args) {
      // The SDK clears its fetch timer after headers. Keep its per-attempt
      // timeout active through body consumption too, including background calls
      // that intentionally have no inbound request budget. Honour SDK overrides.
      const providerSignal = AbortSignal.timeout(args[7]);
      return circuit.execute(
        () =>
          Stripe.createFetchHttpClient((input, init) =>
            fetchWithDependencyPool('stripe', input, {
              ...init,
              signal: init?.signal
                ? AbortSignal.any([providerSignal, init.signal])
                : providerSignal,
            }),
          ).makeRequest(...args),
        {
          error: classifyProviderError,
          failedResponse(response) {
            const status = response.getStatusCode();
            return status === 429 || status >= 500;
          },
        },
      );
    },
  };
}
