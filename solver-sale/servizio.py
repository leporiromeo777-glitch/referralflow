"""Servizio HTTP del solver, locale al Mac (127.0.0.1:8711). Un endpoint:
POST /risolvi con il JSON della richiesta; GET /vivo per il ping."""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from solver import risolvi

PORTA = int(sys.argv[1]) if len(sys.argv) > 1 else 8711


class Gestore(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # solo metodo, percorso e stato: mai il corpo
        sys.stderr.write("[solver-sale] %s %s\n" % (self.command, self.path))

    def _rispondi(self, codice: int, corpo: dict):
        dati = json.dumps(corpo).encode("utf-8")
        self.send_response(codice)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(dati)))
        self.end_headers()
        self.wfile.write(dati)

    def do_GET(self):
        if self.path == "/vivo":
            return self._rispondi(200, {"ok": True})
        self._rispondi(404, {"errore": "sconosciuto"})

    def do_POST(self):
        if self.path != "/risolvi":
            return self._rispondi(404, {"errore": "sconosciuto"})
        n = int(self.headers.get("Content-Length", "0"))
        try:
            richiesta = json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            return self._rispondi(400, {"errore": "json non valido"})
        try:
            self._rispondi(200, risolvi(richiesta))
        except Exception as e:  # il tipo dell'errore, non il contenuto
            sys.stderr.write("[solver-sale] errore %s\n" % type(e).__name__)
            self._rispondi(500, {"errore": type(e).__name__})


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", PORTA), Gestore).serve_forever()
