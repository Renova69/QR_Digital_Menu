import Stripe from 'stripe';
import { fetchWithDependencyPool } from './dependency-http';

/** Both Stripe clients share the bounded pool and request's cancellation signal. */
export function createStripeHttpClient(): ReturnType<
  typeof Stripe.createFetchHttpClient
> {
  return {
    getClientName: () => 'fetch',
    makeRequest(...args) {
      // The SDK clears its fetch timer after headers. Keep its per-attempt
      // timeout active through body consumption too, including background calls
      // that intentionally have no inbound request budget. Honour SDK overrides.
      const providerSignal = AbortSignal.timeout(args[7]);
      return Stripe.createFetchHttpClient((input, init) =>
        fetchWithDependencyPool('stripe', input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([providerSignal, init.signal])
            : providerSignal,
        }),
      ).makeRequest(...args);
    },
  };
}
