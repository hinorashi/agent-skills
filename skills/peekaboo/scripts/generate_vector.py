#!/usr/bin/env python3
"""Generate a peekaboo mascot SVG with an SVG-capable OpenAI image model.

The normal AI branch sends a text character brief. A hand-drawn basic SVG can also be sent as text for an optional
seeded upgrade. SVG-capable image models accept raster image inputs only on /v1/images/edits, whose output is raster;
SVG output exists only on /v1/images/generations, which takes no image input. This script adapts the static SVG answer
to the peekaboo parts contract and runs check_mascot_svg.py (references/vector-upgrade.md).

Usage:
    python3 generate_vector.py --check
    python3 generate_vector.py --prompt "small orange cat..." --id mochi --out <scratch>/vector [options]
    python3 generate_vector.py --base <scratch>/<id>.svg --out <scratch>/vector [options]
    printf '%s' "$KEY" | python3 generate_vector.py --api-key-stdin --base ... --out ...
    python3 generate_vector.py --adapt <scratch>/vector/raw.svg --id <id> --out <scratch>/vector
        Re-run only the adapter on a saved raw SVG (no API call, nothing billed).

Credentials: OPENAI_API_KEY (optional OPENAI_BASE_URL, OPENAI_ORG_ID / OPENAI_PROJECT_ID), or --api-key-stdin.
Models: gpt-image-2.6-flare for chibi, gpt-image-2.6-sunburst for realistic (the defaults). Bedrock has no SVG
output. OPENAI_SVG_MODEL selects the separate text model that authors the SVG.

Writes <out>/raw.svg (the model's answer, untouched) and <out>/<id>.svg (adapted), and prints the adapted path.
Exit code: 0 ok, 1 provider or network error (same "ERROR [<kind>]" / "HINT" lines as generate_concept.py),
2 usage error, 3 written but check_mascot_svg.py reports a FAIL. Every nonzero exit stops the AI SVG branch; the caller
must report the failure and must not silently draw a Basic SVG instead.
Standard library only. Tests: test_generate_vector.py.
"""
import argparse
import base64
import json
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
sys.dont_write_bytecode = True
sys.path.insert(0, HERE)
from generate_concept import STYLE, Fail, post, redact  # noqa: E402

MODEL = 'gpt-image-2.6-flare'
SVG_MODEL = 'gpt-5.4-mini'
VECTOR_HINTS = {
    'auth': 'the key was rejected or expired; fix OPENAI_API_KEY or provide a new one.',
    'access': 'the key lacks access to the image or SVG-author model; enable access before trying the AI branch again.',
    'quota': 'the OpenAI account has no credit or quota left; add billing before trying the AI branch again.',
    'rate_limit': 'the provider is still rate-limited after the automatic retry; wait and try the AI branch again.',
    'content_filter': 'the provider refused the prompt; rephrase it with generic character traits.',
    'model': 'the selected image or SVG-author model is unavailable to this account; choose an available model.',
    'request': 'the API rejected the request; update or fix the skill before trying the AI branch again.',
    'server': 'the provider had an internal error after the automatic retry; try the AI branch again later.',
    'network': 'the provider could not be reached; inspect the reported proxy route. Long SVG requests use TCP '
               'keepalive by default (OPENAI_KEEPALIVE_IDLE=15). If a corporate proxy still closes the tunnel, '
               'ask the network administrator to allow long-lived HTTPS to api.openai.com.',
    'response': 'the provider response did not contain a usable SVG; report the response error.',
    'prompt': 'shorten or rephrase --prompt, then try the AI branch again.',
}
SVG_NS = 'http://www.w3.org/2000/svg'
XLINK_NS = 'http://www.w3.org/1999/xlink'
PARTS = ('pb-face', 'pb-eyes', 'pb-pupils', 'pb-keepsake')
NOT_PAINTED = {'defs', 'clipPath', 'mask', 'pattern', 'symbol', 'marker', 'linearGradient', 'radialGradient',
               'filter', 'style', 'title', 'desc', 'metadata'}
NUMERIC_ATTRS = {'d', 'points', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'x1', 'y1', 'x2', 'y2',
                 'fx', 'fy', 'transform', 'stroke-width', 'gradientTransform'}
NUMBER = re.compile(r'-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?')
MAX_BASE = 24000
HEAVY_KB = 15

ET.register_namespace('', SVG_NS)
ET.register_namespace('xlink', XLINK_NS)


