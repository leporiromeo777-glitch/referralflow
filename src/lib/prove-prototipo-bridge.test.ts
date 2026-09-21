import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Il ponte del prototipo era un file solo di quasi settemila righe; dal
// 21.9.2026 sta in public/prototipo/bridge/NN-nome.js, caricato nell'ordine
// di index.html. Sono script classici: condividono lo spazio globale, ma NON
// l'hoisting — una funzione dichiarata nel file 08 non esiste ancora mentre
// si carica il file 03. Queste prove tengono la cosa al sicuro:
//  1. index.html elenca tutte le parti, nell'ordine dei numeri, con la stessa versione;
//  2. ogni parte si legge da sola;
//  3. il codice che gira AL CARICAMENTO di una parte non usa nomi dichiarati
//     in una parte successiva (dentro le funzioni si può: girano dopo).
const DIR = path.join(process.cwd(), 'public', 'prototipo');
const parti = readdirSync(path.join(DIR, 'bridge')).filter((f) => f.endsWith('.js')).sort();
const html = readFileSync(path.join(DIR, 'index.html'), 'utf-8');
const sorgenti = parti.map((f) => ({ nome: f, sf: ts.createSourceFile(f, readFileSync(path.join(DIR, 'bridge', f), 'utf-8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS) }));

test('bridge: index.html carica tutte le parti, in ordine, con la stessa versione, dopo i moduli MSE', () => {
  const trovate = [...html.matchAll(/<script src="bridge\/([^"?]+)\?v=(\d+)"><\/script>/g)].map((m) => ({ nome: m[1], v: m[2] }));
  assert.deepEqual(trovate.map((t) => t.nome), parti, 'le parti in index.html devono essere quelle della cartella, nello stesso ordine');
  assert.equal(new Set(trovate.map((t) => t.v)).size, 1, 'una sola versione per tutte le parti');
  assert.ok(!/referralflow-bridge\.js/.test(html), 'il file unico non si carica più');
  assert.ok(html.indexOf('mse/serie.js') < html.indexOf(`bridge/${parti[0]}`), 'i moduli MSE prima del ponte');
  assert.ok(parti.length >= 10);
});

test('bridge: ogni parte si legge da sola', () => {
  for (const { nome, sf } of sorgenti) assert.equal(((sf as any).parseDiagnostics ?? []).length, 0, nome);
});

// I nomi dichiarati al primo livello di una parte.
function dichiarati(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name) out.add(st.name.text);
    if (ts.isClassDeclaration(st) && st.name) out.add(st.name.text);
    if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) out.add(d.name.text);
  }
  return out;
}
// Gli identificatori letti dal codice che gira al caricamento: si entra nelle
// funzioni solo se sono invocate subito (IIFE); i nomi locali di una IIFE
// non contano.
function usatiAlCaricamento(sf: ts.SourceFile): Map<string, number> {
  const usati = new Map<string, number>();
  const visita = (n: ts.Node, locali: Set<string>) => {
    if (ts.isFunctionDeclaration(n)) return;
    if (ts.isFunctionExpression(n) || ts.isArrowFunction(n) || ts.isMethodDeclaration(n) || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)) {
      let p: ts.Node = n.parent;
      while (ts.isParenthesizedExpression(p)) p = p.parent;
      const subito = ts.isCallExpression(p) && (p.expression === n || (ts.isParenthesizedExpression(p.expression) && p.expression.expression === n));
      if (!subito) return;
      const miei = new Set(locali);
      n.parameters.forEach((q) => { if (ts.isIdentifier(q.name)) miei.add(q.name.text); });
      const raccogli = (m: ts.Node) => {
        if (ts.isVariableDeclaration(m) && ts.isIdentifier(m.name)) miei.add(m.name.text);
        if (ts.isFunctionDeclaration(m) && m.name) { miei.add(m.name.text); return; }
        if (ts.isFunctionExpression(m) || ts.isArrowFunction(m)) return;
        ts.forEachChild(m, raccogli);
      };
      if (n.body) raccogli(n.body);
      if (n.body) ts.forEachChild(n.body, (c) => visita(c, miei));
      return;
    }
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const eNome = (ts.isPropertyAccessExpression(p) && p.name === n) || (ts.isPropertyAssignment(p) && p.name === n) || (ts.isVariableDeclaration(p) && p.name === n)
        || (ts.isBindingElement(p) && (p.name === n || p.propertyName === n)) || (ts.isShorthandPropertyAssignment(p) && false) || ts.isLabeledStatement(p);
      if (!eNome && !locali.has(n.text) && !usati.has(n.text)) usati.set(n.text, sf.getLineAndCharacterOfPosition(n.getStart()).line + 1);
      return;
    }
    ts.forEachChild(n, (c) => visita(c, locali));
  };
  for (const st of sf.statements) visita(st, new Set());
  return usati;
}

test('bridge: nessuna parte usa, mentre si carica, un nome dichiarato in una parte successiva', () => {
  const dich = sorgenti.map((s) => dichiarati(s.sf));
  const problemi: string[] = [];
  sorgenti.forEach((s, k) => {
    const usati = usatiAlCaricamento(s.sf);
    for (const [nome, riga] of usati) {
      for (let j = k + 1; j < sorgenti.length; j++) if (dich[j].has(nome) && !dich[k].has(nome)) problemi.push(`${s.nome}:${riga} usa «${nome}», dichiarato in ${sorgenti[j].nome}`);
    }
  });
  assert.deepEqual(problemi, []);
});

test('bridge: nessun nome di primo livello dichiarato con const/let in due parti diverse (sarebbe un errore al caricamento)', () => {
  const visti = new Map<string, string>(); const doppi: string[] = [];
  for (const { nome, sf } of sorgenti) for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !(st.declarationList.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let))) continue;
    for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) { if (visti.has(d.name.text)) doppi.push(`${d.name.text}: ${visti.get(d.name.text)} e ${nome}`); else visti.set(d.name.text, nome); }
  }
  assert.deepEqual(doppi, []);
});

test('bridge: la prova stessa sa riconoscere un riferimento in avanti (caso finto)', () => {
  const f = (nome: string, codice: string) => ts.createSourceFile(nome, codice, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  // al caricamento: una chiamata diretta, un valore dentro un oggetto, una IIFE; NON al caricamento: il corpo di una funzione e di un gestore
  const a = f('a.js', `const TABELLA = { voce: rfDopo }; rfSubito(); (function () { const locale = 1; rfInIife(locale); })(); function poi() { rfTardi(); } window.addEventListener('x', () => rfGestore());`);
  const u = usatiAlCaricamento(a);
  assert.ok(u.has('rfDopo') && u.has('rfSubito') && u.has('rfInIife'), 'ciò che gira al caricamento si vede');
  assert.ok(!u.has('rfTardi') && !u.has('rfGestore') && !u.has('locale'), 'ciò che gira dopo, e i nomi locali, no');
  const b = f('b.js', `function rfDopo() {} const rfSubito = () => 1;`);
  assert.deepEqual([...dichiarati(b)].sort(), ['rfDopo', 'rfSubito']);
});
