'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { query } from '@/lib/db';
import { getSession, hashPassword } from '@/lib/auth';

const MATCH_FIELDS = ['summary', 'description', 'location', 'organizer'];

// Crea o aggiorna un feed iCal. L'URL è un segreto: se lasciato vuoto in modifica, resta invariato.
// Agende esterne, medici e i loro accessi li gestiscono solo amministrazione e tecnico (13.10.2026, controllo di
// sicurezza: prima bastava essere entrati, e da qui chiunque poteva cambiare la password di un altro utente).
async function soloAmministrazione() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (session.role !== 'admin' && session.role !== 'tecnico') redirect('/');
  return session;
}

export async function saveFeed(formData: FormData) {
  const session = await soloAmministrazione();

  const id = String(formData.get('id') || '');
  const nome = String(formData.get('nome') || '').trim();
  const url = String(formData.get('url') || '').trim();
  let matchField = String(formData.get('match_field') || 'summary');
  if (!MATCH_FIELDS.includes(matchField)) matchField = 'summary';
  if (!nome) redirect('/programma/feed');

  if (id) {
    if (url) {
      await query(
        'update agenda_feeds set nome = $1, url = $2, match_field = $3 where id = $4 and studio_id = $5',
        [nome, url, matchField, id, session.studioId]
      );
    } else {
      await query(
        'update agenda_feeds set nome = $1, match_field = $2 where id = $3 and studio_id = $4',
        [nome, matchField, id, session.studioId]
      );
    }
  } else if (url) {
    await query(
      'insert into agenda_feeds (studio_id, nome, url, match_field) values ($1, $2, $3, $4)',
      [session.studioId, nome, url, matchField]
    );
  }
  revalidatePath('/programma/feed');
  revalidatePath('/programma');
}

export async function deleteFeed(formData: FormData) {
  const session = await soloAmministrazione();

  const id = String(formData.get('id') || '');
  if (id) {
    await query('delete from agenda_feeds where id = $1 and studio_id = $2', [id, session.studioId]);
  }
  revalidatePath('/programma/feed');
  revalidatePath('/programma');
}

// Crea o aggiorna un medico interno con i suoi alias (separati da virgola)
// e, se indicata, l'email di accesso (crea/collega un utente con ruolo medico).
export async function saveProvider(formData: FormData) {
  const session = await soloAmministrazione();

  const id = String(formData.get('id') || '');
  const nome = String(formData.get('nome') || '').trim();
  const aliases = String(formData.get('aliases') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const loginEmail = String(formData.get('login_email') || '').trim().toLowerCase();
  const loginPassword = String(formData.get('login_password') || '');
  if (!nome) redirect('/programma/feed');

  let providerId = id;
  if (id) {
    await query(
      'update providers set nome = $1, aliases = $2 where id = $3 and studio_id = $4',
      [nome, aliases, id, session.studioId]
    );
  } else {
    const [row] = await query<{ id: string }>(
      'insert into providers (studio_id, nome, aliases) values ($1, $2, $3) returning id',
      [session.studioId, nome, aliases]
    );
    providerId = row.id;
  }

  if (!loginEmail) {
    // Campo vuoto: scollega l'eventuale account.
    await query(
      'update providers set user_id = null where id = $1 and studio_id = $2',
      [providerId, session.studioId]
    );
  } else {
    // Si può collegare solo un utente dello stesso studio.
    let [user] = await query<{ id: string; role: string }>(
      'select id, role from users where email = $1 and studio_id = $2',
      [loginEmail, session.studioId]
    );
    if (!user && loginPassword) {
      [user] = await query<{ id: string; role: string }>(
        `insert into users (studio_id, email, password_hash, role)
         values ($1, $2, $3, 'medico'::user_role)
         returning id, role`,
        [session.studioId, loginEmail, await hashPassword(loginPassword)]
      );
    }
    // La password di un utente che esiste già NON si cambia da qui: si fa in Impostazioni → Utenti.
    if (user) {
      await query(
        'update providers set user_id = $1 where id = $2 and studio_id = $3',
        [user.id, providerId, session.studioId]
      );
    }
  }

  revalidatePath('/programma/feed');
  revalidatePath('/programma');
}

export async function toggleProvider(formData: FormData) {
  const session = await soloAmministrazione();

  const id = String(formData.get('id') || '');
  if (id) {
    await query(
      'update providers set attivo = not attivo where id = $1 and studio_id = $2',
      [id, session.studioId]
    );
  }
  revalidatePath('/programma/feed');
  revalidatePath('/programma');
}
