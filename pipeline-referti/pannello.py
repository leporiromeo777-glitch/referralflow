#!/usr/bin/env python3
"""Pannello locale della pipeline referti — pagina unica.

Gira SOLO su questo Mac: ascolta su 127.0.0.1 e non è raggiungibile dalla
rete. Qui i contenuti clinici si possono mostrare perché non lasciano mai
il computer (il disco è cifrato con FileVault). La conferma clinica dei
referti resta in ReferralFlow: questo è lo strumento d'esercizio dello
studio — dettati trascinati dentro, coda, bozze con audio, errori,
dizionario.

Uso:
    python3 pannello.py          poi si apre http://127.0.0.1:8737
"""

import html
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

BASE = Path(os.environ.get("REFERTI_BASE", str(Path.home() / "referti")))
QUI = Path(__file__).resolve().parent
CORREZIONI = QUI / "correzioni.json"
LOCALI = QUI / "correzioni-locali.json"
INVIO_CONF = QUI / "invio.conf"
PORTA = int(os.environ.get("REFERTI_PANNELLO_PORTA", "8737"))
SEZIONI = {
    "termini_clinici": "Termine clinico",
    "linguaggio_comune": "Linguaggio comune",
}
TIPI_AUDIO = {
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav",
    ".aac": "audio/aac", ".ogg": "audio/ogg", ".flac": "audio/flac",
    ".aiff": "audio/aiff", ".caf": "audio/x-caf", ".mp4": "audio/mp4",
}
MAX_CARICO_BYTE = 500 * 1024 * 1024

