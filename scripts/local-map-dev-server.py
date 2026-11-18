#!/usr/bin/env python3
"""Local static + map API shim for manual verification (not for production)."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import subprocess
import urllib.parse

PORT = int(os.environ.get("HAVKAR_MAP_DEV_PORT", "8877"))
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/map-"):
            qs = urllib.parse.parse_qs(parsed.query)
            query = {
                k: (v[0] if isinstance(v, list) and len(v) == 1 else v)
                for k, v in qs.items()
            }
            # Production routes these through create-event-checkout rewrites.
            # Locally import the lib modules directly.
            name = parsed.path.rsplit("/", 1)[-1]
            api = f"lib/{name}.mjs"
            script = f"""
import {{ default as handler }} from "./{api}";
const query = {json.dumps(query)};
const out = {{ status: 0, headers: {{}}, body: null, binary: false }};
const res = {{
  setHeader(k, v) {{ out.headers[k] = v; }},
  status(c) {{ out.status = c; return this; }},
  json(b) {{ out.body = b; console.log(JSON.stringify(out)); return this; }},
  send(b) {{
    out.binary = true;
    out.body = Buffer.isBuffer(b) ? b.toString("base64") : String(b);
    console.log(JSON.stringify(out));
    return this;
  }}
}};
await handler({{ method: "GET", query }}, res);
"""
            proc = subprocess.run(
                ["node", "--input-type=module", "-e", script],
                cwd=ROOT,
                capture_output=True,
                text=True,
            )
            if proc.returncode != 0:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(
                    json.dumps({"ok": False, "error": proc.stderr[-800:]}).encode()
                )
                return
            lines = [ln for ln in proc.stdout.strip().splitlines() if ln.strip()]
            out = json.loads(lines[-1])
            self.send_response(out.get("status") or 200)
            for key, value in (out.get("headers") or {}).items():
                self.send_header(key, value)
            if not (out.get("headers") or {}).get("Content-Type") and not out.get("binary"):
                self.send_header("Content-Type", "application/json")
            self.end_headers()
            body = out.get("body")
            if out.get("binary"):
                import base64

                self.wfile.write(base64.b64decode(body))
            else:
                self.wfile.write(json.dumps(body).encode())
            return
        return SimpleHTTPRequestHandler.do_GET(self)


if __name__ == "__main__":
    os.chdir(ROOT)
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Serving on http://127.0.0.1:{PORT}", flush=True)
    httpd.serve_forever()