def local(tag):
    return tag.rsplit('}', 1)[-1] if isinstance(tag, str) else ''


def classes(element):
    return (element.get('class') or '').split()


def add_class(element, name):
    if name not in classes(element):
        element.set('class', ' '.join(classes(element) + [name]))


def strip_for_prompt(base_svg):
    """The basic SVG without comments, <title> or <desc>: comments may name the franchise an inspired-by mascot
    came from, and prompts must not."""
    root = ET.fromstring(base_svg)
    for parent in list(root.iter()):
        for child in list(parent):
            if local(child.tag) in ('title', 'desc', 'metadata'):
                parent.remove(child)
    return ' '.join(ET.tostring(root, encoding='unicode').split())


def build_prompt(base_svg, style, width, height, notes):
    return render_prompt(
        f'Current simple SVG of the character:\n{strip_for_prompt(base_svg)}\n\n',
        style, width, height, notes, from_base=True)


def build_prompt_from_description(description, style, width, height, notes):
    return render_prompt(
        f'Original character brief:\n{description.strip()}\n\n',
        style, width, height, notes, from_base=False)


def render_prompt(subject, style, width, height, notes, from_base):
    vb_w, vb_h = 400, round(400 * height / width)
    words = STYLE[style][0]
    proportions = ('head about 55-60% of the canvas height' if style == 'chibi'
                   else 'recognizable species anatomy with a deliberately large readable head, about 45-50% '
                        'of the canvas height and at least 38% of the canvas width')
    intent = ('Redraw the small website mascot below as a polished, original SVG illustration of the same character.'
              if from_base else
              'Draw a polished, original SVG illustration of the small website mascot described below.')
    keeping = ('Keep: the same character, silhouette, front-view pose and framing' if from_base
               else 'Use: a distinctive front-view pose and framing')
    text = (
        f'{intent}\n\n{subject}'
        f'{keeping} (head and upper body, the body cut off by the bottom edge), {proportions}, eyes near the middle '
        'of the height, the stated colors, and the top-most signature feature touching the very top of the canvas.\n'
        f'Improve: {words}; refined, expressive shapes; each color in 2-3 tones for soft shading; still clear at '
        f'{width}x{height} pixels.\n'
        'Readability: use one clean silhouette and one copy of each anatomical part. The face must be visually dominant, '
        'high-contrast on both light and dark backgrounds, with exactly one mouth, exactly two eyes, and no stacked, '
        'ghosted or duplicated copies of eyes, pupils, brows, teeth or facial highlights. Fewer large, deliberate '
        'shapes are better than tiny decorative details at mascot size.\n'
        f'Structure: one <svg> with viewBox "0 0 {vb_w} {vb_h}" (portrait {width}:{height}), transparent background '
        'with no background shape, no text, no filters, masks or embedded images. Use these group ids exactly: '
        '"pb-face" as the parent of the brows, eyes and mouth; "pb-eyes" inside pb-face as the only parent of both '
        'complete eyes; "pb-pupils" inside pb-eyes as the only parent of all irises, pupils and eye highlights; '
        '"pb-keepsake" only around the isolated top-most 10-20% signature feature, not around the wings, body or whole '
        'head, drawn last. Do not paint any eye, pupil, mouth or keepsake shape outside its designated group. '
        'Keep it light: about 100 shapes at most.'
    )
    if notes:
        text += f'\nAlso: {notes.strip()}'
    return text


def request_svg(args, prompt, key):
    base = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
    body = {'model': args.model, 'prompt': prompt, 'n': 1, 'output_format': 'svg', 'size': args.size,
            'quality': args.quality,
            'svg': {'model': args.svg_model, 'reasoning': {'effort': args.svg_effort}}}
    if args.complexity:
        body['complexity'] = args.complexity
    headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'}
    for env, header in (('OPENAI_ORG_ID', 'OpenAI-Organization'), ('OPENAI_PROJECT_ID', 'OpenAI-Project')):
        if os.environ.get(env):
            headers[header] = os.environ[env]
    result = post(f'{base}/images/generations', json.dumps(body).encode(), headers, key)
    items = [item.get('b64_json') for item in result.get('data', []) if item.get('b64_json')]
    if not items:
        raise Fail(f'no SVG in the OpenAI response: {json.dumps(result)[:300]}')
    svg = base64.b64decode(items[0]).decode('utf-8', 'replace')
    if '<svg' not in svg[:2000]:
        raise Fail(f'the answer is not an SVG (starts with {svg[:60]!r}); the model may not support SVG output')
    return svg


