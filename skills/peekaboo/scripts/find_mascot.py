#!/usr/bin/env python3
"""Find an on-screen mascot that is already installed in a project.

Usage:
    python3 find_mascot.py <project-dir>                 # is there a mascot already?
    python3 find_mascot.py <project-dir> --name Kei      # where is "Kei" still mentioned?

Without --name it reports:
  - peekaboo installs (the skill's module: createPeekaboo, peekaboo.css, pb-* parts), with the name, character,
    shortcut and storage key found at the call site;
  - other mascots that look hand-built (words like mascot, peek, keepsake, tuft in code), which need reading;
  - for a peekaboo install, its version (PEEKABOO_VERSION in the copied module) against this skill's version, and
    UPDATE AVAILABLE when the copy is older or has no version (1.4.0 and earlier).
With --name it lists every file and line that still mentions that name (case-insensitive, whole word or as part of an
identifier such as kei-peek, KEI_WIDTH, keiSvg), to check that a replaced mascot left nothing behind.

Exit code: 0 when nothing is found, 1 when something is found, 2 on usage errors. Standard library only.
"""
import argparse
import json
import os
import re
import sys

SKIP_DIRS = {'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt', '.svelte-kit', '.output', 'coverage',
             'vendor', '.venv', 'venv', '__pycache__', '.cache', '.turbo', '.vercel', 'playwright-report',
             'test-results'}
SKIP_FILES = {'skills-lock.json', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'}
TEXT_EXT = {'.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro', '.html', '.htm', '.css',
            '.scss', '.sass', '.less', '.svg', '.json', '.md', '.mdx', '.txt', '.yml', '.yaml', '.toml', '.py',
            '.rb', '.php', '.erb', '.ejs', '.hbs', '.njk', '.liquid'}
ENV_FILE = re.compile(r'^\.env(\..+)?$')
MAX_BYTES = 2_000_000
SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION = re.compile(r"PEEKABOO_VERSION\s*=\s*['\"`](\d+(?:\.\d+)*)")

STRONG = re.compile(r'createPeekaboo|peekaboo\.css|peekaboo-figure|peekaboo-mark|\bpb-keepsake\b')
WEAK = re.compile(r'\bmascot|keepsake|\btuft\b|[\w-]*peek(?:ing|s)?\b(?!aboo)|peek-?a-?boo', re.I)
CALL_FIELDS = {
    'name': re.compile(r"\bname\s*:\s*['\"`]([^'\"`]+)"),
    'character': re.compile(r"\bcharacter\s*:\s*['\"`]([^'\"`]+)"),
    'storageKey': re.compile(r"\bstorageKey\s*:\s*['\"`]([^'\"`]+)"),
    'shortcut': re.compile(r"\bshortcut\s*:\s*(\{[^}]*\})"),
    'powerShortcut': re.compile(r"\bpowerShortcut\s*:\s*(\{[^}]*\}|false)"),
}


def project_files(root):
    for base, dirs, files in os.walk(root):
        if 'SKILL.md' in files and os.path.abspath(base) != os.path.abspath(root):
            dirs[:] = []
            continue  # an installed agent skill (this one included), not app code
        dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS)
        for name in sorted(files):
            if name in SKIP_FILES:
                continue
            path = os.path.join(base, name)
            if os.path.splitext(name)[1].lower() in TEXT_EXT or ENV_FILE.match(name):
                try:
                    if os.path.getsize(path) <= MAX_BYTES:
                        yield path
                except OSError:
                    continue


def read(path):
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            return f.read()
    except OSError:
        return ''


def parse_version(value):
    return tuple(int(part) for part in value.split('.')) if value else ()


def skill_versions():
    """(module version, SKILL.md metadata version) of this skill; they should match."""
    module = VERSION.search(read(os.path.join(SKILL_DIR, 'assets', 'peekaboo.ts')))
    meta = re.search(r'^\s*version:\s*["\']?([\d.]+)', read(os.path.join(SKILL_DIR, 'SKILL.md')), re.M)
    return (module.group(1) if module else None), (meta.group(1) if meta else None)


