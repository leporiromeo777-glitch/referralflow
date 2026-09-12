// ReferralFlow prototype — Menu personalizzabile
// Ogni utente decide, per il proprio ruolo, quali voci stanno "in vista" nella sidebar e quali nel
// cassetto estraibile "Altro". L'ordine è modificabile. Le voci disponibili restano quelle del ruolo
// (Permission Engine): qui si sceglie solo dove mostrarle. Preferenze in localStorage (in produzione: profilo utente).
const NAVC_KEY = 'rf-nav-prefs';
const NAVC = { prefs: JSON.parse(localStorage.getItem(NAVC_KEY) || '{}'), drawerOpen: sessionStorage.getItem('rf-nav-drawer') === '1', editing: false };
function navcSave() { localStorage.setItem(NAVC_KEY, JSON.stringify(NAVC.prefs)); }

/** Predefiniti per ruolo: cosa sta in vista e cosa nel cassetto (le altre voci del ruolo finiscono nel cassetto). */
const NAVC_DEFAULT_PINNED = {
  doctor: ['home', 'agenda', 'patients', 'visits', 'reports', 'dittafono'],
  secretary: ['home', 'agenda', 'inbox', 'patients', 'reports', 'communications'],
  assistant: ['home', 'agenda', 'patients', 'visits', 'documents', 'inbox'],
  org_admin: ['home', 'agenda', 'patients', 'reports', 'administration', 'statistics'],
  tech_admin: ['home', 'system', 'ai', 'inbox', 'statistics'],
};

/** Ritorna { pinned: [...], drawer: [...] } per il ruolo, rispettando l'elenco autorizzato NAV[role]. */
function navcItems(role) {
  const allowed = NAV[role] || [];
  const p = NAVC.prefs[role];
  let pinned = (p && Array.isArray(p.pinned) ? p.pinned : NAVC_DEFAULT_PINNED[role] || allowed).filter(k => allowed.includes(k));
  if (!pinned.includes('home')) pinned = ['home', ...pinned];
  const drawerPref = p && Array.isArray(p.drawer) ? p.drawer.filter(k => allowed.includes(k) && !pinned.includes(k)) : [];
  const rest = allowed.filter(k => !pinned.includes(k) && !drawerPref.includes(k));
  return { pinned, drawer: [...drawerPref, ...rest] };
}
function navcSet(role, pinned, drawer) { NAVC.prefs[role] = { pinned, drawer }; navcSave(); }
function navcReset(role) { delete NAVC.prefs[role]; navcSave(); }
function navcToggleDrawer(force) {
  NAVC.drawerOpen = typeof force === 'boolean' ? force : !NAVC.drawerOpen;
  sessionStorage.setItem('rf-nav-drawer', NAVC.drawerOpen ? '1' : '0');
  const d = document.getElementById('nav-drawer'), b = document.getElementById('nav-more');
  if (d) d.classList.toggle('open', NAVC.drawerOpen);
  if (b) { b.classList.toggle('open', NAVC.drawerOpen); b.setAttribute('aria-expanded', NAVC.drawerOpen ? 'true' : 'false'); }
}