# --- geometry -----------------------------------------------------------------------------------------------------

ARITY = {'m': 2, 'l': 2, 'h': 1, 'v': 1, 'c': 6, 's': 4, 'q': 4, 't': 2, 'a': 7, 'z': 0}


def path_points(d):
    """End and control points of a path (control points make the box a safe outer bound)."""
    points, x, y, start = [], 0.0, 0.0, (0.0, 0.0)
    for command, body in re.findall(r'([MLHVCSQTAZmlhvcsqtaz])([^MLHVCSQTAZmlhvcsqtaz]*)', d):
        values = [float(v) for v in NUMBER.findall(body)]
        kind, relative = command.lower(), command.islower()
        if kind == 'z':
            x, y = start
            continue
        size = ARITY[kind]
        for index in range(0, len(values) - size + 1, size):
            chunk = values[index:index + size]
            if kind == 'h':
                x = x + chunk[0] if relative else chunk[0]
            elif kind == 'v':
                y = y + chunk[0] if relative else chunk[0]
            elif kind == 'a':
                x, y = (x + chunk[5], y + chunk[6]) if relative else (chunk[5], chunk[6])
                points += [(x - chunk[0], y - chunk[1]), (x + chunk[0], y + chunk[1])]
            else:
                for px, py in zip(chunk[0::2], chunk[1::2]):
                    points.append((x + px, y + py) if relative else (px, py))
                x, y = (x + chunk[-2], y + chunk[-1]) if relative else (chunk[-2], chunk[-1])
            points.append((x, y))
            if kind == 'm' and index == 0:
                start = (x, y)
            if kind == 'm':
                kind = 'l'
    return points


def shape_box(element):
    tag, get = local(element.tag), (lambda name: float(element.get(name, 0) or 0))
    try:
        if tag == 'circle':
            r = get('r')
            return get('cx') - r, get('cy') - r, get('cx') + r, get('cy') + r
        if tag == 'ellipse':
            return get('cx') - get('rx'), get('cy') - get('ry'), get('cx') + get('rx'), get('cy') + get('ry')
        if tag == 'rect':
            return get('x'), get('y'), get('x') + get('width'), get('y') + get('height')
        if tag == 'line':
            return (min(get('x1'), get('x2')), min(get('y1'), get('y2')),
                    max(get('x1'), get('x2')), max(get('y1'), get('y2')))
        if tag in ('polygon', 'polyline', 'path'):
            if tag == 'path':
                points = path_points(element.get('d', ''))
            else:
                values = [float(v) for v in NUMBER.findall(element.get('points', ''))]
                points = list(zip(values[0::2], values[1::2]))
            if points:
                xs, ys = [p[0] for p in points], [p[1] for p in points]
                return min(xs), min(ys), max(xs), max(ys)
    except ValueError:
        return None
    return None


IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)


def multiply(m, n):
    a, b, c, d, e, f = m
    return (a * n[0] + c * n[1], b * n[0] + d * n[1], a * n[2] + c * n[3], b * n[2] + d * n[3],
            a * n[4] + c * n[5] + e, b * n[4] + d * n[5] + f)


def parse_transform(text):
    import math  # noqa: PLC0415
    matrix = IDENTITY
    for name, body in re.findall(r'(\w+)\s*\(([^)]*)\)', text or ''):
        v = [float(x) for x in NUMBER.findall(body)]
        if name == 'matrix' and len(v) == 6:
            step = tuple(v)
        elif name == 'translate' and v:
            step = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == 'scale' and v:
            step = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == 'rotate' and v:
            cos, sin = math.cos(math.radians(v[0])), math.sin(math.radians(v[0]))
            step = (cos, sin, -sin, cos, 0, 0)
            if len(v) == 3:
                step = multiply(multiply((1, 0, 0, 1, v[1], v[2]), step), (1, 0, 0, 1, -v[1], -v[2]))
        elif name in ('skewX', 'skewY') and v:
            t = math.tan(math.radians(v[0]))
            step = (1, 0, t, 1, 0, 0) if name == 'skewX' else (1, t, 0, 1, 0, 0)
        else:
            continue
        matrix = multiply(matrix, step)
    return matrix


