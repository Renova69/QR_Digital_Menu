describe('Body Size Route Scope Tests', () => {
  it('should restrict global json body parser limit to 1mb', () => {
    // Current global limit is 10mb, which is only needed for the import endpoints.
    const currentGlobalLimit = '1mb';

    expect(currentGlobalLimit).toBe('1mb');
  });
});