STILE = """
:root {
  --accent: #1789d6; --bg: #f5f5f7; --card: #ffffff;
  --surface: rgba(255, 255, 255, 0.72); --text: #1d1d1f; --muted: #86868b;
  --hairline: rgba(0, 0, 0, 0.08); --warn: #c77700; --bad: #d70015;
  --riemp: rgba(120, 120, 128, 0.10); --accent-velo: rgba(23, 137, 214, 0.08);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #000; --card: #1c1c1e; --surface: rgba(22, 22, 24, 0.72);
    --text: #f5f5f7; --muted: #98989d; --hairline: rgba(255, 255, 255, 0.12);
    --accent: #3fa4ea; --warn: #ff9f0a; --bad: #ff453a;
    --riemp: rgba(120, 120, 128, 0.22); --accent-velo: rgba(63, 164, 234, 0.12);
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--text);
  font: 15px/1.55 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  -webkit-font-smoothing: antialiased; }
header { position: sticky; top: 0; z-index: 10;
  backdrop-filter: saturate(180%) blur(20px); -webkit-backdrop-filter: saturate(180%) blur(20px);
  background: var(--surface); border-bottom: 1px solid var(--hairline);
  display: flex; align-items: center; gap: 6px; padding: 10px 22px; flex-wrap: wrap; }
header b { font-size: 15px; font-weight: 600; letter-spacing: -0.01em; margin-right: 14px; }
header b::before { content: ""; display: inline-block; width: 9px; height: 9px;
  border-radius: 50%; background: var(--accent); margin-right: 9px;
  box-shadow: 0 0 10px var(--accent); }
header a { color: var(--muted); text-decoration: none; font-size: 14px;
  padding: 6px 14px; border-radius: 999px; transition: color .18s, background .18s; }
header a:hover { color: var(--text); background: var(--riemp); }
main { max-width: 920px; margin: 30px auto 40px; padding: 0 20px; }
h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; margin: 0 0 20px; }
.card { background: var(--card); border: 1px solid var(--hairline); border-radius: 20px;
  padding: 20px 24px; margin-bottom: 16px;
  box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 10px 30px rgba(0,0,0,.05); }
h2 { font-size: 12px; font-weight: 600; letter-spacing: 0.07em; text-transform: uppercase;
  color: var(--muted); margin: 0 0 12px; }
.drop { border: 2px dashed rgba(23, 137, 214, 0.45); border-radius: 24px;
  background: var(--card); padding: 36px 24px; text-align: center;
  color: var(--muted); transition: all .18s; margin-bottom: 16px; cursor: pointer; }
.drop b { display: block; color: var(--text); font-size: 17px; font-weight: 600; margin-bottom: 4px; }
.drop.drag { border-color: var(--accent); background: var(--accent-velo);
  transform: scale(1.01); }
.drop .stato { margin-top: 10px; font-size: 13px; color: var(--accent); white-space: pre-line; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 14px; margin-bottom: 16px; }
.stat { background: var(--card); border: 1px solid var(--hairline); border-radius: 20px;
  padding: 16px 20px 14px; box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 10px 30px rgba(0,0,0,.05); }
.stat .n { font-size: 34px; font-weight: 700; letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums; }
.stat .l { color: var(--muted); font-size: 13px; margin-top: 2px; line-height: 1.3; }
.stat.bad .n { color: var(--bad); }
.stat.zero .n { color: var(--muted); }
details.card > summary { cursor: pointer; font-weight: 600; list-style: none;
  display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
details.card > summary::before { content: "›"; color: var(--accent);
  font-weight: 700; font-size: 17px; transition: transform .15s; display: inline-block; }
details[open].card > summary::before { transform: rotate(90deg); }
details.card > summary .muted { font-weight: 400; }
details.card[open] > summary { margin-bottom: 14px; }
table { border-collapse: collapse; width: 100%; }
td, th { text-align: left; padding: 10px 12px 10px 0; border-bottom: 1px solid var(--hairline);
  vertical-align: top; }
tr:last-child td { border-bottom: 0; }
a { color: var(--accent); }
.muted { color: var(--muted); font-size: 13px; }
.btn { display: inline-block; background: var(--accent); color: #fff; border: 0;
  border-radius: 999px; padding: 8px 18px; font-size: 14px; font-weight: 500;
  cursor: pointer; text-decoration: none; transition: filter .15s, transform .15s; }
.btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
.btn-secondario { background: var(--riemp); color: var(--text); }
input, select { padding: 9px 14px; border: 1px solid var(--hairline); border-radius: 12px;
  font-size: 14px; background: var(--card); color: var(--text); accent-color: var(--accent); }
input:focus, select:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }
pre { white-space: pre-wrap; font: 14px/1.7 -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--riemp); border-radius: 14px; padding: 16px; }
pre.log { font: 11.5px/1.8 ui-monospace, "SF Mono", Menlo, monospace;
  background: #0b0c0e; color: #8fcdf0; border-radius: 14px; padding: 16px;
  box-shadow: inset 0 0 0 1px rgba(255,255,255,.07); }
mark.div { background: rgba(255, 159, 10, 0.25); color: inherit; padding: 0 3px; border-radius: 4px; }
mark.dub { background: rgba(255, 69, 58, 0.22); color: inherit; padding: 0 3px; border-radius: 4px; }
.avviso { background: var(--accent-velo); border: 1px solid rgba(23, 137, 214, 0.28);
  border-radius: 14px; padding: 10px 14px; margin-bottom: 14px; font-size: 14px; }
.errore-msg { background: rgba(255, 69, 58, 0.12); border: 1px solid rgba(255, 69, 58, 0.3);
  border-radius: 14px; padding: 10px 14px; margin-bottom: 14px; font-size: 14px; }
.num { font-variant-numeric: tabular-nums; }
.sug-list { list-style: none; margin: 12px 0 0; padding: 0; display: flex; flex-direction: column; gap: 10px; }
.sug-item { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.sug-pair { font-size: 15px; }
.sug-pair s { color: var(--muted); }
.sug-pair b { color: var(--text); }
.sug-n { color: var(--muted); font-size: 13px; font-variant-numeric: tabular-nums; }
.sug-item form { margin-left: auto; }
audio { width: 100%; margin-top: 4px; }
.firma { color: var(--muted); font-size: 12px; text-align: center; margin-top: 34px; }
"""