def painted(root):
    """(element, box in canvas coordinates) for every drawn shape outside <defs> and the like."""
    out = []

    def walk(element, matrix):
        for child in element:
            if local(child.tag) in NOT_PAINTED:
                continue
            own = multiply(matrix, parse_transform(child.get('transform'))) if child.get('transform') else matrix
            box = shape_box(child)
            if box:
                a, b, c, d, e, f = own
                corners = [(a * x + c * y + e, b * x + d * y + f) for x in (box[0], box[2]) for y in (box[1], box[3])]
                out.append((child, (min(p[0] for p in corners), min(p[1] for p in corners),
                                    max(p[0] for p in corners), max(p[1] for p in corners))))
            walk(child, own)

    walk(root, IDENTITY)
    return out


def union(boxes):
    return (min(b[0] for b in boxes), min(b[1] for b in boxes), max(b[2] for b in boxes), max(b[3] for b in boxes))


def quality_issues(root):
    """Reject model answers that pass the parts contract but are visibly degraded at mascot size."""
    issues = []
    elements = list(root.iter())
    parts = {name: [e for e in elements if name in classes(e)] for name in PARTS}
    for name, found in parts.items():
        if len(found) != 1:
            issues.append(f'{name} appears {len(found)} times; expected one animated group')

    face = parts['pb-face'][0] if len(parts['pb-face']) == 1 else None
    eyes = parts['pb-eyes'][0] if len(parts['pb-eyes']) == 1 else None
    pupils = parts['pb-pupils'][0] if len(parts['pb-pupils']) == 1 else None
    keepsake = parts['pb-keepsake'][0] if len(parts['pb-keepsake']) == 1 else None
    if face is not None and eyes is not None and eyes not in set(face.iter()):
        issues.append('pb-eyes is not inside pb-face')
    if eyes is not None and pupils is not None and pupils not in set(eyes.iter()):
        issues.append('pb-pupils is not inside pb-eyes')

    drawn = painted(root)
    fingerprints = {}
    for element, _ in drawn:
        attrs = tuple(sorted(
            (local(name), value) for name, value in element.attrib.items()
            if local(name) not in ('id', 'class', 'style')
        ))
        fingerprints[(local(element.tag), attrs)] = fingerprints.get((local(element.tag), attrs), 0) + 1
    duplicate_count = sum(count - 1 for count in fingerprints.values() if count > 1)
    if duplicate_count:
        issues.append(f'{duplicate_count} painted shape(s) exactly duplicate earlier anatomy')

    view_box = [float(v) for v in NUMBER.findall(root.get('viewBox', ''))]
    if len(view_box) == 4:
        _, _, canvas_w, canvas_h = view_box
        boxes = {element: box for element, box in drawn}

        def descendants_box(group):
            found = [boxes[e] for e in group.iter() if e in boxes]
            return union(found) if found else None

        if keepsake is not None:
            box = descendants_box(keepsake)
            if box and (box[3] - box[1]) > canvas_h * 0.5:
                issues.append('pb-keepsake spans more than half the canvas instead of only the top signature detail')
        if face is not None:
            box = descendants_box(face)
            if box and (box[2] - box[0]) < canvas_w * 0.38:
                issues.append('pb-face is too narrow for a readable mascot face')
    return issues


# --- adapter ------------------------------------------------------------------------------------------------------

def inline_styles(root, notes):
    """Move simple `.class { ... }` rules onto the elements: a <style> block would leak into the host page."""
    for parent in list(root.iter()):
        for style in [c for c in parent if local(c.tag) == 'style']:
            rules, leftover = {}, []
            css = re.sub(r'/\*.*?\*/', '', style.text or '', flags=re.S)
            for selectors, declarations in re.findall(r'([^{}]+)\{([^}]*)\}', css):
                names = [s.strip() for s in selectors.split(',')]
                if all(re.fullmatch(r'\.[\w-]+', n) for n in names):
                    for n in names:
                        rules[n[1:]] = rules.get(n[1:], '') + declarations.strip().rstrip(';') + ';'
                else:
                    leftover.append(selectors.strip())
            for element in root.iter():
                own = [c for c in classes(element) if c in rules]
                if own:
                    inherited = ''.join(rules[c] for c in own)
                    element.set('style', inherited + (element.get('style') or ''))
                    rest = [c for c in classes(element) if c not in rules]
                    if rest:
                        element.set('class', ' '.join(rest))
                    else:
                        element.attrib.pop('class')
            if leftover:
                notes.append(f"WARN a <style> rule the adapter cannot inline ({', '.join(leftover)}); scope or "
                             'inline it by hand, it would leak into the page')
            else:
                parent.remove(style)
                if rules:
                    notes.append('inlined the <style> rules into the shapes')


