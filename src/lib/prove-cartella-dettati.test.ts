// Prove di «Collega la cartella dei dettati» (1.10.2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { indirizzoSmb, leggiCondivisioni, scriptWindows } from './cartella-dettati';

const USCITA = `
			List of Share Points
name:		Cartella pubblica
path:		/Users/prova/Public
	smb:	{
    		name:	Cartella pubblica
    		shared:	1
    		guest access:	1
    		read-only:	0
	}

name:		Audio da trascrivere
path:		/Users/prova/Desktop/Audio da trascrivere
	smb:	{
    		name:	Dettati studio
    		shared:	1
    		guest access:	0
    		read-only:	0
	}

name:		Spenta
path:		/Users/prova/Spenta
	smb:	{
    		name:	Spenta
    		shared:	0
	}
`;

test('condivisioni lette da sharing -l: nome SMB, percorso, ospite; le spente no', () => {
  const c = leggiCondivisioni(USCITA);
  assert.equal(c.length, 2);
  assert.deepEqual(c[1], { nome: 'Dettati studio', percorso: '/Users/prova/Desktop/Audio da trascrivere', ospite: false });
  assert.equal(c[0].ospite, true);
  assert.deepEqual(leggiCondivisioni(''), []);
});

test('indirizzo smb con gli spazi codificati', () => {
  assert.equal(indirizzoSmb('Mac-mini.local', 'Audio da trascrivere'), 'smb://Mac-mini.local/Audio%20da%20trascrivere');
});

test('script per Windows: CRLF, nome poi indirizzo, collegamento sulla Scrivania, niente credenziali', () => {
  const s = scriptWindows({ host: 'Mac-mini.local', ip: '192.168.1.185', nome: 'Audio da trascrivere' });
  assert.ok(s.includes('\r\n') && !/[^\r]\n/.test(s), 'righe CRLF');
  assert.ok(s.indexOf('\\\\Mac-mini.local\\Audio da trascrivere') < s.indexOf('\\\\192.168.1.185\\Audio da trascrivere'));
  assert.match(s, /CreateShortcut/);
  assert.match(s, /\/persistent:yes/);
  assert.doesNotMatch(s, /\/user:|password=/i);
  const senzaIp = scriptWindows({ host: 'Mac-mini.local', ip: null, nome: 'Audio da trascrivere' });
  assert.doesNotMatch(senzaIp, /192\.168/);
});

test('script per Windows: un nome con virgolette o comandi non esce dalle virgolette', () => {
  const s = scriptWindows({ host: 'Mac"&del *', ip: '1.2.3.4" & calc', nome: 'Audio"&format' });
  assert.doesNotMatch(s, /&del|& calc|&format/);
  assert.doesNotMatch(s, /Mac"/);
});
