"""Simple HTTP server to serve the CAT PYQ website locally.
Run: python serve.py
Then open: http://localhost:8080
"""
import http.server
import socketserver
import os
import urllib.parse

PORT = 8080
PROJECT_ROOT = os.path.join(os.path.dirname(__file__))
SITE_DIR = os.path.join(PROJECT_ROOT, "site")

class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        parsed = urllib.parse.urlparse(path)
        clean_path = urllib.parse.unquote(parsed.path)
        if clean_path.startswith("/data/") or clean_path == "/data":
            rel = clean_path[len("/data/"):]
            return os.path.join(PROJECT_ROOT, "data", rel)
        if clean_path.startswith("/assets/") or clean_path == "/assets":
            rel = clean_path[len("/assets/"):]
            return os.path.join(PROJECT_ROOT, "assets", rel)
        return os.path.join(SITE_DIR, clean_path.lstrip("/"))

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

if __name__ == "__main__":
    with socketserver.TCPServer(("", PORT), Handler) as httpd:
        print(f"Serving CAT PYQ site at http://localhost:{PORT}")
        print("Press Ctrl+C to stop")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
