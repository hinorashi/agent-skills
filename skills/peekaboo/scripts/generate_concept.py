#!/usr/bin/env python3
"""Generate concept art for a new peekaboo mascot with OpenAI or Amazon Bedrock image models.

The image is a design target only: the agent then redraws it as the animated SVG (references/concept-art.md). Nothing
here touches the app.

Usage:
    python3 generate_concept.py --check
        Which providers have credentials in the environment. Never prints secret values.
    python3 generate_concept.py --provider openai|bedrock --prompt "..." --out <scratch-dir> [options]
    printf '%s' "$KEY" | python3 generate_concept.py --provider openai --api-key-stdin ...
        Use a key the user pasted, for this run only. It is not written anywhere.

Credentials:
    openai   OPENAI_API_KEY (optional OPENAI_BASE_URL, OPENAI_ORG_ID / OPENAI_PROJECT_ID)
    bedrock  AWS_BEARER_TOKEN_BEDROCK (Bedrock API key), or AWS credentials through boto3 (env vars, profile, SSO);
             region from --region, AWS_REGION or AWS_DEFAULT_REGION, default us-east-1

Models: openai gpt-image-1.5 (default), gpt-image-1, gpt-image-1-mini; bedrock amazon.nova-canvas-v1:0 (default),
amazon.titan-image-generator-v2:0. A --reference image is sent to the provider (OpenAI edits endpoint, Bedrock
IMAGE_VARIATION): only with the user's consent.

Writes <out>/concept-1.png ... and prints their paths. Exit code: 0 ok, 1 provider or network error, 2 usage error.
Standard library only (boto3 is used for Bedrock only when there is no API key).
"""
import argparse
import base64
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid

OPENAI_MODEL = 'gpt-image-1.5'
BEDROCK_MODEL = 'amazon.nova-canvas-v1:0'
SIZES = {'square': (1024, 1024), 'portrait': (1024, 1536)}
TIMEOUT = 240

STYLE = {
    'chibi': ('cute chibi mascot, big head, small body, clean flat vector illustration, bold simple shapes, '
              'smooth flat colors with soft shading, crisp outlines', 'FLAT_VECTOR_ILLUSTRATION'),
    'realistic': ('natural proportions, polished vector illustration with soft shading, clean shapes that read at '
                  'small sizes', 'SOFT_DIGITAL_PAINTING'),
}
SHEET = ('Character design for a small website mascot: one character, full body, front view, standing upright, '
         'centered, whole figure in frame, its top feature clearly visible, plain light background.')
AVOID = 'text, letters, watermark, logo, signature, multiple characters, busy background, cropped figure, photo'


class Fail(Exception):
    pass


def redact(text, secret):
    return text.replace(secret, '***') if secret else text


def image_kind(data):
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return 'png'
    if data[:3] == b'\xff\xd8\xff':
        return 'jpeg'
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return 'webp'
    return None


def boto3_session():
    try:
        import boto3  # noqa: PLC0415
    except ImportError:
        return None
    session = boto3.Session()
    return session if session.get_credentials() else None


def check():
    found = {
        'openai': bool(os.environ.get('OPENAI_API_KEY')),
        'bedrock_api_key': bool(os.environ.get('AWS_BEARER_TOKEN_BEDROCK')),
    }
    found['bedrock_aws_credentials'] = not found['bedrock_api_key'] and boto3_session() is not None
    found['bedrock'] = found['bedrock_api_key'] or found['bedrock_aws_credentials']
    print(json.dumps(found))
    for name, label in (('openai', 'OpenAI (OPENAI_API_KEY)'),
                        ('bedrock', 'Amazon Bedrock (AWS_BEARER_TOKEN_BEDROCK or AWS credentials)')):
        print(f"{'FOUND' if found[name] else 'MISSING'} {label}", file=sys.stderr)
    return 0


def full_prompt(args):
    words, _ = STYLE[args.style]
    if args.raw:
        return args.prompt
    tail = '' if args.provider == 'bedrock' else f' Avoid: {AVOID}.'
    return f'{SHEET} {args.prompt.strip()} Style: {words}.{tail}'


