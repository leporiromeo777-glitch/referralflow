import 'server-only';
import { createHash } from 'crypto';
import { query } from '../db';

// Registro dei prompt (§7): ogni prompt usato da una tappa AI è identificato
// da nome + impronta del testo. Quelli dell'app si registrano col testo
// intero; quelli della catena arrivano già come impronta (`versione_catena`).
export function improntaPrompt(testo: string): string {
  return createHash('sha256').update(testo).digest('hex');
}

export async function registraPrompt(nome: string, testo: string | null, hash?: string): Promise<{ id: number; version: string }> {
  const h = hash ?? improntaPrompt(testo ?? '');
  const version = h.slice(0, 12);
  const [r] = await query<{ id: number; version: string }>(
    `insert into audit.prompt_versions (name, version, content_hash, content)
       values ($1, $2, $3, $4)
       on conflict (name, content_hash) do update set name = excluded.name
       returning id, version`,
    [nome.slice(0, 80), version, h, testo]
  );
  return r;
}
