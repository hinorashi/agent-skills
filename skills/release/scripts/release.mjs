#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual, TextDecoder } from 'node:util';

const HELP = `Phát hành từ HEAD hiện tại hoặc xóa một bản phát hành trên Gitea/GitHub.

Cách dùng:
  node release.mjs <phiên-bản> [tùy chọn]
  node release.mjs --delete <phiên-bản> [--remote <tên>]

Phiên bản là SemVer, nhập 1.2.0 hoặc v1.2.0 đều được. Tag Git luôn là v1.2.0;
package.json và CHANGELOG.md dùng 1.2.0. Không hỗ trợ +metadata.
Yêu cầu terminal tương tác; mọi thao tác ghi đều hỏi [y/N] trước.

Phát hành:
  1. Dừng nếu cây làm việc có thay đổi chưa commit.
  2. Kiểm tra nhánh, tag, remote và quyền truy cập API.
  3. Cập nhật package.json/package-lock.json (nếu có) và chuyển [Unreleased]
     thành mục phiên bản có ngày. Nếu HEAD đã chứa phiên bản này thì bỏ qua.
  4. Chạy npm test và npm run build nếu có (bỏ qua bằng --fast).
  5. Hiển thị diff; hỏi trước khi commit. Đồng ý cũng cho phép tạo tag,
     đẩy nhánh/tag nguyên tử và tạo release.
  Nếu tag đã được đẩy nhưng chưa có release, chạy lại cùng lệnh để công bố tiếp.

Xóa (--delete, -d):
  Xóa release, tag trên remote và tag cục bộ sau khi xác nhận. Commit phát hành,
  package.json và CHANGELOG.md được giữ nguyên.

Tùy chọn:
  --delete, -d         Xóa release và tag thay vì phát hành.
  --remote <tên>       Remote đích (mặc định: origin).
  --provider <loại>    gitea hoặc github cho máy chủ tự quản.
  --api-url <URL>      URL gốc API HTTPS của cùng máy chủ.
  --name <tên>         Tiêu đề release (mặc định: tên tag).
  --prerelease         Đánh dấu bản thử nghiệm.
  --stable             Bản ổn định, kể cả khi phiên bản có hậu tố -rc...
  --fast               Bỏ qua npm test và npm run build.
  --help, -h           Hiển thị trợ giúp.

Xác thực API bằng GITEA_TOKEN, GH_TOKEN/GITHUB_TOKEN hoặc Git credential helper.
Đặt NO_COLOR=1 để tắt màu.`;

const valueOptions = new Set(['remote', 'provider', 'api-url', 'name']);
const flagOptions = new Set(['delete', 'prerelease', 'stable', 'fast', 'help']);
const shortOptions = { '-h': '--help', '-d': '--delete' };
const utf8 = new TextDecoder('utf-8', { fatal: true });

export class GitError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'GitError';
    this.status = status;
  }
}

function decodeUtf8(value, description) {
  try {
    return utf8.decode(value);
  } catch {
    throw new Error(`${description} không phải UTF-8 hợp lệ.`);
  }
}

function safeGitError(value) {
  return value
    .replace(/(https?:\/\/)[^\s/@]+@/gi, '$1[đã ẩn]@')
    .replace(/authorization:[^\r\n]*/gi, 'authorization: [đã ẩn]')
    .trim()
    .slice(0, 1000);
}

export function runGit(args, { cwd, env = process.env, input } = {}) {
  const result = spawnSync('git', args, {
    cwd,
    env: { ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    input,
    maxBuffer: 10 * 1024 * 1024,
    timeout: 30000,
  });
  if (result.error || result.status !== 0) {
    const detail = result.stderr ? safeGitError(result.stderr.toString('utf8')) : '';
    const reason = result.error?.code === 'ETIMEDOUT'
      ? 'quá thời gian chờ'
      : result.error?.code === 'ENOENT'
        ? 'không tìm thấy Git'
        : result.error?.code || `mã ${result.status ?? 'không xác định'}`;
    throw new GitError(`Git ${args[0]} thất bại (${reason})${detail ? `: ${detail}` : '.'}`,
      result.error ? undefined : result.status);
  }
  return decodeUtf8(result.stdout, `Kết quả Git ${args[0]}`);
}

function remoteRepository(remote, requestedProvider, customApiUrl) {
  let url;
  const scp = remote.match(/^([^/@:\s]+)@([^/:\s]+):(.+)$/);
  try {
    url = new URL(scp ? `ssh://${scp[1]}@${scp[2]}/${scp[3]}` : remote);
  } catch {
    throw new Error('URL remote không hợp lệ; dùng HTTPS hoặc SSH.');
  }
  if (!['https:', 'ssh:'].includes(url.protocol) || url.password || url.search || url.hash
      || (url.protocol === 'https:' && url.username)) {
    throw new Error('Remote phải dùng HTTPS hoặc SSH, không chứa mật khẩu, truy vấn hay fragment.');
  }
  let parts;
  try {
    parts = url.pathname.split('/').filter(Boolean).map(part => decodeURIComponent(part));
  } catch {
    throw new Error('Đường dẫn kho trong remote không hợp lệ.');
  }
  if (parts.length < 2 || parts.some(part => !part || part === '.' || part === '..' || /[\\/\x00-\x1f\x7f]/.test(part))) {
    throw new Error('Remote phải chứa đường dẫn kho dạng owner/repository.');
  }
  const repo = parts.pop().replace(/\.git$/, '');
  const owner = parts.pop();
  if (!repo || repo === '.' || repo === '..') throw new Error('Tên kho trong remote không hợp lệ.');
  const hostname = url.hostname.toLowerCase();
  const inferred = hostname === 'github.com' ? 'github' : hostname === 'gitea.com' ? 'gitea' : undefined;
  const provider = requestedProvider || inferred;
  if (!provider) throw new Error('Không xác định được máy chủ; hãy chỉ định --provider gitea hoặc github.');
  if (inferred && provider !== inferred) throw new Error('--provider không khớp với máy chủ remote.');
  if (hostname === 'github.com' && parts.length) throw new Error('Đường dẫn GitHub phải có dạng owner/repository.');

  const port = url.protocol === 'https:' && url.port ? `:${url.port}` : '';
  const prefix = parts.length ? `/${parts.map(encodeURIComponent).join('/')}` : '';
  const webBase = `https://${hostname}${port}${prefix}`;
  const defaultApi = provider === 'github' && hostname === 'github.com'
    ? 'https://api.github.com'
    : `${webBase}/api/${provider === 'github' ? 'v3' : 'v1'}`;
  let api;
  try {
    api = new URL(customApiUrl || defaultApi);
  } catch {
    throw new Error('--api-url không phải URL hợp lệ.');
  }
  const allowedApiHost = api.hostname === hostname
    || (provider === 'github' && hostname === 'github.com' && api.hostname === 'api.github.com');
  if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash || !allowedApiHost) {
    throw new Error('API phải dùng HTTPS, không chứa thông tin đăng nhập và thuộc máy chủ kho.');
  }
  return {
    provider,
    owner,
    repo,
    hostname,
    webBase,
    apiBase: api.href.replace(/\/+$/, ''),
    credentialUrl: `${webBase}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}.git`,
  };
}

