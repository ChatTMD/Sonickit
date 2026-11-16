"""Loopback-only static preview. Repeated launches reuse this project's server."""
from __future__ import annotations

import argparse
import hashlib
import json
import socket
import sys
import urllib.error
import urllib.request
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
ROOT_ID = hashlib.sha256(str(ROOT).casefold().encode()).hexdigest()[:16]
IDENTITY_PATH = "/__sonickit_preview__"


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, ".js": "text/javascript", ".css": "text/css"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if urlsplit(self.path).path == IDENTITY_PATH:
            body = json.dumps({"app": "SonicKit Web Preview", "root": ROOT_ID}).encode()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def send_head(self):
        requested = unquote(urlsplit(self.path).path)
        pieces = requested.replace("\\", "/").split("/")
        target = Path(self.translate_path(self.path)).resolve()
        if (not target.is_relative_to(ROOT) or any(p.startswith(".") for p in pieces if p)
                or any(p in {"tools", "tests"} for p in pieces)):
            self.send_error(HTTPStatus.NOT_FOUND)
            return None
        return super().send_head()

    def list_directory(self, path):
        self.send_error(HTTPStatus.NOT_FOUND)
        return None

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


class Server(ThreadingHTTPServer):
    allow_reuse_address = False
    daemon_threads = True

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    parser = argparse.ArgumentParser(description="Preview the SonicKit website locally.")
    parser.add_argument("--port", type=int, default=5173)
    parser.add_argument("--no-open", action="store_true")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be between 1024 and 65535.")
    url = f"http://127.0.0.1:{args.port}"
    try:
        server = Server(("127.0.0.1", args.port), Handler)
    except OSError:
        try:
            with urllib.request.urlopen(url + IDENTITY_PATH, timeout=2) as response:
                data = json.load(response)
            if data != {"app": "SonicKit Web Preview", "root": ROOT_ID}:
                raise ValueError("Another application is using this port.")
        except (OSError, ValueError, urllib.error.URLError):
            print(f"Port {args.port} is occupied. Stop that application or pass --port with another port.", file=sys.stderr)
            return 1
        print(f"Reusing SonicKit website preview: {url}", flush=True)
        if not args.no_open:
            webbrowser.open(url)
        return 0
    print(f"SonicKit website preview: {url}", flush=True)
    print("Refresh the browser after saving. Ctrl+C stops this preview.", flush=True)
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
