"""Fase 8 — salvataggio della bozza in ReferralFlow (SPEC §3 [11]).

La SPEC §2.1 ammette come unica connessione di rete quella verso il
PostgreSQL di ReferralFlow: il salvataggio è quindi un INSERT diretto
nella tabella referti_vocali_bozze (migrazione 019), sempre come bozza
da confermare (SPEC §2.5) — mai scritture su record definitivi.

L'INSERT è idempotente su (studio_id, file_id): il ciclo di riprova
non può creare doppioni."""

import json

from .config import DATABASE_URL, STUDIO_SLUG
from .errori import ErroreFase


def salva(payload):
    """Inserisce la bozza. Solleva ErroreFase se il DB non è raggiungibile:
    il chiamante lascia il JSON in output/ e NON cancella l'audio."""
    if not DATABASE_URL:
        raise ErroreFase("salvataggio", "DATABASE_URL non configurato")
    try:
        import psycopg
    except ImportError:
        raise ErroreFase("salvataggio", "psycopg non installato")
    try:
        with psycopg.connect(DATABASE_URL, connect_timeout=10) as conn:
            with conn.cursor() as cur:
                cur.execute("select id from studios where slug = %s", (STUDIO_SLUG,))
                riga = cur.fetchone()
                if riga is None:
                    raise ErroreFase("salvataggio", "studio non trovato per lo slug configurato")
                cur.execute(
                    """
                    insert into referti_vocali_bozze (studio_id, file_id, payload)
                    values (%s, %s, %s)
                    on conflict (studio_id, file_id) do nothing
                    """,
                    (riga[0], payload["file_id"], json.dumps(payload, ensure_ascii=False)),
                )
    except ErroreFase:
        raise
    except Exception as exc:  # errori di rete/DB: solo la classe, mai il testo
        raise ErroreFase("salvataggio", f"database non raggiungibile ({type(exc).__name__})")
