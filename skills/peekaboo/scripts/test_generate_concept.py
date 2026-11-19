#!/usr/bin/env python3
"""Tests for generate_concept.py against a strict local mock of the OpenAI and Bedrock image APIs.

The mock rejects wrongly typed fields the way the real APIs do (e.g. "n" sent as a string), so request-format bugs
show up here instead of on a paid call. Standard library only:

    python3 -m unittest discover -s skills/peekaboo/scripts -p 'test_*.py'
"""
import base64
import http.server
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'generate_concept.py')
PNG = b'\x89PNG\r\n\x1a\n' + b'\0' * 24
B64 = base64.b64encode(PNG).decode()

OPENAI_TYPES = {'model': str, 'prompt': str, 'n': int, 'size': str, 'quality': str, 'background': str}
BEDROCK_CONFIG_TYPES = {'numberOfImages': int, 'width': int, 'height': int, 'cfgScale': float, 'seed': int,
                        'quality': str}


def openai_error(status, message, code, param=None, error_type='invalid_request_error'):
    return status, {'error': {'message': message, 'type': error_type, 'param': param, 'code': code}}, {}


class Mock(http.server.BaseHTTPRequestHandler):
    script = []  # queued (status, body, headers) answers; empty means validate and succeed
    seen = []

    def log_message(self, *args):
        pass

    def answer(self, status, body, headers=None):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        raw = self.rfile.read(int(self.headers['Content-Length']))
        record = {'path': self.path, 'auth': self.headers.get('Authorization'),
                  'type': self.headers.get('Content-Type', '')}
        Mock.seen.append(record)
        if Mock.script:
            return self.answer(*Mock.script.pop(0))
        if self.path.endswith('/images/generations'):
            body = record['body'] = json.loads(raw)
            for name, value in body.items():
                expected = OPENAI_TYPES.get(name)
                if expected is None:
                    return self.answer(*openai_error(400, f"Unknown parameter: '{name}'.", 'unknown_parameter', name))
                if type(value) is not expected:
                    return self.answer(*openai_error(
                        400, f"Invalid type for '{name}': expected {expected.__name__}.", 'invalid_type', name))
            return self.answer(200, {'data': [{'b64_json': B64}] * body.get('n', 1)})
        if self.path.endswith('/images/edits'):
            record['fields'] = [part.split(b'"')[1].decode() for part in raw.split(b'name=')[1:]]
            return self.answer(200, {'data': [{'b64_json': B64}]})
        if '/model/' in self.path:
            body = record['body'] = json.loads(raw)
            config = body['imageGenerationConfig']
            for name, value in config.items():
                expected = BEDROCK_CONFIG_TYPES[name]
                if not isinstance(value, expected) or isinstance(value, bool):
                    return self.answer(400, {'message': f'{name}: expected {expected.__name__}'},
                                       {'x-amzn-ErrorType': 'ValidationException:http://internal'})
            return self.answer(200, {'images': [B64] * config['numberOfImages']})
        return self.answer(404, {'message': 'no route'})


class GenerateConceptTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Mock)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Mock.script, Mock.seen = [], []
        self.tmp = tempfile.TemporaryDirectory()
        self.out = os.path.join(self.tmp.name, 'concept')

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, *args, key=None, env=None):
        full_env = {k: v for k, v in os.environ.items()
                    if k not in ('OPENAI_API_KEY', 'AWS_BEARER_TOKEN_BEDROCK', 'OPENAI_ORG_ID', 'OPENAI_PROJECT_ID')}
        full_env.update({'OPENAI_BASE_URL': self.url + '/v1', 'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1'})
        full_env.update(env or {})
        command = [sys.executable, SCRIPT, *args, '--out', self.out]
        if key is not None:
            command.append('--api-key-stdin')
        return subprocess.run(command, input=(key or '') + '\n', capture_output=True, text=True, env=full_env,
                              timeout=60)

    def bedrock(self, *args, key='bk-secret'):
        return self.run_script('--provider', 'bedrock', '--prompt', 'a fox', '--bedrock-endpoint', self.url, *args,
                               env={'AWS_BEARER_TOKEN_BEDROCK': key})

    def test_openai_generation_sends_typed_json(self):
        result = self.run_script('--provider', 'openai', '--prompt', 'a fox', '--n', '2', '--size', 'portrait',
                                 env={'OPENAI_API_KEY': 'sk-env'})
        self.assertEqual(result.returncode, 0, result.stderr)
        body = Mock.seen[0]['body']
        self.assertIsInstance(body['n'], int)
        self.assertEqual((body['n'], body['size'], body['model']), (2, '1024x1536', 'gpt-image-1.5'))
        self.assertEqual(Mock.seen[0]['auth'], 'Bearer sk-env')
        self.assertEqual(len(result.stdout.split()), 2)
        with open(os.path.join(self.out, 'concept-1.png'), 'rb') as f:
            self.assertEqual(f.read(), PNG)

    def test_openai_edit_with_reference_and_pasted_key(self):
        reference = os.path.join(self.tmp.name, 'ref.png')
        with open(reference, 'wb') as f:
            f.write(PNG)
        result = self.run_script('--provider', 'openai', '--prompt', 'a fox', '--reference', reference,
                                 '--transparent', key='sk-pasted')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(Mock.seen[0]['type'].startswith('multipart/form-data'))
        self.assertIn('image[]', Mock.seen[0]['fields'])
        self.assertIn('background', Mock.seen[0]['fields'])
        self.assertEqual(Mock.seen[0]['auth'], 'Bearer sk-pasted')

    def test_bedrock_text_and_variation(self):
        result = self.bedrock('--n', '2', '--quality', 'high', '--seed', '7')
        self.assertEqual(result.returncode, 0, result.stderr)
        body = Mock.seen[0]['body']
        self.assertEqual(body['taskType'], 'TEXT_IMAGE')
        self.assertEqual(body['textToImageParams']['style'], 'FLAT_VECTOR_ILLUSTRATION')
        self.assertEqual(body['imageGenerationConfig']['quality'], 'premium')
        self.assertEqual(Mock.seen[0]['path'], '/model/amazon.nova-canvas-v1%3A0/invoke')

        reference = os.path.join(self.tmp.name, 'ref.jpg')
        with open(reference, 'wb') as f:
            f.write(b'\xff\xd8\xff' + b'\0' * 20)
        result = self.bedrock('--reference', reference)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(Mock.seen[1]['body']['taskType'], 'IMAGE_VARIATION')

    def assert_error(self, result, kind):
        self.assertEqual(result.returncode, 1, result.stderr)
        self.assertIn(f'ERROR [{kind}]', result.stderr)
        self.assertIn('HINT ', result.stderr)

    def test_openai_errors_are_classified_and_redacted(self):
        cases = [
            (openai_error(401, 'Incorrect API key provided: sk-bad-SECRET.', 'invalid_api_key'), 'auth'),
            (openai_error(403, 'Your organization must be verified to use the model.', None), 'access'),
            (openai_error(429, 'You exceeded your current quota.', 'insufficient_quota'), 'quota'),
            (openai_error(400, 'Your request was rejected by the safety system.', 'moderation_blocked',
                          error_type='image_generation_user_error'), 'content_filter'),
            (openai_error(404, 'The model does not exist.', 'model_not_found'), 'model'),
            (openai_error(400, "Invalid type for 'n'.", 'invalid_type', 'n'), 'request'),
        ]
        for answer, kind in cases:
            with self.subTest(kind=kind):
                Mock.script = [answer]
                result = self.run_script('--provider', 'openai', '--prompt', 'x', key='sk-bad-SECRET')
                self.assert_error(result, kind)
                self.assertNotIn('SECRET', result.stderr)

    def test_rate_limit_is_retried_once(self):
        Mock.script = [(*openai_error(429, 'Rate limit reached.', 'rate_limit_exceeded')[:2], {'Retry-After': '0'})]
        result = self.run_script('--provider', 'openai', '--prompt', 'x', env={'OPENAI_API_KEY': 'k'})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(len(Mock.seen), 2)

        Mock.script = [(500, {'error': {'message': 'boom'}}, {'Retry-After': '0'})] * 2
        result = self.run_script('--provider', 'openai', '--prompt', 'x', env={'OPENAI_API_KEY': 'k'})
        self.assert_error(result, 'server')

    def test_bedrock_errors_are_classified(self):
        cases = [
            ((403, {'message': "You don't have access to the model with the specified model ID."},
              {'x-amzn-ErrorType': 'AccessDeniedException:http://internal'}), 'access'),
            ((400, {'message': 'This request has been blocked by our content filters.'},
              {'x-amzn-ErrorType': 'ValidationException:http://internal'}), 'content_filter'),
            ((403, {'message': 'The security token included in the request is invalid.'},
              {'x-amzn-ErrorType': 'UnrecognizedClientException:http://internal'}), 'auth'),
        ]
        for answer, kind in cases:
            with self.subTest(kind=kind):
                Mock.script = [answer]
                self.assert_error(self.bedrock(), kind)

    def test_local_checks(self):
        result = self.run_script('--provider', 'openai', '--prompt', 'x')
        self.assertEqual(result.returncode, 2)
        self.assertIn('no OpenAI key', result.stderr)
        self.assert_error(self.bedrock('--model', 'stability.sd3'), 'model')
        self.assert_error(self.bedrock('--prompt', 'x' * 1100), 'prompt')
        self.assertEqual(Mock.seen, [])

    def test_check_never_prints_values(self):
        result = subprocess.run([sys.executable, SCRIPT, '--check'], capture_output=True, text=True,
                                env={**os.environ, 'OPENAI_API_KEY': 'sk-visible-SECRET'}, timeout=60)
        self.assertEqual(result.returncode, 0)
        self.assertTrue(json.loads(result.stdout)['openai'])
        self.assertNotIn('SECRET', result.stdout + result.stderr)


if __name__ == '__main__':
    unittest.main()
