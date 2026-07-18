'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CopyLink } from './CopyLink';
import { rotateToken } from './actions';

export type Doc = {
  id: string;
  nome: string;
  studio: string | null;
  specialita: string | null;
  token: string;
  token_expires_at: string;
  scaduto: boolean;
  n_referral: number;
  inviante_user_id: string | null;
  ha_foto: boolean;
};

const TITOLI = new Set(['dr', 'dr.', 'dott', 'dott.', 'dott.ssa', 'dssa', 'dr.ssa', 'prof', 'prof.', 'sig', 'sig.']);

function iniziali(nome: string): string {
  const parti = nome
    .split(/\s+/)
    .filter((p) => p && !TITOLI.has(p.toLowerCase()));
  const scelte = parti.slice(0, 2).map((p) => p[0]).join('');
  return (scelte || nome.slice(0, 2)).toUpperCase();
}

function dataBreve(d: string): string {
  return new Date(d).toLocaleDateString('it-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

function Avatar({ m }: { m: Doc }) {
  if (m.ha_foto && m.inviante_user_id) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className="mavatar mavatar-img" src={`/api/inviante-avatar/${m.inviante_user_id}`} alt="" />
    );
  }
  if (m.inviante_user_id) {
    return <span className="mavatar mavatar-app">{iniziali(m.nome)}</span>;
  }
  return (
    <span className="mavatar mavatar-empty" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
        strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
    </span>
  );
}

export function MediciList({ medici }: { medici: Doc[] }) {
  const [q, setQ] = useState('');
  const [spec, setSpec] = useState<string | null>(null);

  const specialita = useMemo(
    () => Array.from(new Set(medici.map((m) => m.specialita).filter((s): s is string => !!s))).sort(),
    [medici]
  );

  const filtrati = useMemo(() => {
    const t = q.trim().toLowerCase();
    return medici.filter((m) => {
      if (spec && m.specialita !== spec) return false;
      if (t) {
        const testo = `${m.nome} ${m.specialita ?? ''} ${m.studio ?? ''}`.toLowerCase();
        if (!testo.includes(t)) return false;
      }
      return true;
    });
  }, [medici, q, spec]);

  return (
    <>
      <div className="msearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cerca per nome, specialità o studio"
          aria-label="Cerca un medico inviante"
        />
      </div>

      {specialita.length > 0 && (
        <div className="mchips">
          <button type="button" className={`mchip${spec === null ? ' active' : ''}`} onClick={() => setSpec(null)}>
            Tutti
          </button>
          {specialita.map((s) => (
            <button key={s} type="button" className={`mchip${spec === s ? ' active' : ''}`} onClick={() => setSpec(spec === s ? null : s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      <p className="mcount">{filtrati.length} {filtrati.length === 1 ? 'medico trovato' : 'medici trovati'}</p>

      {filtrati.length === 0 ? (
        <div className="empty">Nessun medico corrisponde alla ricerca.</div>
      ) : (
        <ul className="mlist">
          {filtrati.map((m) => (
            <li key={m.id} className="mcard card">
              <div className="mcard-head">
                <Avatar m={m} />
                <div className="mcard-info">
                  <Link href={`/medici/${m.id}`} className="mname">{m.nome}</Link>
                  <div className="mcard-sub">
                    {m.specialita ?? 'Medico inviante'}
                    {m.studio ? ` · ${m.studio}` : ''}
                  </div>
                  <div className="mcard-meta">
                    <span className="badge">{m.n_referral} referral</span>
                    {m.inviante_user_id ? (
                      <span className="badge badge-success">✓ su ReferralFlow</span>
                    ) : (
                      <span className="badge">solo contatto</span>
                    )}
                  </div>
                </div>
                <Link href={`/medici/${m.id}`} className="mcard-open" aria-label="Apri scheda medico">›</Link>
              </div>
              <div className="mrow-links">
                <CopyLink path={`/invia/${m.token}`} label="Copia link modulo d'invio" />
                <CopyLink path={`/portale/${m.token}`} label="Copia link portale" />
                <form action={rotateToken} className="rotate-form">
                  <input type="hidden" name="id" value={m.id} />
                  <button className="btn btn-ghost btn-small" type="submit"
                    title="I link attuali smettono di funzionare subito: andranno ricondivisi.">
                    Rigenera link
                  </button>
                  <span className={`tmeta${m.scaduto ? ' expired' : ''}`}>
                    {m.scaduto ? 'Link scaduti' : `Scadono il ${dataBreve(m.token_expires_at)}`}
                  </span>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
