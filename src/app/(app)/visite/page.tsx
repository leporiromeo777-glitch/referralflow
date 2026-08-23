import Link from 'next/link';
import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { dataOra } from '@/lib/format';
import { PageHero } from '../PageHero';
import { UploadDettato } from '../referti/UploadDettato';
import { ProgressoTrascrizione } from '../referti/ProgressoTrascrizione';

export const dynamic = 'force-dynamic';

// Visite registrate (base «ambient scribe» locale, 2026-08-24): la
// registrazione della visita — fatta SOLO col consenso esplicito del
// paziente — viene trascritta e riassunta in una nota di visita strutturata
// dal Mac dello studio, senza che l'audio esca mai. La revisione umana
// passa dalla stessa pagina di dettaglio dei referti.

export default async function Visite() {
  const session = await getSession();
  if (!session || !session.studioId) redirect('/login');

  const bozze = await query<{
    id: string; stato: string; created_at: string; reviewed_at: string | null;
    paziente: string | null; n_non_supportate: number;
  }>(
    `select id, stato, created_at::text, reviewed_at::text,
            payload -> 'campi_estratti' ->> 'nome_paziente' as paziente,
            coalesce(jsonb_array_length(payload -> 'frasi_non_supportate'), 0)::int as n_non_supportate
       from referti_bozze
      where studio_id = $1 and tipo = 'visita'
        and (stato = 'bozza' or reviewed_at > now() - interval '30 days')
      order by (stato = 'bozza') desc, created_at desc
      limit 200`,
    [session.studioId]
  );
  const daRivedere = bozze.filter((b) => b.stato === 'bozza');
  const gestite = bozze.filter((b) => b.stato !== 'bozza');

  const inLavorazione = await query<{
    id: string; filename: string; stato: string; tipo: string; fase: string | null;
    fase_at: string | null; created_at: string; bozza_id: string | null;
  }>(
    `select id, filename, stato, tipo, fase, fase_at::text, created_at::text, bozza_id
       from referti_audio
      where studio_id = $1 and tipo = 'visita'
        and (stato in ('in_coda', 'elaborazione')
             or (stato = 'errore' and updated_at > now() - interval '10 minutes'))
      order by created_at asc
      limit 50`,
    [session.studioId]
  );

  return (
    <>
      <PageHero zone="blue" eyebrow="In prova" title="Visite registrate">
        Carica la registrazione della visita: il Mac dello studio la trascrive
        e propone una nota di visita strutturata, da rivedere e confermare.
        L&apos;audio non lascia mai lo studio.
      </PageHero>

      <div className="card consenso-box">
        <h2>Prima di registrare: il consenso</h2>
        <p>
          Registrare una conversazione senza il consenso di chi parla è un
          reato (art. 179ter CP). Registra la visita <strong>solo</strong> dopo
          aver informato il paziente e ottenuto il suo consenso esplicito —
          idealmente annotato nel modulo d&apos;ingresso. L&apos;elaborazione
          avviene interamente sul Mac dello studio.
        </p>
      </div>

      <UploadDettato tipo="visita" />

      <ProgressoTrascrizione iniziali={inLavorazione} tipo="visita" />

      <div className="card">
        <h2>Note di visita da rivedere {daRivedere.length > 0 ? `(${daRivedere.length})` : ''}</h2>
        {daRivedere.length === 0 ? (
          <p className="muted">Nessuna nota in attesa: carica una registrazione qui sopra.</p>
        ) : (
          <ul className="lista-righe">
            {daRivedere.map((b) => (
              <li key={b.id}>
                <Link href={`/referti/${b.id}`}>
                  {b.paziente && b.paziente !== 'non indicato' ? b.paziente : 'Paziente da identificare'}
                </Link>{' '}
                <span className="tmeta">· ricevuta {dataOra(b.created_at)}</span>
                {b.n_non_supportate > 0 && (
                  <span className="badge badge-warn" style={{ marginLeft: 8 }}>
                    {b.n_non_supportate} frasi da verificare
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {gestite.length > 0 && (
        <div className="card">
          <h2>Gestite di recente</h2>
          <ul className="lista-righe">
            {gestite.map((b) => (
              <li key={b.id}>
                <Link href={`/referti/${b.id}`}>
                  {b.paziente && b.paziente !== 'non indicato' ? b.paziente : 'Visita'}
                </Link>{' '}
                <span className="tmeta">
                  · {b.stato === 'confermata' ? 'confermata' : 'scartata'}{' '}
                  {b.reviewed_at ? dataOra(b.reviewed_at) : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
