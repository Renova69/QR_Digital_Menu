// Windows-safe wrapper for `prisma generate`.
// If the command fails with EPERM (engine DLL locked by a running dev server),
// it warns and exits 0 so `nest build` can still proceed with the existing
// generated client.  All other errors propagate as a non-zero exit code.
const { spawnSync } = require('child_process');

const result = spawnSync('npx', ['prisma', 'generate'], {
  stdio: 'inherit',
  // shell required on Windows because npx is a .cmd wrapper
  shell: process.platform === 'win32',
});

if (result.status !== 0) {
  const stderr = (result.stderr ?? Buffer.alloc(0)).toString();
  if (/EPERM|access is denied/i.test(stderr)) {
    console.warn(
      '[build:safe] prisma generate skipped — engine binary locked by another process.',
      'Existing generated client will be used.',
    );
  } else {
    console.error('[build:safe] prisma generate failed (exit', result.status, ')');
    process.exit(result.status ?? 1);
  }
}
