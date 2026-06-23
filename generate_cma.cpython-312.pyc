"""
Vercel Python Serverless Function — /api/generate_pdf
POST: accepts JSON, returns PDF binary.
"""
import sys, os, json, tempfile
from http.server import BaseHTTPRequestHandler

# Locate generate_cma.py relative to this file (reliable in Vercel)
_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

import generate_cma

# Logo paths — resolve at import time relative to this file
_PUBLIC = os.path.join(_HERE, '..', 'public')
generate_cma.LOGO_COVER = os.path.normpath(os.path.join(_PUBLIC, 'colliers_logo_cover.jpg'))
generate_cma.LOGO_SMALL = os.path.normpath(os.path.join(_PUBLIC, 'colliers_logo_small.jpg'))

_CORS = [
    ('Access-Control-Allow-Origin',  '*'),
    ('Access-Control-Allow-Methods', 'POST, OPTIONS'),
    ('Access-Control-Allow-Headers', 'Content-Type'),
]

class handler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        pass  # silence access logs

    def _reply(self, status, content_type, body, extra=None):
        """Send a complete response. body must be bytes."""
        if isinstance(body, str):
            body = body.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(body)))
        for k, v in _CORS:
            self.send_header(k, v)
        if extra:
            for k, v in extra:
                self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self._reply(200, 'text/plain', b'')

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            raw    = self.rfile.read(length)
            data   = json.loads(raw)
        except Exception as e:
            self._reply(400, 'application/json',
                        json.dumps({'error': f'Bad request: {e}'}))
            return

        tmp = tempfile.NamedTemporaryFile(suffix='.pdf', delete=False)
        tmp.close()
        try:
            generate_cma.build_report(data, tmp.name)
            with open(tmp.name, 'rb') as f:
                pdf = f.read()
            self._reply(200, 'application/pdf', pdf, [
                ('Content-Disposition', 'attachment; filename="Colliers-CMA-Report.pdf"'),
            ])
        except Exception as e:
            self._reply(500, 'application/json',
                        json.dumps({'error': str(e)}))
        finally:
            try:
                os.unlink(tmp.name)
            except OSError:
                pass