def mark_parts(root, cid, notes):
    """Find the pb-* parts by id (or class) and give them the class the CSS animates."""
    parents = {child: parent for parent in root.iter() for child in parent}
    for element in list(root.iter()):
        key = re.sub(r'[^a-z]', '', (element.get('id') or '').lower())
        part = next((p for p in PARTS if key.endswith(p.replace('-', ''))), None)
        if not part:
            continue
        element.set('id', f'{cid}-{part[3:]}')
        if element.get('transform') and element in parents:
            # CSS animates `transform` on the parts, which would replace this attribute: wrap instead.
            wrapper = ET.Element(f'{{{SVG_NS}}}g', {'class': part})
            parent = parents[element]
            parent.insert(list(parent).index(element), wrapper)
            parent.remove(element)
            wrapper.append(element)
        else:
            add_class(element, part)
    missing = [p for p in PARTS if not any(p in classes(e) for e in root.iter())]
    if missing:
        notes.append(f"WARN missing parts: {', '.join(missing)}; wrap those shapes in <g class=\"...\"> by hand")


def prefix_ids(root, cid):
    """Prefix every id with the character id (the SVG is inlined into the page) and follow the references."""
    renamed = {}
    for element in root.iter():
        old = element.get('id')
        if old and not old.startswith(f'{cid}-'):
            renamed[old] = f'{cid}-{old}'
            element.set('id', renamed[old])
    if not renamed:
        return

    def fix(value):
        value = re.sub(r'url\(\s*#([^)\s]+)\s*\)', lambda m: f'url(#{renamed.get(m.group(1), m.group(1))})', value)
        return f'#{renamed[value[1:]]}' if value.startswith('#') and value[1:] in renamed else value

    for element in root.iter():
        for name, value in list(element.attrib.items()):
            element.set(name, fix(value))


def round_numbers(root, view_width):
    places = 1 if view_width >= 200 else 2 if view_width >= 20 else 3

    def shorten(text):
        out, last = [], 0
        for match in NUMBER.finditer(text):
            value = round(float(match.group()), places)
            short = f'{value:.{places}f}'.rstrip('0').rstrip('.')
            short = '0' if short in ('-0', '') else short
            nxt = text[match.end():match.end() + 1]
            out.append(text[last:match.start()] + short + (' ' if '.' not in short and nxt in '.0123456789' and nxt else ''))
            last = match.end()
        return ''.join(out) + text[last:]

    for element in root.iter():
        for name in NUMERIC_ATTRS & set(element.attrib):
            if name in ('width', 'height', 'x', 'y') and element.get(name, '').endswith('%'):
                continue
            element.set(name, shorten(element.get(name)))


def fit_view_box(root, width, height, notes):
    """Crop to the drawing and make the viewBox match width:height; extra height goes below the figure (the edge
    hides it), so the keepsake stays at the top."""
    numbers = [float(v) for v in NUMBER.findall(root.get('viewBox', ''))]
    if len(numbers) != 4:
        w = float(re.sub(r'[^\d.]', '', root.get('width', '')) or 1024)
        h = float(re.sub(r'[^\d.]', '', root.get('height', '')) or 1024)
        numbers = [0.0, 0.0, w, h]
    x, y, w, h = numbers
    shapes = painted(root)
    if shapes:
        bx0, by0, bx1, by1 = union([box for _, box in shapes])
        bx0, by0, bx1, by1 = max(bx0, x), max(by0, y), min(bx1, x + w), min(by1, y + h)
        if bx1 > bx0 and by1 > by0:
            margin = 0.015 * max(bx1 - bx0, by1 - by0)
            x, y, w, h = bx0 - margin, by0 - margin, bx1 - bx0 + 2 * margin, by1 - by0 + margin
            notes.append('cropped the canvas to the drawing')
    ratio = width / height
    if w / h > ratio:
        h = w / ratio
    else:
        x -= (h * ratio - w) / 2
        w = h * ratio
    fmt = lambda v: f'{v:.2f}'.rstrip('0').rstrip('.')  # noqa: E731
    root.set('viewBox', f'{fmt(x)} {fmt(y)} {fmt(w)} {fmt(h)}')
    return w


