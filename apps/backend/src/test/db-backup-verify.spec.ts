import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * P0-7: two zero-byte .bak files sat in backups/ for a fortnight looking like
 * real backups. pg_dump had failed and the script had exited non-zero, but
 * nothing inspected the artifact and nothing removed the corpse — so the
 * directory listing showed a "backup" for those dates, which is exactly what
 * you check during an incident.
 *
 * db-backup.js is a plain CommonJS script with a shebang, so it is exercised
 * in a child process the same way db-cli-url.spec.ts does it, rather than
 * imported into the Jest module registry.
 */
const SCRIPT = resolve(__dirname, '../../scripts/db-backup.js');

const DRIVER = `
const { verifyArtifact, discardArtifact } = require(process.argv[1]);
const action = process.argv[2];
const target = process.argv[3];
try {
  if (action === 'verify') {
    verifyArtifact(target);
    process.stdout.write('OK');
  } else {
    discardArtifact(target);
    process.stdout.write('DISCARDED');
  }
} catch (error) {
  process.stderr.write(error.message);
  process.exitCode = 1;
}
`;

function run(action: 'verify' | 'discard', target: string) {
  const result = spawnSync(
    process.execPath,
    ['-e', DRIVER, SCRIPT, action, target],
    { encoding: 'utf8' },
  );
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('db-backup artifact verification', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'qr-backup-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('rejects a zero-byte dump', () => {
    const target = join(dir, 'empty.bak');
    writeFileSync(target, '');

    const { status, stderr } = run('verify', target);

    expect(status).toBe(1);
    expect(stderr).toMatch(/implausibly small/i);
  });

  it('rejects a dump that is too small to be real', () => {
    const target = join(dir, 'tiny.bak');
    writeFileSync(target, Buffer.alloc(1024, 1));

    const { status, stderr } = run('verify', target);

    expect(status).toBe(1);
    expect(stderr).toMatch(/implausibly small/i);
  });

  it('rejects a file that is large enough but is not a readable archive', () => {
    const target = join(dir, 'garbage.bak');
    // Past the size floor, so only actually reading the archive catches it.
    writeFileSync(target, Buffer.alloc(64 * 1024, 0x41));

    const { status, stderr } = run('verify', target);

    // On a machine without pg_restore the size check is all that can run, and
    // this file clears it — the script says so rather than failing silently.
    if (status === 0) {
      expect(stderr).toMatch(/skipping archive integrity check/i);
    } else {
      expect(stderr).toMatch(/not a readable custom-format archive/i);
    }
  });

  it('reports a missing file rather than treating absence as success', () => {
    const { status, stderr } = run('verify', join(dir, 'nope.bak'));

    expect(status).toBe(1);
    expect(stderr).toMatch(/produced no file/i);
  });

  it('removes an unusable artifact so it cannot masquerade as a backup', () => {
    const target = join(dir, 'empty.bak');
    writeFileSync(target, '');
    expect(existsSync(target)).toBe(true);

    const { status } = run('discard', target);

    expect(status).toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  it('does not throw when there is nothing to discard', () => {
    const { status } = run('discard', join(dir, 'absent.bak'));

    expect(status).toBe(0);
  });
});
