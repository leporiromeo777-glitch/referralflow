// Con che cosa si entra (20.10.2026, richiesta dello studio: «poter scrivere solo un nome e non per forza l'e-mail»).
// Un accesso è un'e-mail come prima, oppure un NOME semplice: «moccetti», «Marco Moccetti» → «marco.moccetti». Il nome
// si scrive sempre allo stesso modo (minuscole, senza accenti, spazi e apostrofi diventano un punto), sia quando si crea
// l'accesso sia quando si entra: chi scrive «Marco Moccetti» o «marco.moccetti» entra nello stesso accesso. Nel database
// sta nella stessa colonna dell'e-mail (unica). Un accesso con il solo nome non riceve e-mail: la password la rimette
// l'amministrazione. PURO.
export function nomeAccesso(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase().slice(0, 160);
  if (!s) return null;
  if (s.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null;
  const nome = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s'’]+/g, '.').replace(/[^a-z0-9._-]/g, '').replace(/\.{2,}/g, '.').replace(/^[.\-_]+|[.\-_]+$/g, '');
  return nome.length >= 2 && nome.length <= 60 && /[a-z]/.test(nome) ? nome : null;
}