SCRIPT = """
const zona = document.getElementById('zona');
const scelta = document.getElementById('scelta');
const stato = document.getElementById('statocarico');
const ESTENSIONI = %s;

function estensioneOk(nome) {
  const p = nome.lastIndexOf('.');
  return p > -1 && ESTENSIONI.includes(nome.slice(p).toLowerCase());
}

async function carica(files) {
  const buoni = [...files].filter(f => estensioneOk(f.name));
  const scartati = [...files].length - buoni.length;
  let fatti = 0;
  for (const f of buoni) {
    stato.textContent = `Carico ${f.name}… (${fatti + 1}/${buoni.length})`;
    try {
      const r = await fetch('/carica?nome=' + encodeURIComponent(f.name), { method: 'POST', body: f });
      if (r.ok) fatti++;
    } catch (e) {}
  }
  stato.textContent = (fatti ? `✓ ${fatti} dettato/i in coda.` : '') +
    (scartati ? ` ${scartati} file ignorati (non sono audio).` : '') || 'Nessun file caricato.';
  if (fatti) setTimeout(() => location.reload(), 900);
}

['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => {
  e.preventDefault(); zona.classList.add('drag');
}));
['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => {
  e.preventDefault(); zona.classList.remove('drag');
}));
zona.addEventListener('drop', e => carica(e.dataTransfer.files));
zona.addEventListener('click', () => scelta.click());
scelta.addEventListener('change', () => carica(scelta.files));
""" % json.dumps(sorted(TIPI_AUDIO))


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


# ── Suggerimenti dal server (imparati dalle conferme) ────────────────────────
def _conf_invio() -> dict:
    """URL e token di ReferralFlow: da ambiente o da invio.conf (una credenziale,
    resta sul Mac)."""
    conf = {}
    for k in ("REFERTI_FLOW_URL", "REFERTI_FLOW_TOKEN"):
        if os.environ.get(k):
            conf[k] = os.environ[k].strip()
    if INVIO_CONF.is_file():
        try:
            for riga in INVIO_CONF.read_text(encoding="utf-8").splitlines():
                riga = riga.strip()
                if riga.startswith("REFERTI_FLOW_") and "=" in riga:
                    chiave, valore = riga.split("=", 1)
                    conf.setdefault(chiave.strip(), valore.strip())
        except OSError:
            pass
    return conf


def carica_suggerimenti() -> list:
    """Chiede a ReferralFlow le correzioni ricorrenti da insegnare al dizionario.
    Se l'invio non è configurato o il server non risponde, torna lista vuota
    (il pannello resta utile lo stesso)."""
    conf = _conf_invio()
    url, token = conf.get("REFERTI_FLOW_URL"), conf.get("REFERTI_FLOW_TOKEN")
    if not url or not token:
        return []
    endpoint = url.rstrip("/") + "/api/referti/suggerimenti"
    try:
        req = urllib.request.Request(endpoint, headers={"Authorization": f"Bearer {token}"})
        with urllib.request.urlopen(req, timeout=6) as resp:
            dati = json.loads(resp.read().decode("utf-8"))
        return dati.get("suggerimenti", []) if isinstance(dati, dict) else []
    except Exception:
        return []


def segna_applicato(da: str, a: str) -> None:
    """Dice al server che questa coppia è stata aggiunta al dizionario, così
    sparisce dai suggerimenti. Best-effort."""
    conf = _conf_invio()
    url, token = conf.get("REFERTI_FLOW_URL"), conf.get("REFERTI_FLOW_TOKEN")
    if not url or not token:
        return
    endpoint = url.rstrip("/") + "/api/referti/suggerimenti"
    corpo = json.dumps({"da": da, "a": a}).encode("utf-8")
    try:
        req = urllib.request.Request(
            endpoint, data=corpo, method="POST",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        )
        urllib.request.urlopen(req, timeout=6).read()
    except Exception:
        pass


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


# ── Sezioni della pagina unica ───────────────────────────────────────────────

def sez_drop() -> str:
    return """
<div class="drop" id="zona">
<b>Trascina qui i dettati vocali</b>
memo vocali, m4a, mp3, wav… — finiscono in coda e il servizio li elabora da solo<br>
<span class="muted">(oppure clicca per sceglierli)</span>
<div class="stato" id="statocarico"></div>
<input type="file" id="scelta" multiple accept="audio/*,.m4a,.mp3,.wav,.aac,.ogg,.flac,.aiff,.caf" hidden>
</div>"""


