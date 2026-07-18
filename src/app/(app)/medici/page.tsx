import { redirect } from 'next/navigation';
import { query } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { PageHero } from '../PageHero';
import { MediciList, type Doc } from './MediciList';

export const dynamic = 'force-dynamic';

export default async function Medici() {
  const session = await getSession();
  if (!session) redirect('/login');

  // Ogni medico inviante dello studio. Se la sua email corrisponde a un utente
  // «inviante» registrato (ha l'app), portiamo su la specialità del suo profilo
  // e se ha caricato una foto — così la scheda mostra l'avatar vero.
  const medici = await query<Doc>(
    `select d.id, d.nome, d.studio, d.token, d.token_expires_at,
            (d.token_expires_at <= now()) as scaduto,
            count(r.id)::int as n_referral,
            u.id as inviante_user_id,
            ip.specialita as specialita,
            (ip.avatar_key is not null) as ha_foto
       from referring_doctors d
       left join referrals r on r.referring_doctor_id = d.id
       left join users u on lower(u.email) = lower(d.email) and u.role = 'inviante'
       left join inviante_profiles ip on ip.user_id = u.id
      where d.studio_id = $1
      group by d.id, u.id, ip.specialita, ip.avatar_key
      order by d.nome`,
    [session.studioId]
  );

  return (
    <>
      <PageHero zone="slate" eyebrow="Annuario invianti" title="Medici invianti">
        Condividi il link «Modulo d'invio» con il medico di base perché invii le referral;
        il link «Portale» gli mostra in tempo reale lo stato dei suoi invii. Chi si registra
        alla piattaforma compare con la sua foto e specialità.
      </PageHero>

      {medici.length === 0 ? (
        <div className="empty">
          Nessun medico inviante ancora. Si aggiungono quando un medico usa il vostro
          modulo pubblico, oppure creandoli a mano.
        </div>
      ) : (
        <MediciList medici={medici} />
      )}
    </>
  );
}