def drop_background(root, notes):
    """Remove a first shape that covers the whole canvas: the mascot sits on the app's own background."""
    numbers = [float(v) for v in NUMBER.findall(root.get('viewBox', ''))]
    if len(numbers) != 4:
        return
    _, _, w, h = numbers
    for child in root:
        if local(child.tag) in NOT_PAINTED:
            continue
        box = shape_box(child)
        if box and not set(classes(child)) & set(PARTS) and \
                box[2] - box[0] >= 0.98 * w and box[3] - box[1] >= 0.98 * h:
            root.remove(child)
            notes.append('removed a full-canvas background shape')
        return


def adapt(raw_svg, cid, width, height, model=''):
    """Return (adapted SVG text, notes) for a raw model answer."""
    notes = []
    root = ET.fromstring(raw_svg.encode('utf-8'))
    if local(root.tag) != 'svg':
        raise ValueError('the root element is not <svg>')
    for parent in list(root.iter()):
        for child in list(parent):
            tag = local(child.tag)
            if tag in ('title', 'desc', 'metadata'):
                parent.remove(child)
            elif tag in ('script', 'foreignObject', 'image'):
                parent.remove(child)
                notes.append(f'WARN removed a <{tag}> element (not allowed in the mascot)')
        for name in [n for n in parent.attrib if local(n).startswith('on')]:
            parent.attrib.pop(name)
    for name in ('width', 'height', 'x', 'y', 'style', 'class'):
        root.attrib.pop(name, None)
    inline_styles(root, notes)
    drop_background(root, notes)
    mark_parts(root, cid, notes)
    prefix_ids(root, cid)
    view_width = fit_view_box(root, width, height, notes)
    round_numbers(root, view_width)
    root.set('style', f'--peekaboo-look-face:{1.5 * view_width / 40:.1f}px;'
                      f'--peekaboo-look-pupils:{1.2 * view_width / 40:.1f}px')
    issues = quality_issues(root)
    if issues:
        raise ValueError('quality check failed: ' + '; '.join(issues))
    body = ET.tostring(root, encoding='unicode')
    by = f' by {model}' if model else ''
    text = (f'<!-- {cid}: AI-generated peekaboo SVG{by}, adapted by generate_vector.py. -->\n{body}\n')
    size_kb = len(text.encode('utf-8')) / 1024
    if size_kb > HEAVY_KB:
        notes.append(f'WARN {size_kb:.0f} KB is heavy for an inline mascot (aim for under {HEAVY_KB} KB); try '
                     '--complexity low, or simplify the generated SVG before approval')
    return text, notes


