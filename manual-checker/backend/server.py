"""HTTP API for the GitHub Pages frontend; TLS is provided by the host."""
import hmac
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

WORKER = Path(__file__).with_name('worker.py')
CAPACITY = threading.BoundedSemaphore(2)
ORIGINS = set(os.environ.get('UT_ALLOWED_ORIGINS', 'https://ashodinventeal.github.io,http://localhost:8000').split(','))


class Handler(BaseHTTPRequestHandler):
    def response_headers(self):
        origin = self.headers.get('Origin', '')
        if origin in ORIGINS:
            self.send_header('Access-Control-Allow-Origin', origin)
        self.send_header('Vary', 'Origin')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type,Authorization')
        self.send_header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
        self.send_header('Content-Type', 'application/json')
        self.send_header('Cache-Control', 'no-store')

    def reply(self, code, data):
        content = json.dumps(data).encode()
        self.send_response(code)
        self.response_headers()
        self.send_header('Content-Length', str(len(content)))
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        self.reply(204, {})

    def do_GET(self):
        self.reply(200 if self.path == '/health' else 404,
                   {'service': 'Universal Tracker logic API', 'status': 'ready'} if self.path == '/health' else {'error': 'Not found'})

    def do_POST(self):
        if self.path != '/evaluate':
            return self.reply(404, {'error': 'Not found'})
        if self.headers.get('Origin') and self.headers['Origin'] not in ORIGINS:
            return self.reply(403, {'error': 'Origin not allowed'})
        token = os.environ.get('UT_API_TOKEN', '')
        if token and not hmac.compare_digest(self.headers.get('Authorization', ''), f'Bearer {token}'):
            return self.reply(401, {'error': 'Logic API key is required'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 4 * 1024 * 1024:
                return self.reply(413, {'error': 'Invalid snapshot size'})
            data = json.loads(self.rfile.read(length))
            if not all(k in data for k in ('seed','slot','team','game','slots','slotData','items','packages','missing','checked')):
                return self.reply(400, {'error': 'Incomplete slot snapshot'})
            if not CAPACITY.acquire(blocking=False):
                return self.reply(429, {'error': 'Logic engine busy; retry shortly'})
            try:
                process = subprocess.run([sys.executable, str(WORKER)], input=json.dumps(data),
                                         capture_output=True, text=True, timeout=90)
                result = json.loads(process.stdout)
                self.reply(422 if process.returncode else 200, result)
            finally:
                CAPACITY.release()
        except subprocess.TimeoutExpired:
            self.reply(504, {'error': 'Universal Tracker evaluation exceeded 90 seconds'})
        except (ValueError, KeyError, TypeError):
            self.reply(400, {'error': 'Invalid slot snapshot'})


if __name__ == '__main__':
    ThreadingHTTPServer((os.environ.get('BIND_HOST', '127.0.0.1'), int(os.environ.get('PORT', '8765'))), Handler).serve_forever()