export function resolvePushRemote(parsed, { git = runGit, cwd, env = process.env } = {}) {
  const remotes = git(['remote', 'get-url', '--push', '--all', '--', parsed.remote || 'origin'], { cwd, env })
    .trim().split('\n').filter(Boolean);
  if (remotes.length !== 1) throw new Error('Remote phải có đúng một URL đẩy để xác định kho phát hành.');
  return { url: remotes[0], info: remoteRepository(remotes[0], parsed.provider, parsed['api-url']) };
}

export function changelogSections(changelog) {
  const lines = changelog.replace(/^\uFEFF/, '').split(/\r?\n/);
  const headings = [];
  const references = [];
  let fence;
  for (let i = 0; i < lines.length; i += 1) {
    const marker = lines[i].match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (marker) {
      if (!fence) fence = { char: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.char && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (fence) continue;
    const reference = lines[i].match(/^ {0,3}\[([^\]]+)\]:[ \t]*(\S.*)$/);
    if (reference) references.push({ line: i, label: reference[1], target: reference[2] });
    const heading = lines[i].match(/^ {0,3}##[ \t]+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    const label = heading[1].match(/^\[([^\]]+)\]/)?.[1] || heading[1].split(/\s+/)[0];
    headings.push({ line: i, label });
  }
  return { lines, headings, references };
}

export function extractReleaseNotes(changelog, tag) {
  const { lines, headings, references } = changelogSections(changelog);
  // Link definitions at the end of the file belong to the whole changelog, not to the last section.
  let tail = lines.length;
  while (tail > 0 && (!lines[tail - 1].trim() || references.some(ref => ref.line === tail - 1))) tail -= 1;
  const candidates = new Set([tag, tag.startsWith('v') ? tag.slice(1) : tag]);
  const matches = headings.filter(heading => candidates.has(heading.label));
  if (matches.length !== 1) {
    throw new Error(`Cần đúng một mục changelog cho tag "${tag}"; tìm thấy ${matches.length}.`);
  }
  const start = matches[0].line;
  const next = headings.find(heading => heading.line > start);
  const notes = lines.slice(start + 1, Math.min(next?.line ?? lines.length, Math.max(tail, start + 1))).join('\n').trim();
  if (!notes) throw new Error(`Mục changelog cho tag "${tag}" không có ghi chú.`);
  return notes;
}

function authHeader(provider, info, env, git, cwd) {
  const token = provider === 'gitea' ? env.GITEA_TOKEN : env.GH_TOKEN || env.GITHUB_TOKEN;
  if (token) {
    if (/[\x00-\x20\x7f]/.test(token)) throw new Error('Token chứa khoảng trắng hoặc ký tự điều khiển.');
    return `${provider === 'gitea' ? 'token' : 'Bearer'} ${token}`;
  }
  let result;
  try {
    result = git(['credential', 'fill'], { cwd, env, input: `url=${info.credentialUrl}\n\n` });
  } catch (error) {
    if (!(error instanceof GitError)) throw error;
    throw new Error(`Không lấy được thông tin xác thực. Đặt ${provider === 'gitea' ? 'GITEA_TOKEN' : 'GH_TOKEN hoặc GITHUB_TOKEN'} hoặc cấu hình Git credential helper.`);
  }
  const fields = Object.fromEntries(result.split('\n').filter(line => line.includes('=')).map(line => {
    const index = line.indexOf('=');
    return [line.slice(0, index), line.slice(index + 1)];
  }));
  if (!fields.username || !fields.password || /[\r\n]/.test(fields.username) || /[\r\n]/.test(fields.password)) {
    throw new Error('Git credential helper không cung cấp đầy đủ tên đăng nhập và mật khẩu/token.');
  }
  if (provider === 'github') {
    if (/[\x00-\x20\x7f]/.test(fields.password)) throw new Error('Token từ Git credential helper không hợp lệ.');
    return `Bearer ${fields.password}`;
  }
  return `Basic ${Buffer.from(`${fields.username}:${fields.password}`).toString('base64')}`;
}

function curlQuote(value) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\t/g, '\\t')}"`;
}

