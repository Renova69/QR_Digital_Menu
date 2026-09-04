import { createRequire } from 'node:module';

// Resolve through the actual consumer: qs is transitive and may not be hoisted
// to the workspace root after npm applies the parent-scoped overrides.
const parse: typeof import('qs').parse = createRequire(
  require.resolve('express'),
)('qs').parse;

// GHSA-x5fp-wj9c-mxmx: protect the installed dependency, not an application
// configuration claim. This opt-in parser mode must enforce the same limit
// for plain keys, bracketed keys and object input.
describe('installed query parser security', () => {
  const options = {
    comma: true,
    arrayLimit: 3,
    throwOnLimitExceeded: true,
  };

  it.each(['a=1,2,3,4', 'a[]=1,2,3,4', { 'a[]': '1,2,3,4' }])(
    'rejects an oversized comma array: %j',
    (input) => {
      expect(() => parse(input, options)).toThrow(RangeError);
    },
  );

  it('preserves bracketed arrays at the configured limit', () => {
    expect(parse('a[]=1,2,3', options)).toEqual({
      a: [['1', '2', '3']],
    });
  });

  it('preserves ordinary nested query and Unicode form values', () => {
    expect(
      parse('filter[status]=NEW&tag=one&tag=two&name=%D0%A2%D0%B5%D1%81%D1%82'),
    ).toEqual({
      filter: { status: 'NEW' },
      tag: ['one', 'two'],
      name: 'Тест',
    });
  });
});
