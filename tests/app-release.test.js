import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('app release scripts enforce source, archive and process boundaries', () => {
  const result = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    ['-B', '-m', 'unittest', 'discover', '-s', 'scripts/app-release', '-p', 'test_*.py'],
    { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, `${result.error || ''}\n${result.stdout}\n${result.stderr}`);
});