export function curlRequest(url, { method = 'GET', auth, body, provider, env = process.env }) {
  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    return Promise.reject(new Error('URL API không hợp lệ.'));
  }
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password) {
    return Promise.reject(new Error('API phải dùng HTTPS và không chứa thông tin đăng nhập trong URL.'));
  }
  const headers = [
    `Authorization: ${auth}`,
    `Accept: ${provider === 'github' ? 'application/vnd.github+json' : 'application/json'}`,
    'User-Agent: release-publisher',
    'Cache-Control: no-cache',
  ];
  if (provider === 'github') headers.push('X-GitHub-Api-Version: 2022-11-28');
  if (body !== undefined) headers.push('Content-Type: application/json');
  let config = headers.map(header => `header = ${curlQuote(header)}\n`).join('');
  if (body !== undefined) config += `data-binary = ${curlQuote(JSON.stringify(body))}\n`;
  const args = ['-q', '-sS', '--connect-timeout', '10', '--max-time', '30',
    '--proto', '=https', '--request', method, '--config', '-', '--write-out', '\n%{http_code}', '--', url];
  const curlEnv = { ...env };
  delete curlEnv.GITEA_TOKEN;
  delete curlEnv.GH_TOKEN;
  delete curlEnv.GITHUB_TOKEN;

  return new Promise((resolvePromise, reject) => {
    const child = spawn('curl', args, { env: curlEnv, stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    let size = 0;
    let tooLarge = false;
    let stderr = '';
    let inputError;
    child.stdout.on('data', chunk => {
      size += chunk.length;
      if (size > 10 * 1024 * 1024) {
        tooLarge = true;
        child.kill();
      } else {
        output.push(chunk);
      }
    });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk.toString('utf8')).slice(0, 2000); });
    child.stdin.on('error', error => { inputError = error; });
    child.on('error', error => reject(new Error(`Không chạy được curl: ${error.message}`)));
    child.on('close', code => {
      if (tooLarge) return reject(new Error('Phản hồi API vượt quá 10 MiB.'));
      if (code !== 0) {
        const detail = safeGitError(stderr.replaceAll(auth, '[đã ẩn]'));
        return reject(new Error(`Không kết nối được API bằng curl${detail ? `: ${detail}` : '.'}`));
      }
      if (inputError) return reject(new Error('Không gửi được yêu cầu đầy đủ tới curl.'));
      let text;
      try {
        text = decodeUtf8(Buffer.concat(output), 'Phản hồi API');
      } catch (error) {
        return reject(error);
      }
      const index = text.lastIndexOf('\n');
      const status = text.slice(index + 1);
      if (index < 0 || !/^\d{3}$/.test(status)) return reject(new Error('Không đọc được mã trạng thái API.'));
      let response;
      if (status === '200' || status === '201') {
        try {
          response = JSON.parse(text.slice(0, index));
        } catch {
          return reject(new Error(`API trả về JSON không hợp lệ (HTTP ${status}).`));
        }
      }
      resolvePromise({ status: Number(status), body: response });
    });
    child.stdin.end(config);
  });
}

export function createReleaseApi(info, { git = runGit, cwd, env = process.env, request = curlRequest } = {}) {
  const auth = authHeader(info.provider, info, env, git, cwd);
  const base = `${info.apiBase}/repos/${encodeURIComponent(info.owner)}/${encodeURIComponent(info.repo)}`;
  return (path = '', method = 'GET', body) => request(`${base}${path}`, {
    method, auth, body, provider: info.provider, env,
  });
}

function apiError(operation, status) {
  return new Error(`${operation} thất bại (HTTP ${status}); kiểm tra quyền truy cập, phạm vi token và trạng thái release.`);
}

function verifyRelease(release, expected, info) {
  if (!release || typeof release !== 'object' || Array.isArray(release)
      || release.tag_name !== expected.tag || release.name !== expected.name
      || typeof release.body !== 'string' || release.body.trim() !== expected.notes
      || release.draft !== false || release.prerelease !== expected.prerelease
      || !release.published_at || typeof release.html_url !== 'string') {
    throw new Error('Release đã tồn tại hoặc vừa tạo không khớp tag, tiêu đề, ghi chú hay trạng thái; không tự ghi đè.');
  }
  let url;
  try {
    url = new URL(release.html_url);
  } catch {
    throw new Error('Release không có URL hợp lệ.');
  }
  if (url.protocol !== 'https:' || url.hostname !== info.hostname || url.username || url.password) {
    throw new Error('URL release không thuộc máy chủ kho.');
  }
  return url.href;
}

function verifyApiRef(data, info, expected) {
  const refs = Array.isArray(data) ? data : [data];
  const matches = refs.filter(ref => ref?.ref === `refs/tags/${expected.tag}`);
  if (matches.length !== 1 || matches[0].object?.sha !== expected.object
      || matches[0].object?.type !== expected.type) {
    throw new Error(`Tag "${expected.tag}" trên API ${info.provider} không khớp tag cục bộ.`);
  }
}

const diffOptions = ['--no-ext-diff', '--no-textconv', '--no-color', '--binary', '--full-index'];

function readText(path) {
  return utf8.decode(readFileSync(path));
}

function semver(version) {
  if (typeof version !== 'string') throw new Error('package.json cần có phiên bản SemVer dạng chuỗi.');
  const match = version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/);
  if (!match) throw new Error(`Phiên bản "${version}" không phải SemVer hợp lệ.`);
  return { core: match.slice(1, 4), pre: match[4]?.split('.') || [] };
}

export function isNewerVersion(target, current) {
  const a = semver(target);
  const b = semver(current);
  for (let i = 0; i < 3; i += 1) {
    if (BigInt(a.core[i]) !== BigInt(b.core[i])) return BigInt(a.core[i]) > BigInt(b.core[i]);
  }
  if (!a.pre.length || !b.pre.length) return !a.pre.length && b.pre.length > 0;
  for (let i = 0; i < Math.max(a.pre.length, b.pre.length); i += 1) {
    if (a.pre[i] === undefined || b.pre[i] === undefined) return b.pre[i] === undefined;
    if (a.pre[i] === b.pre[i]) continue;
    const numericA = /^\d+$/.test(a.pre[i]);
    const numericB = /^\d+$/.test(b.pre[i]);
    if (numericA && numericB) return BigInt(a.pre[i]) > BigInt(b.pre[i]);
    if (numericA !== numericB) return !numericA;
    return a.pre[i] > b.pre[i];
  }
  return false;
}

