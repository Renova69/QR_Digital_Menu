import { RequestBudgetError } from './request-budget';
import { classifyProviderError } from './provider-circuit';

describe('provider circuit classification', () => {
  it.each([400, 401, 402, 403, 404, 409, 422])(
    'treats provider HTTP %i as reachable, not an outage',
    (status) => {
      expect(classifyProviderError({ statusCode: status })).toBe('healthy');
    },
  );

  it.each([429, 500, 502, 503])(
    'counts provider HTTP %i as a failure',
    (status) => {
      expect(classifyProviderError({ response: { status } })).toBe('failure');
    },
  );

  it('reads AWS SDK status metadata', () => {
    expect(classifyProviderError({ $metadata: { httpStatusCode: 403 } })).toBe(
      'healthy',
    );
  });

  it.each([
    new RequestBudgetError('deadline'),
    Object.assign(new Error('cancelled'), { name: 'AbortError' }),
  ])('does not count request cancellation as provider failure', (error) => {
    expect(classifyProviderError(error)).toBe('ignored');
  });

  it('counts transport errors with no HTTP response', () => {
    expect(classifyProviderError(new Error('connection reset'))).toBe(
      'failure',
    );
  });
});