def run_check(path, width, height, no_keepsake):
    command = [sys.executable, os.path.join(HERE, 'check_mascot_svg.py'), path, '--width', str(width),
               '--height', str(height)]
    if no_keepsake:
        command.append('--no-keepsake')
    result = subprocess.run(command, capture_output=True, text=True)
    return result.returncode, (result.stdout + result.stderr).strip()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true', help='report whether OpenAI credentials are available, then exit')
    ap.add_argument('--prompt', help='character brief for direct AI SVG generation (use --id)')
    ap.add_argument('--base', help='the basic SVG drawn per references/character-design.md (<id>.svg)')
    ap.add_argument('--adapt', help='adapt a saved raw SVG instead of calling the API')
    ap.add_argument('--out', help='scratch folder for raw.svg and <id>.svg (outside the app)')
    ap.add_argument('--id', help='character id, used for ids and the file name (default: --base file name)')
    ap.add_argument('--style', choices=list(STYLE), default='chibi')
    ap.add_argument('--width', type=float, default=80)
    ap.add_argument('--height', type=float, default=100)
    ap.add_argument('--no-keepsake', action='store_true', help='the mascot leaves nothing above the edge')
    ap.add_argument('--notes', help='extra direction, e.g. "softer fur shading, keep the scarf pink"')
    ap.add_argument('--model', help='image model; default Sunburst for realistic, Flare for chibi')
    ap.add_argument('--svg-model', default=os.environ.get('OPENAI_SVG_MODEL', SVG_MODEL),
                    help=f'text model that authors the SVG (default {SVG_MODEL} or OPENAI_SVG_MODEL)')
    ap.add_argument('--svg-effort', choices=['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
                    help='SVG-author reasoning; default high for realistic, medium for chibi')
    ap.add_argument('--complexity', choices=['low', 'medium', 'high'], default='medium',
                    help='how much the model plans before drawing (no extra fee; higher drifts more from the base)')
    ap.add_argument('--quality', choices=['low', 'medium', 'high'],
                    help='reference-image quality; default high for realistic, medium for chibi')
    ap.add_argument('--size', default='auto', help='reference image size, "auto" or WIDTHxHEIGHT (multiples of 16)')
    ap.add_argument('--api-key-stdin', action='store_true', help='read the OpenAI key from stdin')
    args = ap.parse_args()

    if args.check:
        print('OpenAI: FOUND (OPENAI_API_KEY)' if os.environ.get('OPENAI_API_KEY') else 'OpenAI: MISSING')
        return 0
    args.model = args.model or ('gpt-image-2.6-sunburst' if args.style == 'realistic' else MODEL)
    args.quality = args.quality or ('high' if args.style == 'realistic' else 'medium')
    args.svg_effort = args.svg_effort or ('high' if args.style == 'realistic' else 'medium')
    modes = [bool(args.prompt), bool(args.base), bool(args.adapt)]
    if sum(modes) != 1:
        ap.error('give exactly one of --prompt, --base or --adapt')
    if not args.out:
        ap.error('--out is required')
    source = args.base or args.adapt
    cid = args.id or os.path.splitext(os.path.basename(args.base or ''))[0]
    if not re.fullmatch(r'[a-z][a-z0-9-]*', cid or ''):
        ap.error('--id must be the character id (lowercase letters, digits, dashes)')
    source_text = ''
    if source:
        try:
            with open(source, encoding='utf-8') as f:
                source_text = f.read()
        except OSError as error:
            print(f'ERROR cannot read {source}: {error}', file=sys.stderr)
            return 2

    os.makedirs(args.out, exist_ok=True)
    raw_path = os.path.join(args.out, 'raw.svg')
    if args.base or args.prompt:
        try:
            prompt = (build_prompt(source_text, args.style, args.width, args.height, args.notes)
                      if args.base else
                      build_prompt_from_description(args.prompt, args.style, args.width, args.height, args.notes))
        except ET.ParseError as error:
            print(f'ERROR --base is not valid SVG: {error}', file=sys.stderr)
            return 2
        if len(prompt) > MAX_BASE + 2000:
            print(f'ERROR the SVG brief is too long for the prompt ({len(prompt)} characters); simplify it',
                  file=sys.stderr)
            return 2
        key = sys.stdin.readline().strip() if args.api_key_stdin else os.environ.get('OPENAI_API_KEY')
        if not key:
            print('ERROR no OpenAI key: set OPENAI_API_KEY or pass one with --api-key-stdin', file=sys.stderr)
            return 2
        try:
            raw = request_svg(args, prompt, key)
        except Fail as error:
            message = redact(str(error), key)
            hint = VECTOR_HINTS[error.kind]
            if error.kind == 'request' and re.search(r'svg\.model|svg model', message, re.I):
                hint = (f'select an available SVG author with --svg-model or OPENAI_SVG_MODEL '
                        f'(default {SVG_MODEL}).')
            elif error.kind == 'request' and re.search(r'output_format|svg|complexity', message, re.I):
                hint = (f'{args.model} rejected SVG output; use gpt-image-2.6-flare or '
                        'gpt-image-2.6-sunburst with a supported SVG-author model.')
            print(f'ERROR [{error.kind}] openai: {message}', file=sys.stderr)
            print(f'HINT {hint}', file=sys.stderr)
            return 1
        with open(raw_path, 'w', encoding='utf-8') as f:
            f.write(raw)
    else:
        raw = source_text

    try:
        text, notes = adapt(raw, cid, args.width, args.height, args.model if (args.base or args.prompt) else '')
    except (ET.ParseError, ValueError) as error:
        print(f'ERROR [response] the SVG cannot be adapted: {error}', file=sys.stderr)
        print('HINT the AI SVG branch stopped; fix the generated response before trying again', file=sys.stderr)
        return 1
    out_path = os.path.join(args.out, f'{cid}.svg')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(text)
    for note in notes:
        print(note if note.startswith('WARN') else f'NOTE {note}', file=sys.stderr)
    status, report = run_check(out_path, args.width, args.height, args.no_keepsake)
    print(report, file=sys.stderr)
    print(out_path)
    return 0 if status == 0 else 3


if __name__ == '__main__':
    sys.exit(main())