export function prepareChangelog(source, version, tag, date) {
  const { lines, headings, references } = changelogSections(source);
  const unreleased = headings.filter(heading => heading.label === 'Unreleased');
  if (unreleased.length !== 1) throw new Error('CHANGELOG.md cần đúng một mục [Unreleased].');
  if (headings.some(heading => [version, `v${version}`].includes(heading.label))
      || references.some(ref => [version, `v${version}`].includes(ref.label))) {
    throw new Error(`CHANGELOG.md đã có phiên bản "${version}".`);
  }
  const start = unreleased[0].line;
  const end = Math.min(
    headings.find(heading => heading.line > start)?.line ?? lines.length,
    references.find(ref => ref.line > start)?.line ?? lines.length,
  );
  const notes = lines.slice(start + 1, end).filter(line => line.trim() && !/^#{1,6}\s/.test(line.trim()));
  if (!notes.length) throw new Error('Mục [Unreleased] không có ghi chú; hãy bổ sung trước khi phát hành.');
  const unreleasedRefs = references.filter(ref => ref.label === 'Unreleased');
  if (unreleasedRefs.length > 1) throw new Error('Liên kết [Unreleased] bị lặp trong changelog.');
  const anchor = `${version.replace(/[.+]/g, '').toLowerCase()}---${date}`;
  let releaseLink = `#${anchor}`;
  if (unreleasedRefs.length) {
    const ref = unreleasedRefs[0];
    if (ref.target !== '#unreleased') {
      const compare = ref.target.match(/^(https:\/\/\S+\/compare\/)(.+)\.\.\.HEAD$/);
      if (!compare) throw new Error('Liên kết [Unreleased] cần là #unreleased hoặc URL compare/...HEAD.');
      const encodedTag = encodeURIComponent(tag);
      releaseLink = `${compare[1]}${compare[2]}...${encodedTag}`;
      lines[ref.line] = `[Unreleased]: ${compare[1]}${encodedTag}...HEAD`;
    }
    lines.splice(ref.line + 1, 0, `[${version}]: ${releaseLink}`);
  } else {
    while (lines.at(-1) === '') lines.pop();
    lines.push('', '[Unreleased]: #unreleased', `[${version}]: ${releaseLink}`, '');
  }
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const updatedStart = changelogSections(lines.join(eol)).headings.find(heading => heading.label === 'Unreleased').line;
  let content = updatedStart + 1;
  while (lines[content] !== undefined && !lines[content].trim()) content += 1;
  lines.splice(updatedStart + 1, content - updatedStart - 1, '', `## [${version}] - ${date}`, '');
  return `${source.startsWith('\uFEFF') ? '\uFEFF' : ''}${lines.join(eol)}`;
}

export function runNpm(args, { cwd, env = process.env, write }) {
  const executable = env.npm_execpath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const commandArgs = env.npm_execpath ? [env.npm_execpath, ...args] : args;
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, commandArgs, {
      cwd, env, stdio: write ? ['inherit', 'pipe', 'pipe'] : 'inherit', shell: process.platform === 'win32' && !env.npm_execpath,
    });
    // Without a custom writer, npm inherits the terminal so it keeps its own colors.
    child.stdout?.on('data', chunk => write(chunk.toString()));
    child.stderr?.on('data', chunk => write(chunk.toString()));
    child.on('error', error => reject(new Error(`Không chạy được npm: ${error.message}`)));
    child.on('close', code => {
      if (code !== 0) reject(new Error(`npm ${args.join(' ')} thất bại (mã ${code}).`));
      else resolvePromise();
    });
  });
}

export function askYesNo(message, { input = process.stdin, output = process.stdout } = {}) {
  return new Promise(resolvePromise => {
    const rl = createInterface({ input, output });
    rl.once('close', () => resolvePromise(false));
    rl.once('SIGINT', () => rl.close());
    rl.question(message, answer => {
      resolvePromise(['y', 'yes'].includes(answer.trim().toLowerCase()));
      rl.close();
    });
  });
}

