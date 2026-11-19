#!/usr/bin/env python3
"""Tests for generate_vector.py: the SVG request against a strict local mock, and the adapter on a messy answer.

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
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(HERE, 'generate_vector.py')
KEI = os.path.join(os.path.dirname(HERE), 'assets', 'characters', 'kei', 'kei.svg')
sys.path.insert(0, HERE)
import generate_vector  # noqa: E402

TYPES = {'model': str, 'prompt': str, 'n': int, 'output_format': str, 'size': str, 'quality': str,
         'complexity': str}

# What a model answer may look like: square canvas, background, title, <style>, a transformed part, long decimals.
RAW = '''<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <title>Mascot</title>
  <style>.st0{fill:#16181d}</style>
  <defs><linearGradient id="skin"><stop offset="0.25" stop-color="#f4d6bd"/></linearGradient></defs>
  <rect x="0" y="0" width="1024" height="1024" fill="#ffffff"/>
  <path class="st0" d="M312.123456 1000C312 820 420 760 512 760S712 820 712 1000Z"/>
  <ellipse fill="url(#skin)" cx="512" cy="560" rx="200.555" ry="230"/>
  <g id="pb-face">
    <g id="pb-eyes" transform="translate(0 4.04)">
      <ellipse fill="#fff" cx="440" cy="580" rx="40" ry="44"/>
      <ellipse fill="#fff" cx="584" cy="580" rx="40" ry="44"/>
      <g id="pb-pupils" fill="#1b1c22"><circle cx="440" cy="584" r="22.4999"/><circle cx="584" cy="584" r="22.5"/></g>
    </g>
  </g>
  <path id="pb-keepsake" fill="#1b1c22" d="M330 560C300 400 360 300 420 280L380 200l100 70 40-100 60 80 100-90z"/>
</svg>'''


class Mock(http.server.BaseHTTPRequestHandler):
    seen, answer = [], None

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        Mock.seen.append({'path': self.path, 'body': body})
        status, reply = Mock.answer or (200, {'data': [{'b64_json': base64.b64encode(RAW.encode()).decode()}]})
        for name, value in body.items():
            if type(value) is not TYPES.get(name, type(None)):
                status, reply = 400, {'error': {'message': f"Invalid parameter '{name}'.", 'type':
                                                'invalid_request_error', 'param': name, 'code': 'invalid_type'}}
        data = json.dumps(reply).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)


class GenerateVectorTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Mock)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/v1'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        Mock.seen, Mock.answer = [], None
        self.tmp = tempfile.TemporaryDirectory()
        self.out = os.path.join(self.tmp.name, 'vector')

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, *args, key='sk-test'):
        env = {k: v for k, v in os.environ.items() if k != 'OPENAI_API_KEY'}
        env.update({'OPENAI_BASE_URL': self.url, 'NO_PROXY': '127.0.0.1', 'no_proxy': '127.0.0.1'})
        if key:
            env['OPENAI_API_KEY'] = key
        return subprocess.run([sys.executable, SCRIPT, *args, '--out', self.out], capture_output=True, text=True,
                              env=env, timeout=60)

    def test_request_sends_base_svg_as_text_and_svg_format(self):
        result = self.run_script('--base', KEI)
        self.assertEqual(result.returncode, 0, result.stderr)
        body = Mock.seen[0]['body']
        self.assertTrue(Mock.seen[0]['path'].endswith('/images/generations'))
        self.assertEqual((body['model'], body['n'], body['output_format'], body['complexity']),
                         ('gpt-image-2.6-flare', 1, 'svg', 'medium'))
        self.assertIn('class="pb-keepsake"', body['prompt'])
        self.assertIn('viewBox "0 0 400 500"', body['prompt'])
        self.assertNotIn('Gantz', body['prompt'])  # comments may name a franchise
        self.assertTrue(os.path.isfile(os.path.join(self.out, 'raw.svg')))
        self.assertEqual(result.stdout.strip(), os.path.join(self.out, 'kei.svg'))
        self.assertIn('OK mascot SVG', result.stderr)

    def test_request_can_generate_directly_from_brief(self):
        result = self.run_script('--prompt', 'a small orange cat with a pink scarf', '--id', 'mochi')
        self.assertEqual(result.returncode, 0, result.stderr)
        body = Mock.seen[0]['body']
        self.assertIn('Original character brief:', body['prompt'])
        self.assertIn('small orange cat with a pink scarf', body['prompt'])
        self.assertNotIn('Current simple SVG', body['prompt'])
        self.assertEqual(body['output_format'], 'svg')
        self.assertEqual(result.stdout.strip(), os.path.join(self.out, 'mochi.svg'))

    def test_check_reports_key_availability_without_value(self):
        env = dict(os.environ, OPENAI_API_KEY='sk-never-print')
        result = subprocess.run([sys.executable, SCRIPT, '--check'], capture_output=True, text=True, env=env)
        self.assertEqual(result.returncode, 0)
        self.assertIn('OpenAI: FOUND', result.stdout)
        self.assertNotIn('sk-never-print', result.stdout + result.stderr)

    def test_adapter_meets_parts_contract(self):
        text, notes = generate_vector.adapt(RAW, 'kei', 80, 100)
        root = ET.fromstring(text.split('-->', 1)[1])
        tags = {e.tag.rsplit('}', 1)[-1] for e in root.iter()}
        self.assertFalse(tags & {'title', 'style', 'rect'})
        found = {p: [e for e in root.iter() if p in (e.get('class') or '').split()] for p in generate_vector.PARTS}
        self.assertTrue(all(found.values()), found)
        self.assertIsNone(found['pb-eyes'][0].get('transform'))  # wrapped, so the blink keeps the translate
        self.assertIn('kei-skin', text)
        self.assertIn('url(#kei-skin)', text)
        self.assertNotIn('312.123456', text)
        self.assertIn('fill:#16181d', text)
        x, y, w, h = map(float, root.get('viewBox').split())
        self.assertAlmostEqual(w / h, 0.8, places=3)
        self.assertAlmostEqual(y, 160 - 0.015 * 840, places=0)  # cropped to the keepsake tip at y=160
        self.assertLess(w, 700)
        self.assertIn('--peekaboo-look-face', root.get('style'))
        self.assertTrue(any('background' in n for n in notes))

    def test_adapt_only_and_missing_parts(self):
        raw = os.path.join(self.tmp.name, 'raw.svg')
        with open(raw, 'w', encoding='utf-8') as f:
            f.write(RAW.replace('id="pb-keepsake"', 'id="hair"'))
        result = self.run_script('--adapt', raw, '--id', 'kei', key=None)
        self.assertEqual(result.returncode, 3, result.stderr)
        self.assertIn('missing parts: pb-keepsake', result.stderr)
        self.assertEqual(Mock.seen, [])

    def test_svg_rejected_by_model(self):
        Mock.answer = (400, {'error': {'message': "Unsupported value for 'output_format'.",
                                       'type': 'invalid_request_error', 'param': 'output_format'}})
        result = self.run_script('--base', KEI, '--model', 'gpt-image-1.5', key='sk-SECRET')
        self.assertEqual(result.returncode, 1)
        self.assertIn('ERROR [request]', result.stderr)
        self.assertIn('gpt-image-2.6-flare', result.stderr)
        self.assertNotIn('SECRET', result.stderr)

    def test_round_numbers_keeps_numbers_apart(self):
        root = ET.fromstring('<svg xmlns="http://www.w3.org/2000/svg"><path d="M1.004.5L.04.5"/></svg>')
        generate_vector.round_numbers(root, 400)
        self.assertEqual(root[0].get('d'), 'M1 0.5L0 0.5')


if __name__ == '__main__':
    unittest.main()
