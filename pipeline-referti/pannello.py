#!/usr/bin/env python3
"""Pannello locale della pipeline referti.

Gira SOLO su questo Mac: ascolta su 127.0.0.1 e non è raggiungibile dalla
rete. Qui i contenuti clinici si possono mostrare perché non lasciano mai
il computer (il disco è cifrato con FileVault). La conferma clinica dei
referti resta in ReferralFlow: questo è lo strumento d'esercizio dello
studio — coda, errori, dizionario, anteprima delle bozze non ancora inviate.

Uso:
    python3 pannello.py          poi si apre http://127.0.0.1:8737
"""

import html
import json
import os
import shutil
import subprocess
import sys
import urllib.parse
from datetime import datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

BASE = Path(os.environ.get("REFERTI_BASE", str(Path.home() / "referti")))
QUI = Path(__file__).resolve().parent
CORREZIONI = QUI / "correzioni.json"
LOCALI = QUI / "correzioni-locali.json"
PORTA = int(os.environ.get("REFERTI_PANNELLO_PORTA", "8737"))
SEZIONI = {
    "termini_clinici": "Termine clinico",
    "linguaggio_comune": "Linguaggio comune",
}
TIPI_AUDIO = {
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
    ".wav": "audio/wav", ".aac": "audio/aac",
}

STILE = """
:root { --cta: #0d5c48; --fondo: #f4f3ef; --linea: #ddd9d0; }
* { box-sizing: border-box; }
body { font: 15px/1.5 -apple-system, sans-serif; margin: 0; background: var(--fondo); color: #22251f; }
header { background: var(--cta); color: #fff; padding: 14px 22px; display: flex; gap: 18px; align-items: baseline; flex-wrap: wrap; }
header b { font-size: 17px; }
header a { color: #dcebe4; text-decoration: none; }
header a.qui { color: #fff; border-bottom: 2px solid #fff; }
main { max-width: 880px; margin: 22px auto; padding: 0 16px; }
.card { background: #fff; border: 1px solid var(--linea); border-radius: 16px; padding: 16px 20px; margin-bottom: 16px; }
h1 { font-size: 22px; margin: 4px 0 14px; }
h2 { font-size: 16px; margin: 0 0 8px; }
table { border-collapse: collapse; width: 100%; }
td, th { text-align: left; padding: 6px 10px 6px 0; border-bottom: 1px solid var(--linea); vertical-align: top; }
.muted { color: #6b6f66; font-size: 13px; }
.btn { display: inline-block; background: var(--cta); color: #fff; border: 0; border-radius: 999px; padding: 7px 16px; font-size: 14px; cursor: pointer; text-decoration: none; }
.btn-secondario { background: #fff; color: var(--cta); border: 1px solid var(--cta); }
input, select { padding: 7px 10px; border: 1px solid var(--linea); border-radius: 10px; font-size: 14px; }
pre { white-space: pre-wrap; font: 14px/1.6 -apple-system, sans-serif; background: #faf9f6; border-radius: 10px; padding: 12px; }
pre.log { font-family: ui-monospace, monospace; font-size: 12px; }
mark.div { background: #faf0dc; padding: 0 3px; border-radius: 4px; }
mark.dub { background: #fbeaea; padding: 0 3px; border-radius: 4px; }
.avviso { background: #eef6f2; border: 1px solid #cfe3da; border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; }
.errore-msg { background: #fbeaea; border: 1px solid #f0d4d4; border-radius: 10px; padding: 8px 12px; margin-bottom: 12px; }
.num { font-variant-numeric: tabular-nums; }
"""


def e(testo) -> str:
    return html.escape(str(testo), quote=True)