function localDate(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function updatedLock(lock, version) {
  if (!lock) return undefined;
  return {
    ...lock,
    version,
    ...(lock.packages ? { packages: { ...lock.packages, '': { ...lock.packages[''], version } } } : {}),
  };
}


export function parseArgs(args) {
  const options = {};
  const versions = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = shortOptions[args[i]] || args[i];
    if (!arg.startsWith('-')) {
      versions.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (!arg.startsWith('--') || (!valueOptions.has(key) && !flagOptions.has(key))) {
      throw new Error(`Tùy chọn không được hỗ trợ: ${arg}`);
    }
    if (Object.hasOwn(options, key)) throw new Error(`Tùy chọn bị lặp: ${arg}`);
    if (valueOptions.has(key)) {
      const value = args[i + 1];
      if (!value || value.startsWith('-')) throw new Error(`Tùy chọn ${arg} cần một giá trị.`);
      options[key] = value;
      i += 1;
    } else {
      options[key] = true;
    }
  }
  if (options.help) {
    if (versions.length || Object.keys(options).length !== 1) {
      throw new Error('--help không đi kèm phiên bản hoặc tùy chọn khác.');
    }
    return options;
  }
  if (versions.length !== 1) throw new Error('Cần đúng một phiên bản, ví dụ 1.2.0 hoặc v1.2.0; xem --help.');
  const version = versions[0].replace(/^v/, '');
  semver(version);
  if (version.includes('+')) {
    throw new Error('Không hỗ trợ build metadata (+...) vì npm version sẽ loại bỏ phần này.');
  }
  if (options.provider && !['gitea', 'github'].includes(options.provider)) {
    throw new Error('--provider phải là gitea hoặc github.');
  }
  if (options.prerelease && options.stable) throw new Error('Không thể dùng đồng thời --prerelease và --stable.');
  if (options.name && (!options.name.trim() || /[\x00-\x1f\x7f]/.test(options.name))) {
    throw new Error('Tiêu đề release không hợp lệ.');
  }
  if (options.delete) {
    for (const key of ['name', 'prerelease', 'stable', 'fast']) {
      if (options[key]) throw new Error(`--${key} không dùng cùng --delete.`);
    }
  }
  return { ...options, version, tag: `v${version}` };
}

async function publishTag(parsed, ctx, { ask } = {}) {
  const { cwd, env, git, write } = ctx;
  const gitOptions = { cwd, env };
  const tagRef = `refs/tags/${parsed.tag}`;
  const { url: remoteUrl, info } = resolvePushRemote(parsed, ctx);
  const object = git(['rev-parse', '--verify', '--end-of-options', tagRef], gitOptions).trim();
  const commit = git(['rev-parse', '--verify', '--end-of-options', `${tagRef}^{commit}`], gitOptions).trim();
  const type = git(['cat-file', '-t', object], gitOptions).trim();
  if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(object) || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(commit)
      || !['tag', 'commit'].includes(type)) {
    throw new Error('Không xác định được đối tượng và commit của tag.');
  }
  const remoteRefs = git(['ls-remote', '--tags', '--', remoteUrl, tagRef, `${tagRef}^{}`], gitOptions);
  const refs = new Map(remoteRefs.trim().split('\n').filter(Boolean).map(line => {
    const [sha, ref] = line.split('\t');
    return [ref, sha];
  }));
  if (refs.get(tagRef) !== object || (type === 'tag' ? refs.get(`${tagRef}^{}`) : refs.get(tagRef)) !== commit) {
    throw new Error(`Tag "${parsed.tag}" có cục bộ nhưng chưa được đẩy hoặc khác tag trên remote. `
      + `Đẩy bằng "git push ${parsed.remote || 'origin'} ${parsed.tag}" rồi chạy lại, hoặc xóa bằng --delete.`);
  }
  const notes = extractReleaseNotes(git(['show', `${commit}:CHANGELOG.md`], gitOptions), parsed.tag);
  const prerelease = parsed.prerelease || (!parsed.stable && parsed.version.includes('-'));
  const expected = { tag: parsed.tag, name: parsed.name || parsed.tag, notes, prerelease: Boolean(prerelease), object, commit, type };

  const api = createReleaseApi(info, { git, cwd, env, request: ctx.request });
  const releasePath = `/releases/tags/${encodeURIComponent(expected.tag)}`;
  const refPath = `/git/${info.provider === 'github' ? 'ref' : 'refs'}/tags/${encodeURIComponent(expected.tag)}`;
  const existing = await api(releasePath, 'GET');
  if (![200, 404].includes(existing.status)) throw apiError('Kiểm tra release', existing.status);
  if (existing.status === 200) {
    const url = verifyRelease(existing.body, expected, info);
    const remoteRef = await api(refPath, 'GET');
    if (remoteRef.status !== 200) throw apiError('Kiểm tra tag qua API', remoteRef.status);
    verifyApiRef(remoteRef.body, info, expected);
    write(`Release đã tồn tại và khớp: ${url}\n`);
    return { status: 'existing', url };
  }

  const remoteRef = await api(refPath, 'GET');
  if (remoteRef.status !== 200) throw apiError('Kiểm tra tag qua API', remoteRef.status);
  verifyApiRef(remoteRef.body, info, expected);
  if (ask) {
    write(`Tag ${expected.tag} đã được đẩy nhưng chưa có release.\n`
      + `Kho: ${info.webBase}/${info.owner}/${info.repo}\nCommit: ${commit}\n`
      + `Tiêu đề: ${expected.name}\nBản thử nghiệm: ${expected.prerelease ? 'có' : 'không'}\n\n${notes}\n\n`);
    if (!(await ask('Công bố release cho tag này? [y/N] '))) {
      write('Đã hủy; chưa tạo release.\n');
      return { status: 'cancelled' };
    }
  }
  let created;
  try {
    created = await api('/releases', 'POST', {
      tag_name: expected.tag,
      target_commitish: commit,
      name: expected.name,
      body: notes,
      draft: false,
      prerelease: expected.prerelease,
    });
  } catch (error) {
    throw new Error(`Không xác nhận được kết quả tạo release; release có thể đã được tạo. Kiểm tra trên máy chủ trước khi thử lại. ${error.message}`);
  }
  if (created.status !== 201) {
    const error = apiError('Tạo release', created.status);
    if (created.status === 408 || created.status >= 500) {
      throw new Error(`Release có thể đã được tạo; kiểm tra trên máy chủ trước khi thử lại. ${error.message}`);
    }
    throw error;
  }
  try {
    verifyRelease(created.body, expected, info);
    const confirmed = await api(releasePath, 'GET');
    if (confirmed.status !== 200) throw apiError('Xác minh release', confirmed.status);
    const url = verifyRelease(confirmed.body, expected, info);
    const finalRef = await api(refPath, 'GET');
    if (finalRef.status !== 200) throw apiError('Xác minh tag', finalRef.status);
    verifyApiRef(finalRef.body, info, expected);
    write(`Đã tạo và xác minh release: ${url}\n`);
    return { status: 'published', url };
  } catch (error) {
    throw new Error(`Release có thể đã được tạo; kiểm tra trên máy chủ trước khi thử lại. ${error.message}`);
  }
}