def call_site(text, start):
    """The createPeekaboo({...}) argument text starting at `start`, by brace matching."""
    open_at = text.find('{', start)
    if open_at < 0:
        return ''
    depth = 0
    for i in range(open_at, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                return text[open_at:i + 1]
    return text[open_at:]


def scan(root):
    installs, hand_built = [], []
    for path in project_files(root):
        text = read(path)
        rel = os.path.relpath(path, root)
        lines = text.splitlines()
        is_doc = os.path.splitext(path)[1].lower() in {'.md', '.mdx', '.txt'}
        strong = [] if is_doc else [i + 1 for i, line in enumerate(lines) if STRONG.search(line)]
        if strong:
            entry = {'file': rel, 'lines': strong[:12]}
            if re.search(r'function\s+createPeekaboo\b', text):
                entry['module'] = True  # the engine itself; its doc comments are not call sites
                version = VERSION.search(text)
                entry['version'] = version.group(1) if version else None  # None: 1.4.0 or earlier
            for m in [] if entry.get('module') else re.finditer(r'createPeekaboo\s*\(', text):
                args = call_site(text, m.end())
                found = {k: rx.search(args) for k, rx in CALL_FIELDS.items()}
                entry.setdefault('calls', []).append(
                    {'line': text.count('\n', 0, m.start()) + 1,
                     **{k: re.sub(r'\s+', ' ', v.group(1)) for k, v in found.items() if v}})
            installs.append(entry)
            continue
        weak = [i + 1 for i, line in enumerate(lines) if WEAK.search(line)]
        if weak and not is_doc:
            hand_built.append({'file': rel, 'hits': len(weak), 'lines': weak[:12]})
    hand_built.sort(key=lambda e: -e['hits'])
    return installs, hand_built


def mentions(root, name):
    rx = re.compile(re.escape(name), re.I)

    def is_identifier_part(line, m):
        # A whole word or one part of an identifier: kei, Kei, KEI_WIDTH, kei-peek, keiSvg, callKei; not "keith".
        before = line[m.start() - 1] if m.start() else ''
        after = line[m.end()] if m.end() < len(line) else ''
        starts_ok = not before.isalpha() or m.group()[0].isupper() or (before.islower() and m.group()[0].isupper())
        ends_ok = not after.isalpha() or after.isupper() and not m.group()[-1].isupper()
        return starts_ok and ends_ok

    found = []
    for path in project_files(root):
        for i, line in enumerate(read(path).splitlines(), 1):
            if any(is_identifier_part(line, m) for m in rx.finditer(line)):
                found.append({'file': os.path.relpath(path, root), 'line': i, 'text': line.strip()[:160]})
    return found


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('project')
    ap.add_argument('--name', help='list remaining mentions of this mascot name')
    ap.add_argument('--json', action='store_true', help='machine-readable output')
    args = ap.parse_args()
    if not os.path.isdir(args.project):
        print(f'ERROR not a directory: {args.project}', file=sys.stderr)
        return 2

    if args.name:
        found = mentions(args.project, args.name)
        if args.json:
            print(json.dumps(found, indent=2))
        else:
            for f in found:
                print(f"{f['file']}:{f['line']}: {f['text']}")
            print(f'{len(found)} mention(s) of "{args.name}"' if found else f'OK no mentions of "{args.name}"')
        return 1 if found else 0

    installs, hand_built = scan(args.project)
    latest, meta_version = skill_versions()
    modules = [e for e in installs if e.get('module')]
    for e in modules:
        e['update_available'] = bool(latest) and parse_version(e['version']) < parse_version(latest)
    if args.json:
        print(json.dumps({'peekaboo': installs, 'hand_built': hand_built, 'skill_version': latest}, indent=2))
    else:
        if latest != meta_version:
            print(f'WARN skill versions disagree: assets/peekaboo.ts {latest}, SKILL.md {meta_version}', file=sys.stderr)
        if installs:
            print('PEEKABOO mascot installed (this skill\'s module):')
            for e in installs:
                tag = f" [module {e['version'] or '1.4.0 or older'}]" if e.get('module') else ''
                print(f"  {e['file']}{tag} (lines {', '.join(map(str, e['lines']))})")
                for c in e.get('calls', []):
                    details = ', '.join(f'{k}={v}' for k, v in c.items() if k != 'line')
                    print(f"    createPeekaboo at line {c['line']}: {details or 'options not literal, read the file'}")
        if hand_built:
            print('POSSIBLE hand-built mascot (read these files to confirm):' if not installs else
                  'Also mentions mascot-like words (usually the same mascot or unrelated):')
            for e in hand_built[:15]:
                print(f"  {e['file']}: {e['hits']} line(s), e.g. {', '.join(map(str, e['lines'][:6]))}")
        for e in modules:
            if e['update_available']:
                print(f"UPDATE AVAILABLE {e['file']}: {e['version'] or '1.4.0 or older'} -> {latest} "
                      f"(see references/updating.md)")
        if modules and not any(e['update_available'] for e in modules):
            print(f'UP TO DATE with skill version {latest}')
        if not installs and not hand_built:
            print('OK no mascot found')
    return 1 if installs or hand_built else 0


if __name__ == '__main__':
    sys.exit(main())