def leggi_json(percorso: Path, predefinito):
    try:
        return json.loads(percorso.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return predefinito


def scrivi_locali(dati: dict) -> None:
    provvisorio = LOCALI.with_suffix(".json.tmp")
    provvisorio.write_text(
        json.dumps(dati, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    provvisorio.replace(LOCALI)


def pagina(titolo: str, attiva: str, corpo: str) -> bytes:
    voci = [("/", "Coda"), ("/bozze", "Bozze"), ("/errori", "Errori"), ("/dizionario", "Dizionario")]
    nav = " ".join(
        f'<a href="{url}" class="{"qui" if url == attiva else ""}">{nome}</a>'
        for url, nome in voci
    )
    return f"""<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{e(titolo)} — Pipeline referti</title><style>{STILE}</style></head>
<body><header><b>Pipeline referti</b> {nav}</header>
<main><h1>{e(titolo)}</h1>{corpo}
<p class="muted">Pannello locale: visibile solo da questo computer. La conferma dei referti si fa in ReferralFlow.</p>
</main></body></html>""".encode("utf-8")


# ── Pagine ───────────────────────────────────────────────────────────────────

def pagina_coda() -> bytes:
    conta = {}
    for nome in ("ingresso", "lavorazione", "errori", "archivio_temp", "output"):
        c = BASE / nome
        conta[nome] = len([p for p in c.iterdir() if p.is_file() and not p.name.startswith(".") and not p.name.endswith(".log")]) if c.is_dir() else 0
    righe_log = ""
    registro = BASE / "log" / "servizio.log"
    if registro.is_file():
        code = registro.read_text(encoding="utf-8").splitlines()[-25:]
        righe_log = "\n".join(reversed(code))
    corpo = f"""
<div class="card"><h2>Stato della coda</h2><table>
<tr><td>In attesa di elaborazione (ingresso)</td><td class="num">{conta['ingresso']}</td></tr>
<tr><td>In lavorazione</td><td class="num">{conta['lavorazione']}</td></tr>
<tr><td>Bozze pronte, in attesa di invio a ReferralFlow</td><td class="num">{conta['output']}</td></tr>
<tr><td>Audio in archivio (in attesa di conferma del server)</td><td class="num">{conta['archivio_temp']}</td></tr>
<tr><td>In errore</td><td class="num">{conta['errori']}</td></tr>
</table>
<p class="muted">Il medico deposita i dettati in {e(BASE)}/ingresso — il servizio fa il resto.</p></div>
<div class="card"><h2>Registro del servizio (più recente in alto)</h2>
{'<pre class="log">' + e(righe_log) + '</pre>' if righe_log else '<p class="muted">Nessun registro: il servizio non è ancora stato avviato in questa cartella.</p>'}
</div>"""
    return pagina("Coda", "/", corpo)


def _bozze_pendenti() -> list[dict]:
    out = BASE / "output"
    bozze = []
    if out.is_dir():
        for p in sorted(out.glob("*.json")):
            d = leggi_json(p, None)
            if isinstance(d, dict) and d.get("file_id"):
                bozze.append(d)
    return bozze


def pagina_bozze() -> bytes:
    bozze = _bozze_pendenti()
    if not bozze:
        corpo = '<div class="card"><p class="muted">Nessuna bozza in attesa di invio. Quelle già consegnate si rivedono e si confermano in ReferralFlow, pagina «Bozze di referto».</p></div>'
        return pagina("Bozze in attesa di invio", "/bozze", corpo)
    righe = ""
    for d in bozze:
        paz = (d.get("campi_estratti") or {}).get("nome_paziente") or "—"
        righe += f"""<tr><td><a href="/bozza?id={e(d['file_id'])}">{e(paz)}</a>
<div class="muted">{e(d.get('timestamp') or '')}</div></td>
<td class="num">{len(d.get('divergenze') or [])} divergenze<br>{len(d.get('segmenti_dubbi') or [])} dubbi<br>{len(d.get('allarmi_numerici') or [])} allarmi</td></tr>"""
    corpo = f'<div class="card"><table>{righe}</table><p class="muted">Queste bozze partiranno da sole appena ReferralFlow è raggiungibile e configurato.</p></div>'
    return pagina("Bozze in attesa di invio", "/bozze", corpo)


def _evidenzia(testo: str, divergenze: list, dubbi: list) -> str:
    """Testo HTML con i frammenti segnalati evidenziati (prima occorrenza,
    senza sovrapposizioni) — stessa logica della pagina in ReferralFlow."""
    frammenti = [(d.get("contesto") or "", "div") for d in divergenze if isinstance(d, dict)]
    frammenti += [(s, "dub") for s in dubbi if isinstance(s, str)]
    intervalli = []
    for fr, tipo in frammenti:
        fr = fr.strip()
        if len(fr) < 3:
            continue
        i = testo.find(fr)
        if i == -1 or any(i < fine and i + len(fr) > inizio for inizio, fine, _ in intervalli):
            continue
        intervalli.append((i, i + len(fr), tipo))
    intervalli.sort()
    pezzi, pos = [], 0
    for inizio, fine, tipo in intervalli:
        pezzi.append(e(testo[pos:inizio]))
        pezzi.append(f'<mark class="{tipo}">{e(testo[inizio:fine])}</mark>')
        pos = fine
    pezzi.append(e(testo[pos:]))
    return "".join(pezzi)


def pagina_bozza(file_id: str) -> bytes | None:
    d = leggi_json(BASE / "output" / f"{file_id}.json", None)
    if not isinstance(d, dict):
        return None
    audio = next((BASE / "archivio_temp").glob(file_id + ".*"), None) if (BASE / "archivio_temp").is_dir() else None
    campi = d.get("campi_estratti") or {}
    divergenze = d.get("divergenze") or []
    dubbi = d.get("segmenti_dubbi") or []
    allarmi = d.get("allarmi_numerici") or []

    blocco_audio = (
        f'<div class="card"><h2>Audio originale (l\'input)</h2>'
        f'<audio controls preload="none" src="/audio?id={e(file_id)}" style="width:100%"></audio></div>'
        if audio else ""
    )
    righe_campi = "".join(
        f"<tr><td>{e(k.replace('_', ' '))}</td><td>{e(json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v)}</td></tr>"
        for k, v in campi.items()
    )
    righe_div = "".join(
        f'<li><span class="muted">…{e(dv.get("contesto") or "")}…</span><br><b>A:</b> {e(dv.get("versione_a") or "—")} · <b>B:</b> {e(dv.get("versione_b") or "—")}</li>'
        for dv in divergenze if isinstance(dv, dict)
    )
    righe_allarmi = "".join(
        f"<li><b>{e(a.get('campo'))}</b>: {e(a.get('valore'))} <span class=\"muted\">({e(a.get('stato'))}{', atteso ' + e(a.get('intervallo')) if a.get('intervallo') else ''})</span></li>"
        for a in allarmi if isinstance(a, dict)
    )
    corpo = f"""
<div class="avviso">Bozza in attesa di invio a ReferralFlow — la conferma si farà lì. Ricevuta: {e(d.get('timestamp') or '?')}</div>
{blocco_audio}
{'<div class="card"><h2>⚠ Allarmi numerici</h2><ul>' + righe_allarmi + '</ul></div>' if righe_allarmi else ''}
<div class="card"><h2>Testo del referto</h2>
<p class="muted">Evidenziati: <mark class="div">divergenze tra le due trascrizioni</mark> e <mark class="dub">segmenti dubbi</mark>.</p>
<pre>{_evidenzia(d.get('testo_corretto') or '', divergenze, dubbi)}</pre></div>
{'<div class="card"><h2>Divergenze (A contro B)</h2><ul>' + righe_div + '</ul></div>' if righe_div else ''}
<div class="card"><h2>Campi estratti</h2><table>{righe_campi or '<tr><td class="muted">nessuno</td></tr>'}</table></div>
<p><a class="btn btn-secondario" href="/bozze">← Tutte le bozze</a></p>"""
    return pagina("Bozza " + file_id[:8], "/bozze", corpo)


def pagina_errori(msg: str = "") -> bytes:
    cart = BASE / "errori"
    voci = ""
    if cart.is_dir():
        for p in sorted(cart.iterdir()):
            if not p.is_file() or p.name.endswith(".log") or p.name.startswith("."):
                continue
            testo_log = cart / (p.name + ".log")
            diagnosi = testo_log.read_text(encoding="utf-8").strip() if testo_log.is_file() else "senza diagnosi"
            voci += f"""<tr><td>{e(p.name)}<div class="muted">{e(diagnosi)}</div></td>
<td><form method="post" action="/riprova"><input type="hidden" name="nome" value="{e(p.name)}">
<button class="btn btn-secondario" type="submit">Riprova</button></form></td></tr>"""
    corpo = (f'<div class="avviso">{e(msg)}</div>' if msg else "") + (
        f'<div class="card"><table>{voci}</table><p class="muted">«Riprova» rimette il file in coda (gli errori d\'invio tornano tra le bozze).</p></div>'
        if voci else '<div class="card"><p class="muted">Nessun file in errore.</p></div>'
    )
    return pagina("Errori", "/errori", corpo)


def pagina_dizionario(msg: str = "", errore: str = "") -> bytes:
    repo = leggi_json(CORREZIONI, {})
    locali = leggi_json(LOCALI, {})
    opzioni = "".join(f'<option value="{s}">{n}</option>' for s, n in SEZIONI.items())
    righe_locali = ""
    for sezione in SEZIONI:
        for da, a in sorted((locali.get(sezione) or {}).items()):
            righe_locali += f"""<tr><td>{e(da)}</td><td>{e(a)}</td><td class="muted">{e(SEZIONI[sezione])}</td>
<td><form method="post" action="/dizionario/rimuovi"><input type="hidden" name="sezione" value="{e(sezione)}">
<input type="hidden" name="da" value="{e(da)}"><button class="btn btn-secondario" type="submit">Togli</button></form></td></tr>"""
    righe_repo = ""
    for sezione in SEZIONI:
        for da, a in sorted((repo.get(sezione) or {}).items()):
            if da.startswith("_"):
                continue
            righe_repo += f'<tr><td>{e(da)}</td><td>{e(a)}</td><td class="muted">{e(SEZIONI[sezione])}</td></tr>'
    corpo = f"""
{f'<div class="errore-msg">{e(errore)}</div>' if errore else ''}
{f'<div class="avviso">{e(msg)}</div>' if msg else ''}
<div class="card"><h2>Aggiungi una correzione</h2>
<p class="muted">Solo errori RICORRENTI e NON ambigui: se una parola potrebbe comparire legittimamente col suo significato originale, non metterla qui. Mai numeri. Il servizio la usa dal giro successivo.</p>
<form method="post" action="/dizionario/aggiungi" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
<input name="da" placeholder="come esce sbagliato" required maxlength="80">
<span>→</span>
<input name="a" placeholder="come dev'essere" required maxlength="80">
<select name="sezione">{opzioni}</select>
<button class="btn" type="submit">Aggiungi</button></form></div>
<div class="card"><h2>Voci dello studio ({sum(len(locali.get(s) or {}) for s in SEZIONI)})</h2>
<table>{righe_locali or '<tr><td class="muted">nessuna — quelle che aggiungi compaiono qui</td></tr>'}</table></div>
<div class="card"><h2>Voci di base del progetto</h2><table>{righe_repo}</table>
<p class="muted">Queste arrivano dal repo con gli aggiornamenti; a parità di voce, vincono le voci dello studio.</p></div>"""
    return pagina("Dizionario delle correzioni", "/dizionario", corpo)


# ── Server ───────────────────────────────────────────────────────────────────

class Pannello(BaseHTTPRequestHandler):
    server_version = "PannelloReferti"

    def log_message(self, *args):  # niente log delle richieste
        pass

    def _rispondi(self, corpo: bytes, tipo: str = "text/html; charset=utf-8", stato: int = 200):
        self.send_response(stato)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def _reindirizza(self, dove: str):
        self.send_response(303)
        self.send_header("Location", dove)
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(url.query)
        prendi = lambda k: (q.get(k) or [""])[0]
        if url.path == "/":
            return self._rispondi(pagina_coda())
        if url.path == "/bozze":
            return self._rispondi(pagina_bozze())
        if url.path == "/bozza":
            fid = prendi("id")
            corpo = pagina_bozza(fid) if fid.isalnum() else None
            if corpo:
                return self._rispondi(corpo)
        if url.path == "/audio":
            fid = prendi("id")
            if fid.isalnum() and (BASE / "archivio_temp").is_dir():
                audio = next((BASE / "archivio_temp").glob(fid + ".*"), None)
                if audio:
                    tipo = TIPI_AUDIO.get(audio.suffix.lower(), "application/octet-stream")
                    return self._rispondi(audio.read_bytes(), tipo)
        if url.path == "/errori":
            return self._rispondi(pagina_errori(prendi("msg")))
        if url.path == "/dizionario":
            return self._rispondi(pagina_dizionario(prendi("msg"), prendi("err")))
        self._rispondi(pagina("Non trovato", "/", '<div class="card"><p>Pagina inesistente.</p></div>'), stato=404)

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        dati = urllib.parse.parse_qs(self.rfile.read(n).decode("utf-8"))
        prendi = lambda k: (dati.get(k) or [""])[0].strip()

        if self.path == "/riprova":
            nome = os.path.basename(prendi("nome"))
            origine = BASE / "errori" / nome
            if nome and origine.is_file():
                if nome.endswith(".json"):
                    destino = BASE / "output" / nome  # errore d'invio: torna tra le bozze
                else:
                    destino = BASE / "ingresso" / nome  # errore d'elaborazione: torna in coda
                shutil.move(str(origine), str(destino))
                registro = BASE / "errori" / (nome + ".log")
                if registro.is_file():
                    registro.unlink()
                return self._reindirizza("/errori?msg=" + urllib.parse.quote("Rimesso in coda: riparte al prossimo giro del servizio."))
            return self._reindirizza("/errori")

        if self.path == "/dizionario/aggiungi":
            da, a, sezione = prendi("da"), prendi("a"), prendi("sezione")
            if sezione not in SEZIONI:
                sezione = "termini_clinici"
            if not da or not a:
                return self._reindirizza("/dizionario?err=" + urllib.parse.quote("Servono entrambe le caselle."))
            if any(c.isdigit() for c in da + a):
                return self._reindirizza("/dizionario?err=" + urllib.parse.quote("Le correzioni non possono contenere numeri: è una regola fissa del sistema."))
            if da.lower() == a.lower():
                return self._reindirizza("/dizionario?err=" + urllib.parse.quote("Le due voci sono uguali."))
            locali = leggi_json(LOCALI, {})
            locali.setdefault(sezione, {})[da.lower()] = a
            scrivi_locali(locali)
            return self._reindirizza("/dizionario?msg=" + urllib.parse.quote(f"Aggiunta: «{da}» → «{a}». Attiva dal prossimo giro."))

        if self.path == "/dizionario/rimuovi":
            da, sezione = prendi("da"), prendi("sezione")
            locali = leggi_json(LOCALI, {})
            if sezione in SEZIONI and da in (locali.get(sezione) or {}):
                del locali[sezione][da]
                scrivi_locali(locali)
                return self._reindirizza("/dizionario?msg=" + urllib.parse.quote(f"Tolta: «{da}»."))
            return self._reindirizza("/dizionario")

        self._reindirizza("/")


def main() -> int:
    server = HTTPServer(("127.0.0.1", PORTA), Pannello)
    indirizzo = f"http://127.0.0.1:{PORTA}"
    print(f"Pannello attivo su {indirizzo} — Ctrl+C per fermarlo.", file=sys.stderr)
    if sys.platform == "darwin":
        subprocess.Popen(["open", indirizzo])
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