async function deleteRelease(parsed, ctx) {
  const { cwd, env, git, write } = ctx;
  const gitOptions = { cwd, env };
  const tagRef = `refs/tags/${parsed.tag}`;
  const remote = resolvePushRemote(parsed, ctx);
  const localTag = git(['for-each-ref', '--format=%(objectname)', tagRef], gitOptions).trim();
  const remoteTag = git(['ls-remote', '--tags', '--', remote.url, tagRef], gitOptions)
    .trim().split('\n').map(line => line.split('\t')).find(([, ref]) => ref === tagRef)?.[0];
  const api = createReleaseApi(remote.info, { git, cwd, env, request: ctx.request });
  const found = await api(`/releases/tags/${encodeURIComponent(parsed.tag)}`);
  if (![200, 404].includes(found.status)) throw apiError('Kiểm tra release', found.status);
  const release = found.status === 200 ? found.body : undefined;
  if (release && (!Number.isSafeInteger(release.id) || release.id <= 0 || release.tag_name !== parsed.tag)) {
    throw new Error('API trả về release không hợp lệ; không xóa gì.');
  }
  if (!release && !remoteTag && !localTag) {
    write(`Không có release hay tag "${parsed.tag}" để xóa.\n`);
    return { status: 'nothing' };
  }
  const remoteName = parsed.remote || 'origin';
  write(`Kho: ${remote.info.webBase}/${remote.info.owner}/${remote.info.repo}\nSẽ xóa:\n`
    + `  - Release: ${release ? `"${release.name || parsed.tag}"${typeof release.html_url === 'string' ? ` ${release.html_url}` : ''}` : 'không có'}\n`
    + `  - Tag trên ${remoteName}: ${remoteTag ? `${parsed.tag} (${remoteTag.slice(0, 12)})` : 'không có'}\n`
    + `  - Tag cục bộ: ${localTag ? `${parsed.tag} (${localTag.slice(0, 12)})` : 'không có'}\n`
    + 'Commit phát hành, package.json và CHANGELOG.md được giữ nguyên.\n');
  if (!(await ctx.ask('Xóa các mục trên? [y/N] '))) {
    write('Đã hủy; không xóa gì.\n');
    return { status: 'cancelled' };
  }
  const done = [];
  try {
    if (release) {
      const deleted = await api(`/releases/${release.id}`, 'DELETE');
      if (deleted.status !== 204) throw apiError('Xóa release', deleted.status);
      done.push('release');
      write('Đã xóa release.\n');
    }
    if (remoteTag) {
      if (resolvePushRemote(parsed, ctx).url !== remote.url) throw new Error('URL remote đã thay đổi; chưa xóa tag trên remote.');
      git(['push', `--force-with-lease=${tagRef}:${remoteTag}`, '--', remote.url, `:${tagRef}`], gitOptions);
      done.push(`tag trên ${remoteName}`);
      write(`Đã xóa tag ${parsed.tag} trên ${remoteName}.\n`);
    }
    if (localTag) {
      git(['update-ref', '-d', tagRef, localTag], gitOptions);
      done.push('tag cục bộ');
      write(`Đã xóa tag cục bộ ${parsed.tag}.\n`);
    }
  } catch (error) {
    throw new Error(`${error.message}\nĐã xóa: ${done.join(', ') || 'chưa có gì'}. Kiểm tra rồi chạy lại --delete để tiếp tục.`);
  }
  return { status: 'deleted' };
}

function ensureTracked(git, gitOptions, cwd, path) {
  if (!lstatSync(resolve(cwd, path)).isFile()) throw new Error(`${path} phải là tệp thường, không phải liên kết.`);
  git(['ls-files', '--error-unmatch', '--', path], gitOptions);
}

