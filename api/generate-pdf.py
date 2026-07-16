"""
Vercel serverless function — POST /api/generate-pdf
Accepts JSON body matching generate_cma.py format.
Returns PDF binary.
"""
import sys, os, json, tempfile

# Add parent so we can import generate_cma
sys.path.insert(0, os.path.dirname(__file__))

from http.server import BaseHTTPRequestHandler
import generate_cma

class handler(BaseHTTPRequestHandler):

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length)
        try:
            data = json.loads(body)
        except Exception as e:
            self.send_response(400)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
            return

        # Resolve logo paths relative to this file
        here = os.path.dirname(__file__)
        pub  = os.path.join(here, '..', 'public')
        generate_cma.LOGO_COVER = os.path.join(pub, 'colliers_logo_cover.jpg')
        generate_cma.LOGO_SMALL = os.path.join(pub, 'colliers_logo_small.jpg')

        with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
            out_path = tmp.name

        try:
            generate_cma.build_report(data, out_path)
            with open(out_path, 'rb') as f:
                pdf_bytes = f.read()
            self.send_response(200)
            self._cors()
            self.send_header('Content-Type', 'application/pdf')
            self.send_header('Content-Disposition', 'attachment; filename="Colliers-CMA-Report.pdf"')
            self.send_header('Content-Length', str(len(pdf_bytes)))
            self.end_headers()
            self.wfile.write(pdf_bytes)
        except Exception as e:
            self.send_response(500)
            self._cors()
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({'error': str(e)}).encode())
        finally:
            try: os.unlink(out_path)
            except: pass

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