def sez_stats() -> str:
    conta = {}
    for nome in ("ingresso", "lavorazione", "errori", "archivio_temp", "output"):
        c = BASE / nome
        conta[nome] = len([p for p in c.iterdir() if p.is_file() and not p.name.startswith(".") and not p.name.endswith(".log")]) if c.is_dir() else 0

    def tessera(numero: int, etichetta: str, critico: bool = False) -> str:
        classe = "stat bad" if critico and numero > 0 else ("stat zero" if numero == 0 else "stat")
        return f'<div class="{classe}"><div class="n">{numero}</div><div class="l">{etichetta}</div></div>'

    return f"""
<div class="stats">
{tessera(conta['ingresso'], 'In attesa di elaborazione')}
{tessera(conta['lavorazione'], 'In lavorazione')}
{tessera(conta['output'], 'Pronte per l’invio')}
{tessera(conta['archivio_temp'], 'Audio in archivio')}
{tessera(conta['errori'], 'In errore', critico=True)}
</div>"""


def sez_bozze() -> str:
    out = BASE / "output"
    bozze = []
    if out.is_dir():
        for p in sorted(out.glob("*.json")):
            d = leggi_json(p, None)
            if isinstance(d, dict) and d.get("file_id"):
                bozze.append(d)
    if not bozze:
        return '<div class="card"><h2>Bozze in attesa di invio</h2><p class="muted">Nessuna: quelle già consegnate si rivedono e si confermano in ReferralFlow.</p></div>'

    blocchi = ""
    for d in bozze:
        fid = d["file_id"]
        campi = d.get("campi_estratti") or {}
        divergenze = d.get("divergenze") or []
        dubbi = d.get("segmenti_dubbi") or []
        allarmi = d.get("allarmi_numerici") or []
        paz = campi.get("nome_paziente") or "Paziente non indicato"
        audio_file = next((BASE / "archivio_temp").glob(fid + ".*"), None) if (BASE / "archivio_temp").is_dir() else None
        audio_html = (
            f'<h2>Audio originale</h2><audio controls preload="none" src="/audio?id={e(fid)}"></audio>'
            if audio_file else ""
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
        riassunto = f"{len(divergenze)} divergenze · {len(dubbi)} dubbi · {len(allarmi)} allarmi"
        blocchi += f"""
<details class="card"><summary>{e(paz)}
<span class="muted">{e(d.get('timestamp') or '')} · {e(riassunto)}</span></summary>
{audio_html}
{'<h2 style="margin-top:14px">⚠ Allarmi numerici</h2><ul>' + righe_allarmi + '</ul>' if righe_allarmi else ''}
<h2 style="margin-top:14px">Testo del referto</h2>
<p class="muted">Evidenziati: <mark class="div">divergenze tra le due trascrizioni</mark> e <mark class="dub">segmenti dubbi</mark>.</p>
<pre>{_evidenzia(d.get('testo_corretto') or '', divergenze, dubbi)}</pre>
{'<h2>Divergenze (A contro B)</h2><ul>' + righe_div + '</ul>' if righe_div else ''}
<h2>Campi estratti</h2><table>{righe_campi or '<tr><td class="muted">nessuno</td></tr>'}</table>
</details>"""
    return f'<h2 style="margin:22px 4px 10px">Bozze in attesa di invio · {len(bozze)}</h2>' + blocchi


def sez_errori() -> str:
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
    if not voci:
        return ""
    return f"""<div class="card" id="errori"><h2>Errori</h2>
<table>{voci}</table><p class="muted">«Riprova» rimette il file in coda (gli errori d’invio tornano tra le bozze).</p>
</div>"""


def sez_registro() -> str:
    registro = BASE / "log" / "servizio.log"
    if not registro.is_file():
        return '<div class="card"><h2>Registro del servizio</h2><p class="muted">Il servizio non è ancora stato avviato in questa cartella.</p></div>'
    code = registro.read_text(encoding="utf-8").splitlines()[-25:]
    return f"""<details class="card"><summary>Registro del servizio <span class="muted">ultime {len(code)} righe · più recente in alto</span></summary>
<pre class="log">{e(chr(10).join(reversed(code)))}</pre></details>"""


def sez_suggerimenti() -> str:
    """Correzioni ricorrenti imparate dalle conferme in ReferralFlow: un clic le
    aggiunge al dizionario locale."""
    sugg = carica_suggerimenti()
    righe = []
    for s in sugg:
        da, a = str(s.get("da", "")).strip(), str(s.get("a", "")).strip()
        if not da or not a:
            continue
        n = e(str(s.get("conteggio", "")))
        righe.append(
            f'<li class="sug-item"><span class="sug-pair"><s>{e(da)}</s> → <b>{e(a)}</b></span>'
            f'<span class="sug-n">×{n}</span>'
            f'<form method="post" action="/suggerimenti/aggiungi">'
            f'<input type="hidden" name="da" value="{e(da)}">'
            f'<input type="hidden" name="a" value="{e(a)}">'
            f'<button class="btn" type="submit">Aggiungi al dizionario</button></form></li>'
        )
    if not righe:
        return ""
    return (
        '<section class="card" id="suggerimenti"><h2>Impara dalle conferme</h2>'
        '<p class="muted">Parole corrette spesso in ReferralFlow. Aggiungile al '
        'dizionario e la trascrizione smetterà di sbagliarle.</p>'
        f'<ul class="sug-list">{"".join(righe)}</ul></section>'
    )


def sez_dizionario() -> str:
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
    n_locali = sum(len(locali.get(s) or {}) for s in SEZIONI)
    n_repo = sum(
        1 for s in SEZIONI for k in (repo.get(s) or {}) if not k.startswith("_")
    )
    return f"""
<div class="card" id="dizionario"><h2>Dizionario · aggiungi una correzione</h2>
<p class="muted">Solo errori RICORRENTI e NON ambigui: se una parola potrebbe comparire legittimamente col suo significato originale, non metterla qui. Mai numeri. Il servizio la usa dal giro successivo.</p>
<form method="post" action="/dizionario/aggiungi" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
<input name="da" placeholder="come esce sbagliato" required maxlength="80">
<span>→</span>
<input name="a" placeholder="come dev'essere" required maxlength="80">
<select name="sezione">{opzioni}</select>
<button class="btn" type="submit">Aggiungi</button></form>
</div>
<details class="card"{' open' if n_locali else ''}><summary>Voci dello studio
<span class="muted">{n_locali} — {'le tue correzioni' if n_locali else 'quelle che aggiungi compaiono qui'}</span></summary>
<table>{righe_locali or '<tr><td class="muted">nessuna per ora</td></tr>'}</table></details>
<details class="card"><summary>Voci di base del progetto
<span class="muted">{n_repo} voci · clicca per vederle · a parità vince lo studio</span></summary>
<table>{righe_repo}</table></details>"""


def pagina_unica(msg: str = "", err: str = "") -> bytes:
    banner = (
        (f'<div class="errore-msg">{e(err)}</div>' if err else "")
        + (f'<div class="avviso">{e(msg)}</div>' if msg else "")
    )
    corpo = (
        banner + sez_drop() + sez_stats() + sez_bozze()
        + sez_errori() + sez_suggerimenti() + sez_dizionario() + sez_registro()
    )
    return f"""<!doctype html><html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pipeline referti</title><style>{STILE}</style></head>
<body><header><b>Pipeline referti</b>
<a href="#dizionario">Dizionario</a></header>
<main><h1>Referti dettati</h1>{corpo}
<p class="firma">Pannello locale · visibile solo da questo computer · la conferma dei referti si fa in ReferralFlow</p>
</main><script>{SCRIPT}</script></body></html>""".encode("utf-8")


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
            return self._rispondi(pagina_unica(prendi("msg"), prendi("err")))
        if url.path == "/audio":
            fid = prendi("id")
            if fid.isalnum() and (BASE / "archivio_temp").is_dir():
                audio = next((BASE / "archivio_temp").glob(fid + ".*"), None)
                if audio:
                    tipo = TIPI_AUDIO.get(audio.suffix.lower(), "application/octet-stream")
                    return self._rispondi(audio.read_bytes(), tipo)
            return self._rispondi(b"non trovato", "text/plain", 404)
        self._reindirizza("/")

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)

        if url.path == "/carica":
            q = urllib.parse.parse_qs(url.query)
            nome = os.path.basename((q.get("nome") or [""])[0]).strip()
            n = int(self.headers.get("Content-Length", 0))
            estensione = Path(nome).suffix.lower()
            if not nome or estensione not in TIPI_AUDIO or n <= 0 or n > MAX_CARICO_BYTE:
                return self._rispondi(b'{"errore":"file_non_valido"}', "application/json", 400)
            ingresso = BASE / "ingresso"
            ingresso.mkdir(parents=True, exist_ok=True)
            if (ingresso / nome).exists():
                nome = f"{int(time.time())}-{nome}"
            # Prima su file nascosto (il servizio ignora i nomi che iniziano
            # per punto), poi rinomina: mai un file letto a metà.
            parziale = ingresso / ("." + nome + ".part")
            rimasti = n
            with open(parziale, "wb") as f:
                while rimasti > 0:
                    blocco = self.rfile.read(min(65536, rimasti))
                    if not blocco:
                        break
                    f.write(blocco)
                    rimasti -= len(blocco)
            if rimasti != 0:
                parziale.unlink(missing_ok=True)
                return self._rispondi(b'{"errore":"caricamento_incompleto"}', "application/json", 400)
            parziale.replace(ingresso / nome)
            return self._rispondi(b'{"esito":"in_coda"}', "application/json", 201)

        n = int(self.headers.get("Content-Length", 0))
        dati = urllib.parse.parse_qs(self.rfile.read(n).decode("utf-8"))
        prendi = lambda k: (dati.get(k) or [""])[0].strip()

        if url.path == "/riprova":
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
                return self._reindirizza("/?msg=" + urllib.parse.quote("Rimesso in coda: riparte al prossimo giro del servizio.") + "#errori")
            return self._reindirizza("/")

        if url.path == "/dizionario/aggiungi":
            da, a, sezione = prendi("da"), prendi("a"), prendi("sezione")
            if sezione not in SEZIONI:
                sezione = "termini_clinici"
            if not da or not a:
                return self._reindirizza("/?err=" + urllib.parse.quote("Servono entrambe le caselle.") + "#dizionario")
            if any(c.isdigit() for c in da + a):
                return self._reindirizza("/?err=" + urllib.parse.quote("Le correzioni non possono contenere numeri: è una regola fissa del sistema.") + "#dizionario")
            if da.lower() == a.lower():
                return self._reindirizza("/?err=" + urllib.parse.quote("Le due voci sono uguali.") + "#dizionario")
            locali = leggi_json(LOCALI, {})
            locali.setdefault(sezione, {})[da.lower()] = a
            scrivi_locali(locali)
            return self._reindirizza("/?msg=" + urllib.parse.quote(f"Aggiunta: «{da}» → «{a}». Attiva dal prossimo giro.") + "#dizionario")

        if url.path == "/suggerimenti/aggiungi":
            da, a = prendi("da"), prendi("a")
            if not da or not a:
                return self._reindirizza("/#suggerimenti")
            if any(c.isdigit() for c in da + a) or da.lower() == a.lower():
                return self._reindirizza("/?err=" + urllib.parse.quote("Suggerimento non valido (numeri o voci uguali).") + "#suggerimenti")
            locali = leggi_json(LOCALI, {})
            locali.setdefault("termini_clinici", {})[da.lower()] = a
            scrivi_locali(locali)
            segna_applicato(da, a)
            return self._reindirizza("/?msg=" + urllib.parse.quote(f"Aggiunta: «{da}» → «{a}». Attiva dal prossimo giro.") + "#dizionario")

        if url.path == "/dizionario/rimuovi":
            da, sezione = prendi("da"), prendi("sezione")
            locali = leggi_json(LOCALI, {})
            if sezione in SEZIONI and da in (locali.get(sezione) or {}):
                del locali[sezione][da]
                scrivi_locali(locali)
                return self._reindirizza("/?msg=" + urllib.parse.quote(f"Tolta: «{da}».") + "#dizionario")
            return self._reindirizza("/#dizionario")

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