export async function release(args, options = {}) {
  const parsed = parseArgs(args);
  const write = options.write || (text => process.stdout.write(text));
  if (parsed.help) {
    write(`${HELP}\n`);
    return { status: 'help' };
  }
  const env = options.env || process.env;
  const git = options.git || runGit;
  if (!options.confirm && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error('Cần terminal tương tác để xác nhận; không hỗ trợ tự động chấp thuận.');
  }
  const ask = options.confirm || askYesNo;
  const cwd = git(['rev-parse', '--show-toplevel'], { cwd: options.cwd || process.cwd(), env }).trim();
  const gitOptions = { cwd, env };
  const ctx = { cwd, env, git, write, ask, request: options.request };
  const tagRef = `refs/tags/${parsed.tag}`;
  git(['check-ref-format', tagRef], gitOptions);
  if (parsed.delete) return deleteRelease(parsed, ctx);
  if (git(['for-each-ref', '--format=%(refname)', tagRef], gitOptions).trim()) {
    write(`Tag "${parsed.tag}" đã có cục bộ; kiểm tra để công bố tiếp release còn thiếu (không ghi đè).\n`);
    return publishTag(parsed, ctx, { ask });
  }

  const { version } = parsed;
  const statusArgs = ['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none'];
  const status = git(statusArgs, gitOptions);
  if (status.trim()) {
    write(`Cảnh báo: cây làm việc có thay đổi chưa commit:\n${status}\n`);
    throw new Error('Hãy commit hoặc xử lý các thay đổi trước. Công cụ không tự gộp hay xóa thay đổi.');
  }
  const head = git(['rev-parse', '--verify', 'HEAD'], gitOptions).trim();
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], gitOptions).trim();
  if (branch === 'HEAD') throw new Error('HEAD đang tách rời; hãy chọn nhánh cần phát hành.');
  const remote = resolvePushRemote(parsed, ctx);
  async function checkRemote() {
    if (resolvePushRemote(parsed, ctx).url !== remote.url) {
      throw new Error('URL remote đã thay đổi trong khi chuẩn bị release.');
    }
    const refs = new Map(git(['ls-remote', '--', remote.url, `refs/heads/${branch}`, tagRef], gitOptions)
      .trim().split('\n').filter(Boolean).map(line => {
        const [sha, ref] = line.split('\t');
        return [ref, sha];
      }));
    if (refs.has(tagRef)) {
      throw new Error(`Tag "${parsed.tag}" đã có trên remote nhưng không có cục bộ. Tải tag về bằng "git fetch ${parsed.remote || 'origin'} tag ${parsed.tag}" rồi chạy lại, hoặc xóa bằng --delete.`);
    }
    const remoteHead = refs.get(`refs/heads/${branch}`);
    if (remoteHead) {
      try {
        git(['merge-base', '--is-ancestor', remoteHead, head], gitOptions);
      } catch (error) {
        if (!(error instanceof GitError)) throw error;
        throw new Error(`Nhánh cục bộ chưa xác minh được là mới hơn remote. Hãy fetch và đồng bộ nhánh trước. ${error.message}`);
      }
    }
    return remoteHead;
  }
  const remoteHead = await checkRemote();

  if (!existsSync(resolve(cwd, 'CHANGELOG.md'))) throw new Error('Thiếu CHANGELOG.md tại gốc kho.');
  ensureTracked(git, gitOptions, cwd, 'CHANGELOG.md');
  if (existsSync(resolve(cwd, 'npm-shrinkwrap.json'))) throw new Error('Chưa hỗ trợ npm-shrinkwrap.json.');
  const hasPackage = existsSync(resolve(cwd, 'package.json'));
  let pkg;
  let lock;
  if (hasPackage) {
    ensureTracked(git, gitOptions, cwd, 'package.json');
    pkg = JSON.parse(readText(resolve(cwd, 'package.json')));
    if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('package.json phải là một đối tượng JSON.');
    if (pkg.workspaces) throw new Error('Chưa hỗ trợ npm workspaces.');
    semver(pkg.version);
    if (existsSync(resolve(cwd, 'package-lock.json'))) {
      ensureTracked(git, gitOptions, cwd, 'package-lock.json');
      lock = JSON.parse(readText(resolve(cwd, 'package-lock.json')));
      if (!lock || typeof lock !== 'object' || Array.isArray(lock)
          || lock.version !== pkg.version || (lock.packages && lock.packages['']?.version !== pkg.version)) {
        throw new Error('Phiên bản package-lock.json chưa khớp package.json; hãy xử lý trước.');
      }
    }
  }
  const originalChangelog = readText(resolve(cwd, 'CHANGELOG.md'));
  // HEAD may already contain this version, e.g. after --delete or manual preparation; then only tag and publish.
  const prepared = changelogSections(originalChangelog).headings.some(heading => [version, parsed.tag].includes(heading.label));
  let changelog;
  if (prepared) {
    extractReleaseNotes(originalChangelog, parsed.tag);
    if (hasPackage && pkg.version !== version) {
      throw new Error(`CHANGELOG.md đã có mục ${version} nhưng package.json đang là ${pkg.version}; hãy đồng bộ trước.`);
    }
  } else {
    if (hasPackage && pkg.version === version) {
      throw new Error(`package.json đã là ${version} nhưng CHANGELOG.md chưa có mục [${version}]; hãy đồng bộ trước.`);
    }
    if (hasPackage && !isNewerVersion(version, pkg.version)) {
      throw new Error(`Phiên bản "${version}" phải mới hơn "${pkg.version}".`);
    }
    changelog = prepareChangelog(originalChangelog, version, parsed.tag, localDate(options.now || new Date()));
  }
  const files = prepared ? [] : ['CHANGELOG.md', ...(hasPackage ? ['package.json'] : []), ...(lock ? ['package-lock.json'] : [])];

  const api = createReleaseApi(remote.info, { git, cwd, env, request: options.request });
  const repository = await api();
  if (repository.status !== 200 || typeof repository.body?.full_name !== 'string'
      || repository.body.full_name.toLowerCase() !== `${remote.info.owner}/${remote.info.repo}`.toLowerCase()
      || repository.body?.permissions?.push === false) {
    throw new Error(`Không xác minh được quyền truy cập API của kho (HTTP ${repository.status}); kiểm tra token và quyền ghi.`);
  }
  const existing = await api(`/releases/tags/${encodeURIComponent(parsed.tag)}`);
  if (existing.status === 200) throw new Error('Release đã tồn tại; không tự ghi đè. Dùng --delete nếu cần tạo lại.');
  if (existing.status !== 404) throw new Error(`Không kiểm tra được release hiện có (HTTP ${existing.status}).`);
  git(['push', '--dry-run', '--atomic', '--', remote.url, `HEAD:refs/heads/${branch}`], gitOptions);
  if (git(statusArgs, gitOptions).trim() || git(['rev-parse', 'HEAD'], gitOptions).trim() !== head
      || git(['rev-parse', '--abbrev-ref', 'HEAD'], gitOptions).trim() !== branch) {
    throw new Error('Kho đã thay đổi trong khi kiểm tra; dừng trước khi cập nhật phiên bản.');
  }
  const npm = options.npm || runNpm;
  const npmOptions = { cwd, env, ...(options.write ? { write } : {}) };
  const color = !options.write && process.stdout.isTTY && !env.NO_COLOR ? '--color=always' : '--no-color';
  let committed;
  let commitAttempted = false;
  let tagged = false;
  try {
    if (!prepared && hasPackage) {
      await npm(['version', version, '--no-git-tag-version', '--ignore-scripts'], npmOptions);
      if (!isDeepStrictEqual(JSON.parse(readText(resolve(cwd, 'package.json'))), { ...pkg, version })
          || (lock && !isDeepStrictEqual(JSON.parse(readText(resolve(cwd, 'package-lock.json'))), updatedLock(lock, version)))) {
        throw new Error('npm version đã thay đổi nội dung ngoài phiên bản dự kiến; hãy kiểm tra diff.');
      }
      if (!lock && existsSync(resolve(cwd, 'package-lock.json'))) {
        throw new Error('npm version đã tạo tệp khóa ngoài dự kiến; hãy kiểm tra trước khi tiếp tục.');
      }
    }
    if (!prepared) {
      if (readText(resolve(cwd, 'CHANGELOG.md')) !== originalChangelog) {
        throw new Error('CHANGELOG.md đã thay đổi trong khi cập nhật phiên bản; không ghi đè.');
      }
      writeFileSync(resolve(cwd, 'CHANGELOG.md'), changelog);
    }
    const snapshots = new Map(files.map(path => [path, readFileSync(resolve(cwd, path))]));
    function verifyPrepared() {
      if (git(['rev-parse', 'HEAD'], gitOptions).trim() !== head
          || git(['rev-parse', '--abbrev-ref', 'HEAD'], gitOptions).trim() !== branch) {
        throw new Error('HEAD hoặc nhánh đã thay đổi trong khi chuẩn bị release.');
      }
      const records = git([...statusArgs, '-z'], gitOptions).split('\0').filter(Boolean);
      if (records.some(record => !record.startsWith(' M ') || !snapshots.has(record.slice(3)))) {
        throw new Error('Có thay đổi hoặc staging ngoài các tệp phát hành; công cụ dừng để tránh commit nhầm.');
      }
      for (const [path, snapshot] of snapshots) {
        if (!lstatSync(resolve(cwd, path)).isFile() || !readFileSync(resolve(cwd, path)).equals(snapshot)) {
          throw new Error(`Nội dung ${path} đã thay đổi sau khi chuẩn bị; cần kiểm tra lại.`);
        }
      }
    }
    if (parsed['fast']) {
      write('Cảnh báo: --fast, bỏ qua npm test và npm run build.\n');
    } else if (hasPackage) {
      for (const script of ['test', 'build']) {
        if (typeof pkg.scripts?.[script] === 'string' && pkg.scripts[script].trim()) {
          write(`\nChạy npm run ${script}...\n`);
          await npm(['run', script], npmOptions);
        } else {
          write(`Cảnh báo: không có npm script "${script}", bỏ qua kiểm tra này.\n`);
        }
      }
    } else {
      write('Không có package.json; bỏ qua cập nhật phiên bản npm và test/build.\n');
    }
    verifyPrepared();
    const message = `chore: release version ${version}`;
    const diff = prepared ? '' : git(['diff', ...diffOptions, '--', ...files], gitOptions);
    const shownDiff = prepared || color === '--no-color' ? diff
      : git(['diff', ...diffOptions.filter(option => option !== '--no-color'), color, '--', ...files], gitOptions);
    write(`\nKho: ${remote.info.webBase}/${remote.info.owner}/${remote.info.repo}\n`
      + `Nhánh: ${branch}\nHEAD gốc: ${head}\n`
      + (prepared
        ? `HEAD đã chứa phiên bản ${version}; chỉ tạo tag ${parsed.tag} tại HEAD, không tạo commit.\n\n`
        : `Tag: ${parsed.tag} (tại commit phát hành mới)\nCommit: ${message}\n\n${shownDiff}\n`));
    write(remoteHead
      ? `Các commit cục bộ cũng sẽ được đẩy:\n${git(['log', '--oneline', color, `${remoteHead}..${head}`], gitOptions)}\n`
      : 'Nhánh mới trên remote: lần đẩy này bao gồm lịch sử nhánh hiện tại.\n');
    const approved = await ask(prepared
      ? 'Tạo tag, đẩy nhánh/tag và công bố release? [y/N] '
      : 'Tạo commit, tag, đẩy nhánh/tag và công bố release? [y/N] ');
    if (!approved) {
      if (prepared) {
        write('Đã hủy; chưa tạo tag hay đẩy lên remote.\n');
        return { status: 'cancelled' };
      }
      try {
        verifyPrepared();
      } catch (error) {
        write(`Đã hủy; chưa commit, tạo tag hay đẩy lên remote. Không tự hoàn tác: ${error.message} Hãy kiểm tra ${files.join(', ')}.\n`);
        return { status: 'cancelled' };
      }
      git(['checkout', 'HEAD', '--', ...files], gitOptions);
      write(`Đã hủy và hoàn tác ${files.join(', ')}; chưa commit, tạo tag hay đẩy lên remote.\n`);
      return { status: 'cancelled' };
    }
    verifyPrepared();
    await checkRemote();
    verifyPrepared();
    if (git(['for-each-ref', '--format=%(refname)', tagRef], gitOptions).trim()) {
      throw new Error(`Tag "${parsed.tag}" vừa được tạo cục bộ; dừng trước khi commit.`);
    }
    if (prepared) {
      committed = head;
    } else {
      git(['add', '--', ...files], gitOptions);
      if (git(['diff', '--cached', ...diffOptions], gitOptions) !== diff) {
        throw new Error('Diff đã staging không khớp diff được duyệt; dừng trước khi commit.');
      }
      commitAttempted = true;
      write(git(['commit', '-m', message, '-m',
        'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>'], gitOptions));
      committed = git(['rev-parse', 'HEAD'], gitOptions).trim();
      const parents = git(['rev-list', '--parents', '-n', '1', committed], gitOptions).trim().split(' ');
      if (parents.length !== 2 || parents[1] !== head
          || git(['rev-parse', '--abbrev-ref', 'HEAD'], gitOptions).trim() !== branch
          || git(statusArgs, gitOptions).trim()
          || git(['diff', ...diffOptions, head, committed], gitOptions) !== diff) {
        throw new Error('Commit hoặc hook đã thay đổi nội dung ngoài diff được duyệt; không tạo tag hay tự amend.');
      }
    }
    git(['tag', '-a', parsed.tag, committed, '-m', parsed.name || parsed.tag], gitOptions);
    tagged = true;
    if (resolvePushRemote(parsed, ctx).url !== remote.url) throw new Error('Remote đã thay đổi; chưa đẩy.');
    write(git(['push', '--atomic', '--', remote.url, `${committed}:refs/heads/${branch}`, `${tagRef}:${tagRef}`], gitOptions));
    return await publishTag(parsed, ctx);
  } catch (error) {
    const rerun = `Nếu tag đã được đẩy, chạy lại cùng lệnh để công bố tiếp; nếu muốn làm lại, dùng --delete.`;
    const state = tagged
      ? `${prepared ? '' : `Commit cục bộ ${committed} và `}tag ${parsed.tag} được giữ nguyên; kiểm tra remote. ${rerun}`
      : committed && !prepared
        ? `Commit cục bộ ${committed} được giữ nguyên; kiểm tra trước khi thử lại.`
        : commitAttempted
          ? 'Lệnh commit đã được gọi; kiểm tra HEAD/staging và tag trước khi thử lại vì commit có thể đã được tạo. Không tự hoàn tác hay commit lại.'
          : 'Các thay đổi chuẩn bị được giữ nguyên để kiểm tra; không tự hoàn tác hay commit lại.';
    throw new Error(`${error.message}\n${state}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  release(process.argv.slice(2)).then(result => {
    if (result.status === 'cancelled') process.exitCode = 1;
  }).catch(error => {
    console.error(`Lỗi: ${error.message}`);
    process.exitCode = 1;
  });
}
