'use server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';

// Nota su un rilascio (§54): «nuovo whisper», «prompt correzione v8»…
export async function annotaRilascio(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId || session.role !== 'admin') redirect('/login');
  const id = Number(formData.get('id'));
  const nota = String(formData.get('nota') ?? '').trim().slice(0, 200);
  if (Number.isInteger(id) && id > 0) {
    await query('update audit.deployments set note = $3 where id = $1 and (studio_id = $2 or studio_id is null)', [id, session.studioId, nota || null]);
  }
  redirect('/referti/qualita/pipeline');
}

// Voce di dizionario proposta dalle correzioni umane (11.9.2026): l'admin
// la conferma (entra nel dizionario del medico via il servizio), la scarta
// (non viene più proposta) o la toglie. Mai cifre; solo coppie corte.
export async function decidiVoceDizionario(formData: FormData) {
  const session = await getSession();
  if (!session || !session.studioId || session.role !== 'admin') redirect('/login');
  const medico = String(formData.get('medico') ?? '').trim().toLowerCase();
  const da = String(formData.get('da') ?? '').trim().slice(0, 120);
  const a = String(formData.get('a') ?? '').trim().slice(0, 120);
  const azione = String(formData.get('azione') ?? '');
  const occorrenze = Math.max(0, Math.min(9999, Number(formData.get('occorrenze')) || 0));
  const valida = /^[a-z0-9-]{1,40}$/.test(medico) && da.length >= 3 && !/\d/.test(da + a)
    && da.split(/\s+/).length <= 4 && a.split(/\s+/).length <= 4 && da.toLowerCase() !== a.toLowerCase();
  if (valida && (azione === 'conferma' || azione === 'rifiuta') && a) {
    await query(
      `insert into referti_dizionario (studio_id, medico, da, a, stato, occorrenze, deciso_da)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (studio_id, medico, lower(da)) do update
         set a = excluded.a, stato = excluded.stato, occorrenze = excluded.occorrenze, deciso_da = excluded.deciso_da, deciso_at = now()`,
      [session.studioId, medico, da, a, azione === 'conferma' ? 'confermata' : 'rifiutata', occorrenze, session.id]
    );
  } else if (valida && azione === 'togli') {
    await query('delete from referti_dizionario where studio_id = $1 and medico = $2 and lower(da) = lower($3)', [session.studioId, medico, da]);
  }
  redirect('/referti/qualita/pipeline#dizionario');
}
