import { spawnSync } from 'child_process';
import path from 'path';

const cliPath = path.resolve(process.cwd(), 'src/index.js');

describe('index CLI', () => {
  test('prints help and exits 0 with --help', () => {
    const result = spawnSync('node', [cliPath, '--help'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage:');
  });

  test('exits 1 for non-existing config file', () => {
    const result = spawnSync('node', [cliPath, 'config/not-exists.json'], {
      cwd: process.cwd(),
      encoding: 'utf8'
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Fatal Error:');
  });
});