def post(url, body, headers, secret):
    request = urllib.request.Request(url, data=body, headers=headers, method='POST')
    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        detail = error.read().decode('utf-8', 'replace')[:600]
        raise Fail(redact(f'HTTP {error.code} from {url}: {detail}', secret)) from None
    except urllib.error.URLError as error:
        raise Fail(redact(f'cannot reach {url}: {error.reason}', secret)) from None


def openai(args, prompt, key, reference):
    base = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1').rstrip('/')
    width, height = SIZES[args.size]
    fields = {'model': args.model or OPENAI_MODEL, 'prompt': prompt, 'n': str(args.n),
              'size': f'{width}x{height}', 'quality': args.quality}
    if args.transparent:
        fields['background'] = 'transparent'
    headers = {'Authorization': f'Bearer {key}'}
    for env, header in (('OPENAI_ORG_ID', 'OpenAI-Organization'), ('OPENAI_PROJECT_ID', 'OpenAI-Project')):
        if os.environ.get(env):
            headers[header] = os.environ[env]
    if reference:
        data, kind = reference
        boundary = uuid.uuid4().hex
        parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
                 for k, v in fields.items()]
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image[]"; filename="reference.{kind}"\r\n'
                     f'Content-Type: image/{kind}\r\n\r\n'.encode() + data + b'\r\n')
        body = b''.join(parts) + f'--{boundary}--\r\n'.encode()
        headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        result = post(f'{base}/images/edits', body, headers, key)
    else:
        headers['Content-Type'] = 'application/json'
        result = post(f'{base}/images/generations', json.dumps(fields).encode(), headers, key)
    images = [item.get('b64_json') for item in result.get('data', []) if item.get('b64_json')]
    if not images:
        raise Fail(f'no image in the OpenAI response: {json.dumps(result)[:300]}')
    return images


