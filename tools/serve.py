"""Local preview: serve dist/ with the '/*' headers from dist/_headers and browser caching off.

Usage: python3 tools/serve.py [port]    (default 8000, bound to 127.0.0.1)

Caching is disabled so every reload picks up edited CSS and JavaScript.
Contact still reports unavailable here; Pages Functions only run on Cloudflare.
"""
import functools
import http.server
import pathlib
import sys

DIST = pathlib.Path(__file__).resolve().parent.parent / 'dist'
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


def site_headers():
    """Return the name/value pairs of the '/*' rule in dist/_headers."""
    headers, block = [], None
    for raw in (DIST / '_headers').read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith('#'):
            if not line:
                block = None
            continue
        if not raw[0].isspace():
            block = line
        elif block == '/*':
            name, value = line.split(':', 1)
            headers.append((name.strip(), value.strip()))
    return headers


HEADERS = site_headers() + [('Cache-Control', 'no-store')]


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        for name, value in HEADERS:
            self.send_header(name, value)
        super().end_headers()


if __name__ == '__main__':
    print(f'Serving {DIST} at http://127.0.0.1:{PORT}/ (site headers on, caching off). Ctrl+C to stop.')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Handler, directory=str(DIST)))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
