#!/usr/bin/env python3
"""Static dev server for Sword Coast Chronicles.

python -m http.server is fine for serving files, but browsers cache ES modules
aggressively for the lifetime of a tab, so an edited module keeps running the old
code until a hard reload. That makes iterating on a 60-module game miserable and
produces phantom "I fixed that already" bugs. This server sends no-store on every
response so a plain reload always picks up the current source.
"""

import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765


class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'text/javascript',
        '.mjs': 'text/javascript',
        '.json': 'application/json',
        '.svg': 'image/svg+xml',
    }

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

    def send_head(self):
        # Never answer a conditional request with 304 — always send fresh bytes.
        self.headers.replace_header('If-Modified-Since', '') if 'If-Modified-Since' in self.headers else None
        if 'If-None-Match' in self.headers:
            del self.headers['If-None-Match']
        return super().send_head()

    def log_message(self, fmt, *args):
        # Quiet: only surface errors, not every 200.
        status = str(args[1]) if len(args) > 1 else ''
        if status.startswith(('4', '5')):
            sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


if __name__ == '__main__':
    handler = partial(NoCacheHandler, directory='.')
    with ThreadingHTTPServer(('127.0.0.1', PORT), handler) as httpd:
        print(f'Sword Coast Chronicles dev server -> http://localhost:{PORT}  (no-store)')
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass
