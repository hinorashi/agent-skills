import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer as createHttpsServer } from 'node:https';
import { devNull, tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  askYesNo, curlRequest, extractReleaseNotes, isNewerVersion, parseArgs, prepareChangelog, release, runGit,
} from './release.mjs';

const script = fileURLToPath(new URL('./release.mjs', import.meta.url));

function fixture(t, { scripts, changelog, lock = true, provider = 'gitea', npm = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ganttz-full-release-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const cwd = join(root, 'work');
  const bare = join(root, 'remote.git');
  mkdirSync(cwd);
  const env = {
    ...process.env,
    HOME: root,
    GIT_CONFIG_GLOBAL: devNull,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
    GCM_INTERACTIVE: 'never',
    GITEA_TOKEN: 'fixture-gitea-token',
    GH_TOKEN: 'fixture-github-token',
    npm_config_update_notifier: 'false',
  };
  const git = (...args) => execFileSync('git', args, {
    cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  git('init', '-b', 'main');
  git('config', 'user.name', 'Release Test');
  git('config', 'user.email', 'release-test@example.test');
  git('config', 'commit.gpgsign', 'false');
  git('init', '--bare', '--initial-branch=main', bare);
  git('remote', 'add', 'origin', bare);
  const pkg = {
    name: 'project', version: '1.1.0', private: true,
    scripts: scripts || { test: 'node -e "process.exit(0)"', build: 'node -e "process.exit(0)"' },
  };
  if (npm) writeFileSync(join(cwd, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  if (npm && lock) {
    writeFileSync(join(cwd, 'package-lock.json'), `${JSON.stringify({
      name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true,
      packages: { '': { name: pkg.name, version: pkg.version } },
    }, null, 2)}\n`);
  }
  writeFileSync(join(cwd, 'CHANGELOG.md'), changelog || '# Changelog\n\n## [Unreleased]\n\n### Added\n\n- Tính năng mới.\n\n## [1.1.0] - 2026-01-01\n\n- Bản trước.\n\n[Unreleased]: #unreleased\n[1.1.0]: #110---2026-01-01\n');
  git('add', '.');
  git('commit', '-m', 'feat: prepare release fixture',
    '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>');
  git('push', 'origin', 'main');
  const head = git('rev-parse', 'HEAD');
  const host = provider === 'github' ? 'github.com' : 'gitea.com';
  const url = `https://${host}/team/project.git`;
  const calls = [];
  function wrappedGit(args, options) {
    calls.push([...args]);
    if (args[0] === 'remote' && args[1] === 'get-url') return `${url}\n`;
    const mapped = [...args];
    if (['push', 'ls-remote'].includes(args[0])) mapped[mapped.indexOf('--') + 1] = bare;
    return runGit(mapped, options);
  }
  let published;
  let deleted = 0;
  const requests = [];
  async function request(url, options) {
    const path = new URL(url).pathname;
    requests.push({ path, ...options });
    if (path.endsWith('/repos/team/project')) {
      return { status: 200, body: { full_name: 'team/project', permissions: { push: true } } };
    }
    if (path.includes('/releases/tags/')) {
      return published ? { status: 200, body: published } : { status: 404 };
    }
    if (path.includes(`/git/${provider === 'github' ? 'ref' : 'refs'}/tags/`)) {
      const tag = decodeURIComponent(path.split('/tags/')[1]);
      const ref = {
        ref: `refs/tags/${tag}`,
        object: { sha: git(`--git-dir=${bare}`, 'rev-parse', `refs/tags/${tag}`), type: 'tag' },
      };
      return { status: 200, body: provider === 'github' ? ref : [ref] };
    }
    if (path.endsWith('/releases/7') && options.method === 'DELETE') {
      deleted += 1;
      published = undefined;
      return { status: 204 };
    }
    if (path.endsWith('/releases') && options.method === 'POST') {
      published = {
        ...options.body, id: 7, html_url: `https://${host}/team/project/releases/tag/${options.body.tag_name}`,
        published_at: '2026-11-12T00:00:00Z',
      };
      return { status: 201, body: published };
    }
    throw new Error(`Unexpected request: ${options.method} ${path}`);
  }
  return {
    cwd, bare, env, git, wrappedGit, head, calls, requests, request,
    get published() { return published; },
    get deleted() { return deleted; },
  };
}

function execute(f, args = ['v1.2.0'], options = {}) {
  let output = '';
  const promise = release(args, {
    cwd: f.cwd, env: f.env, git: f.wrappedGit, request: f.request,
    confirm: async () => true, now: new Date(2026, 10, 12),
    write: text => { output += text; }, ...options,
  });
  return { promise, output: () => output };
}

function actualPushes(f) {
  return f.calls.filter(args => args[0] === 'push' && !args.includes('--dry-run'));
}

test('version ordering follows SemVer, including prerelease identifiers', () => {
  assert.equal(isNewerVersion('1.2.0', '1.1.9'), true);
  assert.equal(isNewerVersion('1.2.0', '1.2.0-rc.1'), true);
  assert.equal(isNewerVersion('1.2.0-rc.10', '1.2.0-rc.2'), true);
  assert.equal(isNewerVersion('1.2.0-rc.a', '1.2.0-rc.10'), true);
  assert.equal(isNewerVersion('1.2.0-rc.1', '1.2.0'), false);
  assert.equal(isNewerVersion('1.2.0+new', '1.2.0+old'), false);
  assert.equal(isNewerVersion('1.2.0', '1.2.0'), false);
  assert.throws(() => isNewerVersion('1.02.0', '1.1.0'), /SemVer/);
});

test('changelog promotion preserves Unreleased, notes, UTF-8 and links', () => {
  const source = '# Changelog\r\n\r\n## [Unreleased]\r\n\r\n### Added\r\n\r\n- Có dấu.\r\n\r\n## [1.1.0]\r\n\r\n- Cũ.\r\n\r\n[Unreleased]: https://github.com/team/project/compare/v1.1.0...HEAD\r\n[1.1.0]: #110\r\n';
  const updated = prepareChangelog(source, '1.2.0', 'v1.2.0', '2026-11-12');
  assert.match(updated, /## \[Unreleased\]\r\n\r\n## \[1\.2\.0\] - 2026-11-12\r\n\r\n### Added\r\n\r\n- Có dấu/);
  assert.match(updated, /\[Unreleased\]: https:\/\/github.com\/team\/project\/compare\/v1\.2\.0\.\.\.HEAD/);
  assert.match(updated, /\[1\.2\.0\]: https:\/\/github.com\/team\/project\/compare\/v1\.1\.0\.\.\.v1\.2\.0/);
  assert.match(updated, /## \[1\.1\.0\]\r\n\r\n- Cũ/);
  assert.doesNotMatch(updated, /(?<!\r)\n/);
  assert.throws(() => prepareChangelog('## [Unreleased]\n\n### Added\n', '1.2.0', 'v1.2.0', '2026-11-12'), /không có ghi chú/);
  assert.throws(() => prepareChangelog('## [Unreleased]\n\n- Notes\n\n## [1.2.0]\n', '1.2.0', 'v1.2.0', '2026-11-12'), /đã có phiên bản/);
  const first = prepareChangelog('\uFEFF## [Unreleased]\n\n- First release.\n', '1.0.0-RC.1', 'v1.0.0-RC.1', '2026-11-12');
  assert.ok(first.startsWith('\uFEFF'));
  assert.match(first, /\[1\.0\.0-RC\.1\]: #100-rc1---2026-11-12/);
});

test('standalone help does not require a repository or a terminal', () => {
  const result = spawnSync(process.execPath, [script, '--help'], { encoding: 'utf8', cwd: tmpdir() });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /--delete, -d/);
  assert.match(result.stdout, /hỏi trước khi commit/);
});

test('commit prompt waits for an explicit yes and defaults to no, including EOF', async t => {
  for (const [answer, expected] of [['yes\n', true], ['Y\n', true], ['\n', false], ['no\n', false], [undefined, false]]) {
    await t.test(String(answer), async () => {
      const input = new PassThrough();
      const output = new PassThrough();
      let text = '';
      output.on('data', chunk => { text += chunk; });
      let settled = false;
      const prompt = askYesNo('Commit và công bố? [y/N] ', { input, output }).then(value => {
        settled = true;
        return value;
      });
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(settled, false);
      assert.match(text, /\[y\/N\]/);
      if (answer === undefined) input.end();
      else input.write(answer);
      assert.equal(await prompt, expected);
      input.end();
      output.end();
    });
  }
});

test('stops on tracked, staged or untracked changes without modifying anything', async t => {
  for (const kind of ['tracked', 'staged', 'untracked']) {
    await t.test(kind, async t => {
      const f = fixture(t);
      if (kind === 'tracked') writeFileSync(join(f.cwd, 'CHANGELOG.md'), 'User edits.\n');
      else {
        writeFileSync(join(f.cwd, 'user.txt'), 'User changes.\n');
        if (kind === 'staged') f.git('add', 'user.txt');
      }
      const before = f.git('status', '--porcelain');
      const run = execute(f, ['v1.2.0'], {
        request: () => assert.fail('dirty worktree must not contact API'),
        npm: () => assert.fail('dirty worktree must not run npm'),
        confirm: () => assert.fail('dirty worktree must not ask to commit'),
      });
      await assert.rejects(run.promise, /Hãy commit hoặc xử lý/);
      assert.match(run.output(), /Cảnh báo.*chưa commit/);
      assert.equal(f.git('status', '--porcelain'), before);
      assert.equal(f.git('rev-parse', 'HEAD'), f.head);
      assert.equal(actualPushes(f).length, 0);
    });
  }
});

test('clean non-interactive CLI cannot bypass commit confirmation', t => {
  const f = fixture(t);
  const result = spawnSync(process.execPath, [script, 'v1.2.0'], { cwd: f.cwd, env: f.env, encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /terminal tương tác/);
  assert.equal(f.git('status', '--porcelain'), '');
});

test('approval happens after version preparation and checks, before commit/tag/push', async t => {
  const f = fixture(t);
  let approvals = 0;
  const run = execute(f, ['v1.2.0', '--name', 'Project 1.2.0'], {
    confirm: async prompt => {
      approvals += 1;
      assert.match(prompt, /commit.*tag.*đẩy.*release/);
      assert.equal(f.git('rev-parse', 'HEAD'), f.head);
      assert.equal(f.git('tag', '--list'), '');
      assert.equal(f.git('diff', '--cached', '--name-only'), '');
      assert.equal(JSON.parse(readFileSync(join(f.cwd, 'package.json'))).version, '1.2.0');
      assert.match(readFileSync(join(f.cwd, 'CHANGELOG.md'), 'utf8'), /## \[1\.2\.0\] - 2026-11-12/);
      assert.equal(actualPushes(f).length, 0);
      return true;
    },
  });
  assert.equal((await run.promise).status, 'published');
  assert.equal(approvals, 1);
  assert.equal(f.git('rev-parse', 'HEAD^'), f.head);
  assert.equal(f.git('rev-parse', 'v1.2.0^{}'), f.git('rev-parse', 'HEAD'));
  assert.equal(f.git(`--git-dir=${f.bare}`, 'rev-parse', 'main'), f.git('rev-parse', 'HEAD'));
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(JSON.parse(readFileSync(join(f.cwd, 'package-lock.json'))).packages[''].version, '1.2.0');
  assert.equal(f.git('log', '-1', '--format=%B'),
    'chore: release version 1.2.0\n\nCo-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>');
  assert.equal(f.published.name, 'Project 1.2.0');
  assert.match(run.output(), /Chạy npm run test.*Chạy npm run build/s);
  assert.match(run.output(), /diff --git/);
  assert.ok(actualPushes(f).every(args => args.includes('--atomic') && !args.includes('--force')));
});

test('declining confirmation reverts prepared files without commit, tag or push', async t => {
  const f = fixture(t);
  const run = execute(f, ['v1.2.0'], { confirm: async () => false });
  assert.equal((await run.promise).status, 'cancelled');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(f.git('tag', '--list'), '');
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(actualPushes(f).length, 0);
  assert.match(run.output(), /Đã hủy và hoàn tác CHANGELOG\.md, package\.json/);
});

test('declining confirmation keeps files edited while waiting', async t => {
  const f = fixture(t);
  const run = execute(f, ['v1.2.0'], {
    confirm: async () => {
      writeFileSync(join(f.cwd, 'CHANGELOG.md'), 'edited\n');
      return false;
    },
  });
  assert.equal((await run.promise).status, 'cancelled');
  assert.equal(readFileSync(join(f.cwd, 'CHANGELOG.md'), 'utf8'), 'edited\n');
  assert.match(f.git('status', '--porcelain'), /package.json/);
  assert.match(run.output(), /Không tự hoàn tác/);
});

test('failed validation stops before confirmation and preserves the prepared diff', async t => {
  const f = fixture(t, { scripts: { test: 'node -e "process.exit(1)"', build: 'node -e "process.exit(0)"' } });
  const run = execute(f, ['v1.2.0'], { confirm: () => assert.fail('must not ask after failed tests') });
  await assert.rejects(run.promise, /npm run test thất bại/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(f.git('tag', '--list'), '');
  assert.equal(f.git('diff', '--cached', '--name-only'), '');
  assert.equal(actualPushes(f).length, 0);
  assert.equal(JSON.parse(readFileSync(join(f.cwd, 'package.json'))).version, '1.2.0');
});

test('npm version lifecycle scripts cannot bypass release commit approval', async t => {
  const f = fixture(t, { scripts: {
    preversion: 'node -e "require(\'node:fs\').writeFileSync(\'unexpected.txt\', \'preversion\')"',
  } });
  assert.equal((await execute(f).promise).status, 'published');
  assert.equal(f.git('status', '--porcelain'), '');
});

test('validation scripts cannot add unrelated files to the release commit', async t => {
  const f = fixture(t, { scripts: {
    test: 'node -e "require(\'node:fs\').writeFileSync(\'unexpected.txt\', \'test output\')"',
  } });
  await assert.rejects(execute(f, ['v1.2.0'], {
    confirm: () => assert.fail('must stop before approving unrelated changes'),
  }).promise, /thay đổi hoặc staging ngoài/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(f.git('tag', '--list'), '');
});

test('API authentication failures happen before files are changed', async t => {
  const f = fixture(t);
  await assert.rejects(execute(f, ['v1.2.0'], { request: async () => ({ status: 401 }) }).promise, /HTTP 401/);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
});

test('existing local or remote tags are never overwritten', async t => {
  const f = fixture(t);
  f.git('tag', 'v1.2.0');
  await assert.rejects(execute(f).promise, /chưa được đẩy hoặc khác tag trên remote.*--delete/s);
  f.git(`--git-dir=${f.bare}`, 'tag', 'v1.3.0', f.head);
  await assert.rejects(execute(f, ['v1.3.0']).promise, /đã có trên remote nhưng không có cục bộ/);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(actualPushes(f).length, 0);
});

test('downgrades and empty changelogs fail before version preparation', async t => {
  const f = fixture(t);
  await assert.rejects(execute(f, ['v1.0.0']).promise, /phải mới hơn/);
  const empty = fixture(t, { changelog: '## [Unreleased]\n\n### Added\n' });
  await assert.rejects(execute(empty).promise, /không có ghi chú/);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(empty.git('status', '--porcelain'), '');
});

test('changes during confirmation are not committed', async t => {
  const f = fixture(t);
  const run = execute(f, ['v1.2.0'], {
    confirm: async () => {
      writeFileSync(join(f.cwd, 'other.txt'), 'Concurrent changes.\n');
      return true;
    },
  });
  await assert.rejects(run.promise, /thay đổi hoặc staging ngoài/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(f.git('tag', '--list'), '');
  assert.equal(actualPushes(f).length, 0);
});

test('a tag created during confirmation stops the workflow before committing', async t => {
  const f = fixture(t);
  await assert.rejects(execute(f, ['v1.2.0'], {
    confirm: async () => {
      f.git('tag', 'v1.2.0');
      return true;
    },
  }).promise, /vừa được tạo cục bộ/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(actualPushes(f).length, 0);
});

test('rejecting commit hooks are respected without creating a tag or pushing', async t => {
  const f = fixture(t);
  writeFileSync(join(f.cwd, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  await assert.rejects(execute(f).promise, /Git commit thất bại/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(f.git('tag', '--list'), '');
  assert.equal(actualPushes(f).length, 0);
  assert.match(f.git('diff', '--cached', '--name-only'), /package.json/);
});

test('hook changes to the approved commit are detected and never tagged or pushed', async t => {
  const f = fixture(t);
  writeFileSync(join(f.cwd, '.git', 'hooks', 'pre-commit'),
    '#!/bin/sh\nprintf "Hook addition\\n" > hook-added.txt\ngit add -- hook-added.txt\n', { mode: 0o755 });
  await assert.rejects(execute(f).promise, /hook đã thay đổi nội dung ngoài diff/);
  assert.equal(f.git('rev-parse', 'HEAD^'), f.head);
  assert.equal(f.git('tag', '--list'), '');
  assert.equal(actualPushes(f).length, 0);
});

test('failed pushes preserve the approved local commit and tag for recovery', async t => {
  const f = fixture(t);
  const git = (args, options) => {
    if (args[0] === 'push' && !args.includes('--dry-run')) throw new Error('Simulated push failure.');
    return f.wrappedGit(args, options);
  };
  await assert.rejects(execute(f, ['v1.2.0'], { git }).promise, /Commit cục bộ.*v1\.2\.0.*giữ nguyên/);
  assert.equal(f.git('rev-parse', 'HEAD^'), f.head);
  assert.equal(f.git('rev-parse', 'v1.2.0^{}'), f.git('rev-parse', 'HEAD'));
  assert.equal(f.git(`--git-dir=${f.bare}`, 'rev-parse', 'main'), f.head);
  assert.equal(f.requests.filter(call => call.method === 'POST').length, 0);
});

test('supports npm packages without a lockfile and GitHub release publishing', async t => {
  const f = fixture(t, { lock: false, provider: 'github', scripts: {} });
  const run = execute(f, ['1.2.0-rc.1']);
  assert.equal((await run.promise).status, 'published');
  assert.equal(f.published.prerelease, true);
  assert.equal(f.published.tag_name, 'v1.2.0-rc.1');
  assert.equal(f.git('rev-parse', 'v1.2.0-rc.1^{}'), f.git('rev-parse', 'HEAD'));
  assert.equal(JSON.parse(readFileSync(join(f.cwd, 'package.json'))).version, '1.2.0-rc.1');
  assert.match(readFileSync(join(f.cwd, 'CHANGELOG.md'), 'utf8'), /## \[1\.2\.0-rc\.1\] - /);
  assert.match(run.output(), /không có npm script "test"/);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.ok(f.requests.every(call => call.auth === 'Bearer fixture-github-token'));
});

test('publishing failures keep the pushed tag, and rerunning the same command publishes it', async t => {
  const f = fixture(t);
  const request = (url, options) => options.method === 'POST'
    ? Promise.resolve({ status: 500 })
    : f.request(url, options);
  await assert.rejects(execute(f, ['v1.2.0'], { request }).promise, /Commit cục bộ.*v1\.2\.0.*giữ nguyên/);
  assert.equal(f.git(`--git-dir=${f.bare}`, 'rev-parse', 'main'), f.git('rev-parse', 'HEAD'));
  assert.equal(f.git(`--git-dir=${f.bare}`, 'rev-parse', 'v1.2.0^{}'), f.git('rev-parse', 'HEAD'));
  assert.equal(f.git('status', '--porcelain'), '');
  const declined = execute(f, ['1.2.0'], { confirm: async () => false });
  assert.equal((await declined.promise).status, 'cancelled');
  assert.equal(f.published, undefined);
  let asked;
  const resumed = execute(f, ['1.2.0'], { confirm: async prompt => { asked = prompt; return true; } });
  assert.equal((await resumed.promise).status, 'published');
  assert.match(asked, /Công bố release/);
  assert.match(resumed.output(), /chưa có release/);
  assert.equal(f.published.body, '### Added\n\n- Tính năng mới.');
  assert.equal((await execute(f, ['1.2.0']).promise).status, 'existing');
});

test('branches behind the remote stop before version files are modified', async t => {
  const f = fixture(t);
  const other = join(f.cwd, '..', 'other');
  f.git('clone', f.bare, other);
  f.git('-C', other, 'config', 'user.name', 'Release Test');
  f.git('-C', other, 'config', 'user.email', 'release-test@example.test');
  writeFileSync(join(other, 'remote-change.txt'), 'Remote change.\n');
  f.git('-C', other, 'add', 'remote-change.txt');
  f.git('-C', other, 'commit', '-m', 'test: advance remote',
    '-m', 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>');
  f.git('-C', other, 'push', 'origin', 'main');
  await assert.rejects(execute(f).promise, /Hãy fetch và đồng bộ nhánh/);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
});

test('rejects build metadata before npm can silently remove it', async t => {
  const f = fixture(t);
  await assert.rejects(execute(f, ['v1.2.0+build.1']).promise, /build metadata/);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(f.requests.length, 0);
});

test('arguments accept versions with or without v; tags always use v', () => {
  assert.deepEqual(parseArgs(['1.2.0']), { version: '1.2.0', tag: 'v1.2.0' });
  assert.deepEqual(parseArgs(['v1.2.0', '--name', 'P 1.2.0']), { version: '1.2.0', tag: 'v1.2.0', name: 'P 1.2.0' });
  assert.deepEqual(parseArgs(['-d', '1.2.0-rc.1']), { delete: true, version: '1.2.0-rc.1', tag: 'v1.2.0-rc.1' });
  assert.deepEqual(parseArgs(['-h']), { help: true });
  assert.deepEqual(parseArgs(['1.2.0', '--fast']), { 'fast': true, version: '1.2.0', tag: 'v1.2.0' });
  for (const args of [
    [], ['1.2.0', '1.3.0'], ['1.2.0', '--unknown'], ['1.2.0', '-x'], ['1.2.0', '-d', '--delete'],
    ['1.2.0', '--name'], ['1.2.0', '--stable', '--prerelease'], ['vv1.2.0'], ['1.2'], ['1.2.0+meta'],
    ['-d', '1.2.0', '--name', 'x'], ['-d', '1.2.0', '--fast'], ['-d', '1.2.0', '--prerelease'], ['--help', '1.2.0'],
  ]) {
    assert.throws(() => parseArgs(args), undefined, args.join(' '));
  }
});

test('the single script can be copied alone into another project', t => {
  const root = mkdtempSync(join(tmpdir(), 'release-copy-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, 'release.mjs'), readFileSync(script));
  const result = spawnSync(process.execPath, [join(root, 'release.mjs'), '--help'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--delete/);
});

test('extracts exactly one release section and ignores headings inside fenced code', () => {
  const changelog = `# Changelog\n\n## [1.2.3] - 2026-01-02\n\n### Added\n\n\`\`\`md\n## not a release\n\`\`\`\n- Dấu tiếng Việt.\n\n## [1.2.2]\n\nOlder.\n`;
  assert.equal(extractReleaseNotes(changelog, 'v1.2.3'),
    '### Added\n\n```md\n## not a release\n```\n- Dấu tiếng Việt.');
  assert.equal(extractReleaseNotes('## v1.2.3\n\nNotes.\n\n## 1.0\nOlder.', 'v1.2.3'), 'Notes.');
  assert.throws(() => extractReleaseNotes(changelog, 'v9.9.9'), /tìm thấy 0/);
  assert.throws(() => extractReleaseNotes(`${changelog}\n## [v1.2.3]\nDuplicate.`, 'v1.2.3'), /tìm thấy 2/);
  assert.throws(() => extractReleaseNotes('## [1.2.3]\n\n## [1.0.0]\nOlder.', 'v1.2.3'), /không có ghi chú/);
  assert.equal(extractReleaseNotes('## [1.0.0]\n\n- Last.\n\n[Unreleased]: #unreleased\n[1.0.0]: #100\n', 'v1.0.0'), '- Last.');
});

test('a HEAD that already contains the version is only tagged, pushed and published', async t => {
  const f = fixture(t);
  let asked;
  const run = execute(f, ['1.1.0'], { confirm: async prompt => { asked = prompt; return true; } });
  assert.equal((await run.promise).status, 'published');
  assert.doesNotMatch(asked, /commit/);
  assert.equal(f.git('rev-parse', 'HEAD'), f.head);
  assert.equal(f.git('rev-parse', 'v1.1.0^{}'), f.head);
  assert.equal(f.git(`--git-dir=${f.bare}`, 'rev-parse', 'v1.1.0^{}'), f.head);
  assert.equal(f.published.body, '- Bản trước.');
  assert.match(run.output(), /chỉ tạo tag v1\.1\.0 tại HEAD/);
});

test('mismatched package and changelog versions stop before changes', async t => {
  const f = fixture(t, { lock: false });
  await assert.rejects(execute(f, ['1.0.0'], {
    confirm: () => assert.fail('must not ask'),
  }).promise, /phải mới hơn/);
  const pkgPath = join(f.cwd, 'package.json');
  writeFileSync(pkgPath, readFileSync(pkgPath, 'utf8').replace('"1.1.0"', '"1.2.0"'));
  f.git('commit', '-am', 'test: bump only package');
  f.git('push', 'origin', 'main');
  await assert.rejects(execute(f, ['1.2.0']).promise, /CHANGELOG\.md chưa có mục \[1\.2\.0\]/);
  await assert.rejects(execute(f, ['1.1.0']).promise, /CHANGELOG\.md đã có mục 1\.1\.0 nhưng package\.json đang là 1\.2\.0/);
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(actualPushes(f).length, 0);
});

test('projects without package.json release from the changelog only', async t => {
  const f = fixture(t, { npm: false });
  const run = execute(f, ['2.0.0'], { npm: () => assert.fail('must not run npm without package.json') });
  assert.equal((await run.promise).status, 'published');
  assert.match(run.output(), /Không có package.json/);
  assert.equal(f.git('show', '--name-only', '--format=', 'HEAD'), 'CHANGELOG.md');
  assert.equal(f.git('rev-parse', 'v2.0.0^{}'), f.git('rev-parse', 'HEAD'));
});

test('delete removes the release, remote tag and local tag after confirmation; the version can be re-released', async t => {
  const f = fixture(t);
  assert.equal((await execute(f, ['1.2.0']).promise).status, 'published');
  const releaseCommit = f.git('rev-parse', 'HEAD');

  const declined = execute(f, ['-d', '1.2.0'], { confirm: async () => false });
  assert.equal((await declined.promise).status, 'cancelled');
  assert.equal(f.deleted, 0);
  assert.equal(f.git('tag', '--list', 'v1.2.0'), 'v1.2.0');

  let asked;
  const run = execute(f, ['--delete', 'v1.2.0'], { confirm: async prompt => { asked = prompt; return true; } });
  assert.equal((await run.promise).status, 'deleted');
  assert.match(asked, /Xóa/);
  assert.match(run.output(), /Release: "v1\.2\.0".*Tag trên origin: v1\.2\.0.*Tag cục bộ: v1\.2\.0/s);
  assert.equal(f.deleted, 1);
  assert.equal(f.git('tag', '--list', 'v1.2.0'), '');
  assert.equal(f.git(`--git-dir=${f.bare}`, 'tag', '--list', 'v1.2.0'), '');
  assert.equal(f.git('rev-parse', 'HEAD'), releaseCommit);
  assert.equal(f.git(`--git-dir=${f.bare}`, 'rev-parse', 'main'), releaseCommit);

  const nothing = execute(f, ['-d', '1.2.0'], { confirm: () => assert.fail('nothing to confirm') });
  assert.equal((await nothing.promise).status, 'nothing');

  const again = execute(f, ['1.2.0']);
  assert.equal((await again.promise).status, 'published');
  assert.equal(f.git('rev-parse', 'HEAD'), releaseCommit);
  assert.equal(f.git('rev-parse', 'v1.2.0^{}'), releaseCommit);
});

test('delete reports partial progress and keeps tags when the release cannot be deleted', async t => {
  const f = fixture(t);
  assert.equal((await execute(f, ['1.2.0']).promise).status, 'published');
  const request = (url, options) => options.method === 'DELETE'
    ? Promise.resolve({ status: 403 })
    : f.request(url, options);
  await assert.rejects(execute(f, ['-d', '1.2.0'], { request }).promise, /HTTP 403.*Đã xóa: chưa có gì/s);
  assert.equal(f.git('tag', '--list', 'v1.2.0'), 'v1.2.0');
  assert.equal(f.git(`--git-dir=${f.bare}`, 'tag', '--list', 'v1.2.0'), 'v1.2.0');
});

test('delete never removes a remote tag that changed after confirmation', async t => {
  const f = fixture(t);
  assert.equal((await execute(f, ['1.2.0']).promise).status, 'published');
  const run = execute(f, ['-d', '1.2.0'], {
    confirm: async () => {
      f.git(`--git-dir=${f.bare}`, 'tag', '-f', 'v1.2.0', f.head);
      return true;
    },
  });
  await assert.rejects(run.promise, /Git push thất bại.*Đã xóa: release/s);
  assert.equal(f.git(`--git-dir=${f.bare}`, 'rev-parse', 'v1.2.0'), f.head);
  assert.equal(f.git('tag', '--list', 'v1.2.0'), 'v1.2.0');
});

test('an existing release with different content is never overwritten', async t => {
  const f = fixture(t);
  f.git('tag', '-a', 'v1.1.0', '-m', 'v1.1.0');
  f.git('push', 'origin', 'v1.1.0');
  const request = (url, options) => url.includes('/releases/tags/')
    ? Promise.resolve({ status: 200, body: { tag_name: 'v1.1.0', name: 'v1.1.0', body: 'Other.', draft: false,
      prerelease: false, published_at: 'x', html_url: 'https://gitea.com/team/project/releases/tag/v1.1.0' } })
    : f.request(url, options);
  await assert.rejects(execute(f, ['1.1.0'], { request }).promise, /không khớp/);
  assert.equal(f.published, undefined);
});

test('uses Git credentials without printing them, and rejects unsafe or ambiguous destinations', async t => {
  const f = fixture(t);
  delete f.env.GITEA_TOKEN;
  const git = (args, options) => args[0] === 'credential'
    ? 'username=fixture-user\npassword=fixture-secret\n'
    : f.wrappedGit(args, options);
  const run = execute(f, ['1.2.0'], { git });
  assert.equal((await run.promise).status, 'published');
  assert.ok(f.requests.every(call => call.auth === `Basic ${Buffer.from('fixture-user:fixture-secret').toString('base64')}`));
  assert.doesNotMatch(run.output(), /fixture-user|fixture-secret/);

  const unsafe = fixture(t);
  const never = () => assert.fail('must not call an unsafe API');
  await assert.rejects(execute(unsafe, ['1.2.0', '--api-url', 'https://other.example/api/v1'], { request: never }).promise,
    /thuộc máy chủ kho/);
  await assert.rejects(execute(unsafe, ['1.2.0', '--api-url', 'http://gitea.com/api/v1'], { request: never }).promise,
    /phải dùng HTTPS/);
  const ambiguous = (args, options) => args[0] === 'remote' && args[1] === 'get-url'
    ? 'https://gitea.com/team/project.git\nhttps://gitea.com/team/other.git\n'
    : unsafe.wrappedGit(args, options);
  await assert.rejects(execute(unsafe, ['1.2.0'], { git: ambiguous }).promise, /đúng một URL/);
  assert.equal(unsafe.git('status', '--porcelain'), '');
});

test('uncertain create responses are reported instead of assumed', async t => {
  const f = fixture(t);
  const request = (url, options) => options.method === 'POST'
    ? Promise.reject(new Error('Connection timed out.'))
    : f.request(url, options);
  await assert.rejects(execute(f, ['1.2.0'], { request }).promise, /có thể đã được tạo/);
});

test('curl sends Unicode JSON and authorization through its config and exposes HTTP and JSON errors', async t => {
  const root = mkdtempSync(join(tmpdir(), 'release-tls-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  if (spawnSync('openssl', ['version']).error?.code === 'ENOENT') {
    t.skip('OpenSSL is unavailable for the local HTTPS fixture.');
    return;
  }
  const key = join(root, 'key.pem');
  const cert = join(root, 'cert.pem');
  const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-keyout', key, '-out', cert, '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { encoding: 'utf8' });
  assert.equal(generated.status, 0, generated.stderr);
  const server = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/missing') {
        res.writeHead(404);
        res.end('not JSON');
      } else if (req.url === '/invalid') {
        res.writeHead(200);
        res.end('not JSON');
      } else if (req.method === 'DELETE') {
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ auth: req.headers.authorization, body: JSON.parse(body) }));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `https://127.0.0.1:${server.address().port}`;
  const env = { ...process.env, CURL_CA_BUNDLE: cert, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost' };
  const body = { name: 'Dấu tiếng Việt', notes: 'quote: " backslash: \\ newline:\nnext' };
  const auth = 'token "\\secret';
  const response = await curlRequest(url, { method: 'POST', auth, provider: 'github', body, env });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body, { auth, body });
  assert.equal((await curlRequest(`${url}/release`, { method: 'DELETE', auth, provider: 'gitea', env })).status, 204);
  assert.equal((await curlRequest(`${url}/missing`, { auth, provider: 'gitea', env })).status, 404);
  await assert.rejects(curlRequest(`${url}/invalid`, { auth, provider: 'gitea', env }), /JSON không hợp lệ/);
  await assert.rejects(curlRequest('http://127.0.0.1/', { auth, provider: 'gitea', env }), /phải dùng HTTPS/);
});

test('--fast skips npm test and build but still bumps, asks and publishes', async t => {
  const f = fixture(t, { scripts: { test: 'node -e "process.exit(1)"', build: 'node -e "process.exit(1)"' } });
  let asked = false;
  const run = execute(f, ['1.2.0', '--fast'], { confirm: async () => { asked = true; return true; } });
  assert.equal((await run.promise).status, 'published');
  assert.ok(asked);
  assert.match(run.output(), /--fast, bỏ qua npm test và npm run build/);
  assert.doesNotMatch(run.output(), /Chạy npm run/);
  assert.equal(JSON.parse(readFileSync(join(f.cwd, 'package.json'))).version, '1.2.0');
});
