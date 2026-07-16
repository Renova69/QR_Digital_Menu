import { authenticatedNoStore } from './authenticated-no-store.middleware';

describe('authenticatedNoStore', () => {
  it('prevents storage of cookie-authenticated responses', () => {
    const setHeader = jest.fn();
    const next = jest.fn();

    authenticatedNoStore(
      { headers: {}, cookies: { token: 'jwt' } } as any,
      { setHeader } as any,
      next,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store, no-cache, max-age=0, must-revalidate',
    );
    expect(setHeader).toHaveBeenCalledWith('Surrogate-Control', 'no-store');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('leaves anonymous public responses cacheable', () => {
    const setHeader = jest.fn();
    const next = jest.fn();

    authenticatedNoStore(
      { headers: {}, cookies: {} } as any,
      { setHeader } as any,
      next,
    );

    expect(setHeader).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
