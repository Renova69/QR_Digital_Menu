import {
  assertSafePrismaCommand,
  isDestructivePrismaCommand,
} from '../../scripts/prisma-cli-safety';

const remote = 'postgresql://user:test-secret@db.example.test/prod';
const local = 'postgresql://postgres:test-secret@127.0.0.1:5432/disposable';

describe('Prisma CLI production safety', () => {
  it.each([
    ['migrate', 'reset'],
    ['migrate', 'dev'],
    ['db', 'push'],
    ['db', 'execute'],
  ])('blocks direct prisma %s %s against a remote database', (...command) => {
    expect(() =>
      assertSafePrismaCommand(['node', 'prisma', ...command], remote),
    ).toThrow(/BLOCKED/);
  });

  it('allows migrate deploy against a remote database', () => {
    expect(() =>
      assertSafePrismaCommand(['node', 'prisma', 'migrate', 'deploy'], remote),
    ).not.toThrow();
  });

  it('allows reset only for an explicitly local disposable database', () => {
    expect(() =>
      assertSafePrismaCommand(['node', 'prisma', 'migrate', 'reset'], local),
    ).not.toThrow();
  });

  it('treats an unknown target as unsafe', () => {
    expect(() =>
      assertSafePrismaCommand(['node', 'prisma', 'db', 'push'], undefined),
    ).toThrow(/BLOCKED/);
  });

  it.each([
    'postgresql://postgres:test-secret@0.0.0.0:5432/disposable',
    'postgresql://postgres:test-secret@database.local:5432/disposable',
  ])('does not treat a wildcard or LAN hostname as loopback: %s', (target) => {
    expect(() =>
      assertSafePrismaCommand(['node', 'prisma', 'migrate', 'reset'], target),
    ).toThrow(/BLOCKED/);
  });

  it('classifies only mutation-capable development commands as destructive', () => {
    expect(isDestructivePrismaCommand(['prisma', 'migrate', 'status'])).toBe(
      false,
    );
    expect(isDestructivePrismaCommand(['prisma', 'migrate', 'deploy'])).toBe(
      false,
    );
  });
});