/** Foglio "Personalizza menu": sposta tra In vista e Cassetto, riordina, ripristina. */
function navcOpenCustomize() {
  const role = state.role;
  const { pinned, drawer } = navcItems(role);
  const work = { pinned: pinned.slice(), drawer: drawer.slice() };
  const row = (k, list, i, len) => {
    const [label, icon] = NAV_META[k];
    const locked = k === 'home';
    return `<div class="navc-row" data-key="${k}">
      ${ICONS[icon]}<span class="grow">${label}${locked ? ' <span class="caption">(sempre in vista)</span>' : ''}</span>
      <button class="btn sm ghost" data-navc="up" data-list="${list}" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Sposta su">${ICONS.chevL}</button>
      <button class="btn sm ghost" data-navc="down" data-list="${list}" data-i="${i}" ${i === len - 1 ? 'disabled' : ''} title="Sposta giù">${ICONS.chevR}</button>
      ${locked ? '' : `<button class="btn sm" data-navc="${list === 'pinned' ? 'hide' : 'show'}" data-list="${list}" data-i="${i}">${list === 'pinned' ? 'Nel cassetto' : 'In vista'}</button>`}
    </div>`;
  };
  const paint = () => {
    const body = document.getElementById('navc-body'); if (!body) return;
    body.innerHTML = `
      <div class="section-title">In vista <span class="caption" style="text-transform:none;letter-spacing:0">· ${work.pinned.length} voci, sempre visibili</span></div>
      <div class="navc-list">${work.pinned.map((k, i) => row(k, 'pinned', i, work.pinned.length)).join('')}</div>
      <div class="section-title mt-16">Nel cassetto «Altro» <span class="caption" style="text-transform:none;letter-spacing:0">· ${work.drawer.length} voci, si aprono con un clic</span></div>
      <div class="navc-list">${work.drawer.length ? work.drawer.map((k, i) => row(k, 'drawer', i, work.drawer.length)).join('') : '<div class="caption" style="padding:8px 6px">Nessuna voce nel cassetto.</div>'}</div>
      <p class="caption mt-16">Le voci disponibili dipendono dal tuo ruolo e dalle funzioni attive nello studio: qui scegli solo dove vederle. Vale per questo ruolo, su tutti i tuoi dispositivi.</p>`;
    body.querySelectorAll('[data-navc]').forEach(b => b.onclick = () => {
      const list = work[b.dataset.list], i = +b.dataset.i, act = b.dataset.navc;
      if (act === 'up' && i > 0) [list[i - 1], list[i]] = [list[i], list[i - 1]];
      else if (act === 'down' && i < list.length - 1) [list[i + 1], list[i]] = [list[i], list[i + 1]];
      else if (act === 'hide') work.drawer.unshift(list.splice(i, 1)[0]);
      else if (act === 'show') work.pinned.push(list.splice(i, 1)[0]);
      paint();
    });
  };
  openSheet('Personalizza menu', `<div id="navc-body"></div>`,
    `<button class="btn ghost" id="navc-reset">Ripristina predefinito</button><span class="grow"></span><button class="btn" data-close id="navc-cancel">Annulla</button><button class="btn primary" id="navc-save">Salva</button>`);
  paint();
  document.getElementById('navc-save').onclick = () => { navcSet(role, work.pinned, work.drawer); closeSheet(); render(); toast('Menu aggiornato'); };
  document.getElementById('navc-cancel').onclick = closeSheet;
  document.getElementById('navc-reset').onclick = () => { navcReset(role); closeSheet(); render(); toast('Menu riportato al predefinito del ruolo'); };
}

/** HTML della navigazione principale: voci in vista + cassetto. `item(key)` è il renderer di app.js. */
function navcRender(item, badges) {
  const role = state.role;
  const { pinned, drawer } = navcItems(role);
  const activeInDrawer = drawer.some(k => state.route === k || (k === 'patients' && ['patient', 'visit'].includes(state.route)) || (k === 'reports' && state.route === 'report') || (k === 'inbox' && state.route === 'tasks') || (k === 'ai' && state.route === 'knowledge'));
  if (activeInDrawer && !NAVC.drawerOpen) { NAVC.drawerOpen = true; }
  const drawerBadges = drawer.reduce((n, k) => n + (badges[k] || 0), 0);
  const more = drawer.length ? `
    <button class="nav-item nav-more ${NAVC.drawerOpen ? 'open' : ''}" id="nav-more" aria-expanded="${NAVC.drawerOpen}" title="Altro">${ICONS.moreV}<span>Altro</span>${!NAVC.drawerOpen && drawerBadges ? `<span class="badge count">${drawerBadges}</span>` : ''}<span class="chev">${ICONS.chevD}</span></button>
    <div class="nav-drawer ${NAVC.drawerOpen ? 'open' : ''}" id="nav-drawer"><div class="nav-drawer-in">${drawer.map(item).join('')}
      <button class="nav-item nav-customize" id="nav-customize" title="Personalizza menu">${ICONS.settings}<span>Personalizza menu…</span></button></div></div>` :
    `<button class="nav-item nav-customize" id="nav-customize" title="Personalizza menu">${ICONS.moreV}<span>Personalizza menu…</span></button>`;
  return `<nav class="nav">${pinned.map(item).join('')}${more}</nav>`;
}
function navcBind(root) {
  const m = root.querySelector('#nav-more'); if (m) m.onclick = () => navcToggleDrawer();
  const c = root.querySelector('#nav-customize'); if (c) c.onclick = navcOpenCustomize;
}