def bedrock(args, prompt, key, reference):
    model = args.model or BEDROCK_MODEL
    if not model.startswith(('amazon.nova-canvas', 'amazon.titan-image')):
        raise Fail(f'unsupported Bedrock model {model!r}: use amazon.nova-canvas-v1:0 or amazon.titan-image-generator-v2:0')
    if len(prompt) > 1024:
        raise Fail(f'Bedrock prompts are limited to 1024 characters; this one has {len(prompt)}. Shorten --prompt.')
    width, height = SIZES[args.size]
    config = {'numberOfImages': args.n, 'width': width, 'height': height, 'cfgScale': 6.5}
    if args.seed is not None:
        config['seed'] = args.seed
    if reference:
        data, _ = reference
        request = {'taskType': 'IMAGE_VARIATION', 'imageGenerationConfig': config, 'imageVariationParams': {
            'images': [base64.b64encode(data).decode()], 'similarityStrength': args.similarity,
            'text': prompt, 'negativeText': AVOID}}
    else:
        config['quality'] = 'premium' if args.quality == 'high' else 'standard'
        params = {'text': prompt, 'negativeText': AVOID}
        if model.startswith('amazon.nova-canvas') and not args.raw:
            params['style'] = STYLE[args.style][1]
        request = {'taskType': 'TEXT_IMAGE', 'textToImageParams': params, 'imageGenerationConfig': config}
    body = json.dumps(request).encode()
    region = args.region or os.environ.get('AWS_REGION') or os.environ.get('AWS_DEFAULT_REGION') or 'us-east-1'
    if key:
        base = (args.bedrock_endpoint or f'https://bedrock-runtime.{region}.amazonaws.com').rstrip('/')
        headers = {'Authorization': f'Bearer {key}', 'Content-Type': 'application/json', 'Accept': 'application/json'}
        result = post(f'{base}/model/{urllib.parse.quote(model, safe="")}/invoke', body, headers, key)
    else:
        session = boto3_session()
        if session is None:
            raise Fail('no Bedrock credentials: set AWS_BEARER_TOKEN_BEDROCK, or AWS credentials with boto3 installed')
        client = session.client('bedrock-runtime', region_name=region, endpoint_url=args.bedrock_endpoint)
        try:
            response = client.invoke_model(modelId=model, body=body, contentType='application/json',
                                           accept='application/json')
        except Exception as error:  # botocore errors carry the service message
            raise Fail(f'Bedrock error: {error}') from None
        result = json.loads(response['body'].read())
    if result.get('error'):
        raise Fail(f"Bedrock error: {result['error']}")
    images = result.get('images') or []
    if not images:
        raise Fail(f'no image in the Bedrock response: {json.dumps(result)[:300]}')
    return images


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--check', action='store_true', help='report which providers have credentials, then exit')
    ap.add_argument('--provider', choices=['openai', 'bedrock'])
    ap.add_argument('--prompt', help='the character: look, outfit, colors by name, keepsake, personality')
    ap.add_argument('--out', help='scratch folder for concept-N.png (outside the app source tree)')
    ap.add_argument('--style', choices=list(STYLE), default='chibi')
    ap.add_argument('--reference', help="the user's image; sent to the provider, only with the user's consent")
    ap.add_argument('--n', type=int, default=1, help='images to generate, 1-4 (each one is billed)')
    ap.add_argument('--size', choices=list(SIZES), default='square')
    ap.add_argument('--quality', choices=['low', 'medium', 'high'], default='medium')
    ap.add_argument('--transparent', action='store_true', help='OpenAI only: transparent background')
    ap.add_argument('--similarity', type=float, default=0.5, help='Bedrock with --reference: 0.2-1.0')
    ap.add_argument('--seed', type=int, help='Bedrock: fixed seed for repeatable results')
    ap.add_argument('--model', help=f'default {OPENAI_MODEL} (openai) or {BEDROCK_MODEL} (bedrock)')
    ap.add_argument('--region', help='Bedrock region')
    ap.add_argument('--bedrock-endpoint', help=argparse.SUPPRESS)
    ap.add_argument('--raw', action='store_true', help='send --prompt as is, without the design-sheet framing')
    ap.add_argument('--api-key-stdin', action='store_true',
                    help='read the API key (OpenAI key or Bedrock API key) from stdin instead of the environment')
    args = ap.parse_args()

    if args.check:
        return check()
    if not (args.provider and args.prompt and args.out):
        ap.error('--provider, --prompt and --out are required (or use --check)')
    if not 1 <= args.n <= 4:
        ap.error('--n must be 1-4')
    if not 0.2 <= args.similarity <= 1.0:
        ap.error('--similarity must be 0.2-1.0')

    key = sys.stdin.readline().strip() if args.api_key_stdin else None
    if args.api_key_stdin and not key:
        ap.error('--api-key-stdin given but stdin was empty')
    if not key:
        key = os.environ.get('OPENAI_API_KEY' if args.provider == 'openai' else 'AWS_BEARER_TOKEN_BEDROCK')
    if args.provider == 'openai' and not key:
        print('ERROR no OpenAI key: set OPENAI_API_KEY or pass one with --api-key-stdin', file=sys.stderr)
        return 2

    reference = None
    if args.reference:
        try:
            with open(args.reference, 'rb') as f:
                data = f.read()
        except OSError as error:
            print(f'ERROR cannot read --reference: {error}', file=sys.stderr)
            return 2
        kind = image_kind(data)
        allowed = ('png', 'jpeg', 'webp') if args.provider == 'openai' else ('png', 'jpeg')
        if kind not in allowed:
            print(f"ERROR --reference must be {', '.join(allowed).upper()} for {args.provider}", file=sys.stderr)
            return 2
        reference = (data, kind)

    prompt = full_prompt(args)
    try:
        images = (openai if args.provider == 'openai' else bedrock)(args, prompt, key, reference)
    except Fail as error:
        print(f'ERROR {redact(str(error), key)}', file=sys.stderr)
        return 1

    os.makedirs(args.out, exist_ok=True)
    paths = []
    for i, b64 in enumerate(images, 1):
        path = os.path.join(args.out, f'concept-{i}.png')
        with open(path, 'wb') as f:
            f.write(base64.b64decode(b64))
        paths.append(path)
    print('\n'.join(paths))
    return 0


if __name__ == '__main__':
    sys.exit(main())
