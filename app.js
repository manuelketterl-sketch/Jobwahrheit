// ════════════════════════════════════════
// HINWEISLEISTE – zeigt Meldungen im Seitenstil statt Browser-Alerts
// hinweis('Text')            → neutral
// hinweis('Text', 'fehler')  → rot
// hinweis('Text', 'erfolg')  → grün
// ════════════════════════════════════════
let hinweisTimer = null;
function hinweis(text, art, dauer) {
  const el = document.getElementById('hinweis-leiste');
  const t = document.getElementById('hinweis-text');
  if (!el || !t) { alert(text); return; }
  clearTimeout(hinweisTimer);
  t.textContent = text;
  el.className = 'hinweis-leiste sichtbar' + (art ? ' ' + art : '');
  hinweisTimer = setTimeout(hinweisSchliessen, dauer || (art === 'fehler' ? 5500 : 3800));
}
function hinweisSchliessen() {
  const el = document.getElementById('hinweis-leiste');
  if (el) el.classList.remove('sichtbar');
}

// ════════════════════════════════════════
// SUPABASE – Datenbank
// ════════════════════════════════════════
const SUPABASE_URL = 'https://kvqdgcixmdnrarlaskyb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cWRnY2l4bWRucmFybGFza3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NzUwMTQsImV4cCI6MjA5MTU1MTAxNH0.ngU8OG7cFC7ZWRrt0ZxlUBDIbtv-cEa-rFJbjZII2wk';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ════════════════════════════════════════
// BEWERTUNGEN LADEN
// ════════════════════════════════════════
async function loadBewertungen(berufName) {
  const container = document.getElementById('bewertungen-liste');
  const counter = document.getElementById('bewertungen-count');
  if (!container) return;

  container.innerHTML = `<div style="color:var(--muted);font-size:.9rem;padding:1rem 0">Lade Bewertungen…</div>`;

  const { data, error } = await sb
    .from('bewertungen')
    .select('*')
    .ilike('beruf_name', berufName)
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:3rem 1rem;border:1px dashed var(--border);border-radius:12px">
        <div style="font-size:2rem;margin-bottom:.75rem">✍️</div>
        <div style="font-weight:600;margin-bottom:.4rem">Noch keine Bewertungen</div>
        <div style="font-size:.85rem;color:var(--muted);margin-bottom:1rem">Schreib die erste Bewertung für diesen Beruf.</div>
        <button onclick="showPage('bewerten')" style="background:var(--ink);color:#fff;border:none;padding:.6rem 1.4rem;border-radius:8px;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;cursor:pointer">Jetzt bewerten</button>
      </div>`;
    if (counter) counter.textContent = '(0)';
    resetStatistiken();
    return;
  }

  if (counter) counter.textContent = `(${data.length})`;
  updateStatistiken(data);
  container.innerHTML = data.map(b => renderBewertung(b)).join('');
}

// ════════════════════════════════════════
// STATISTIKEN – nur echte Werte, keine Platzhalter
// ════════════════════════════════════════
function setText(id, wert) {
  const el = document.getElementById(id);
  if (el) el.textContent = wert;
}

function resetStatistiken() {
  // Kennzahlen-Zeile ausblenden, Hinweis zeigen
  const row = document.getElementById('score-row');
  const leer = document.getElementById('score-leer');
  if (row) row.style.display = 'none';
  if (leer) leer.style.display = 'block';

  ['score-gesamt','score-empfehlung','score-erwartung','score-gehalt'].forEach(id => setText(id, '–'));
  ['val-erwartung','val-gesamt','val-empfehlung'].forEach(id => setText(id, '–'));
  ['bar-erwartung','bar-gesamt','bar-empfehlung'].forEach(id => {
    const el = document.getElementById(id); if (el) el.style.width = '0%';
  });
  setText('gehalt-min','–'); setText('gehalt-median','–'); setText('gehalt-max','–');
  setText('gehalt-basis','Noch keine Gehaltsangaben.');
  const gw = document.getElementById('gehalt-widget'); if (gw) gw.style.display = 'none';
  const sc = document.getElementById('skill-cloud');
  if (sc) sc.innerHTML = '<span style="font-size:.88rem;color:var(--muted)">Noch keine Angaben.</span>';
}

function updateStatistiken(data) {
  const n = data.length;

  // Kennzahlen-Zeile einblenden, Hinweis ausblenden
  const row = document.getElementById('score-row');
  const leer = document.getElementById('score-leer');
  if (row) row.style.display = 'flex';
  if (leer) leer.style.display = 'none';

  // ── Gesamtbewertung ──
  const avgGesamt = data.reduce((s,b) => s + (b.bewertung_gesamt||0), 0) / n;
  setText('score-gesamt', avgGesamt.toFixed(1));
  setText('val-gesamt', avgGesamt.toFixed(1));
  const bg = document.getElementById('bar-gesamt');
  if (bg) bg.style.width = (avgGesamt / 5 * 100) + '%';

  // ── Weiterempfehlung ──
  const empfRate = Math.round(data.filter(b => b.weiterempfehlung).length / n * 100);
  setText('score-empfehlung', empfRate + '%');
  setText('val-empfehlung', empfRate + '%');
  const be = document.getElementById('bar-empfehlung');
  if (be) be.style.width = empfRate + '%';

  // ── Erwartung (nur Bewertungen die das angegeben haben) ──
  const mitErwartung = data.filter(b => b.bewertung_erwartung > 0);
  if (mitErwartung.length) {
    const avgErw = mitErwartung.reduce((s,b) => s + b.bewertung_erwartung, 0) / mitErwartung.length;
    setText('score-erwartung', avgErw.toFixed(1));
    setText('val-erwartung', avgErw.toFixed(1));
    const bar = document.getElementById('bar-erwartung');
    if (bar) bar.style.width = (avgErw / 5 * 100) + '%';
  } else {
    setText('score-erwartung', '–');
    setText('val-erwartung', '–');
    const bar = document.getElementById('bar-erwartung');
    if (bar) bar.style.width = '0%';
  }

  // ── Gehalt ──
  const gehaelter = data.filter(b => b.gehalt_brutto > 0).map(b => b.gehalt_brutto).sort((a,b) => a-b);
  const gw = document.getElementById('gehalt-widget');
  if (gehaelter.length) {
    const min = gehaelter[0];
    const max = gehaelter[gehaelter.length - 1];
    const mid = Math.floor(gehaelter.length / 2);
    const median = gehaelter.length % 2 ? gehaelter[mid] : Math.round((gehaelter[mid-1] + gehaelter[mid]) / 2);
    const fmt = v => v.toLocaleString('de') + ' €';

    setText('score-gehalt', median.toLocaleString('de') + '€');
    setText('gehalt-min', fmt(min));
    setText('gehalt-median', fmt(median));
    setText('gehalt-max', fmt(max));
    setText('gehalt-basis', `Basierend auf ${gehaelter.length} anonyme${gehaelter.length === 1 ? 'r Angabe' : 'n Angaben'}`);

    // Sidebar-Widget
    setText('w-gehalt-min', fmt(min));
    setText('w-gehalt-max', fmt(max));
    setText('w-gehalt-median', fmt(median));
    const fill = document.getElementById('w-gehalt-fill');
    if (fill) {
      const spanne = max - min;
      const pos = spanne > 0 ? ((median - min) / spanne) * 100 : 50;
      fill.style.left = Math.max(0, pos - 15) + '%';
      fill.style.width = '30%';
    }
    if (gw) gw.style.display = 'block';
  } else {
    setText('score-gehalt', '–');
    setText('gehalt-min','–'); setText('gehalt-median','–'); setText('gehalt-max','–');
    setText('gehalt-basis', 'Noch keine Gehaltsangaben.');
    if (gw) gw.style.display = 'none';
  }

  // ── Skills-Wolke: Häufigkeit bestimmt Größe ──
  const sc = document.getElementById('skill-cloud');
  if (sc) {
    const zaehler = {};
    data.forEach(b => (b.skills || []).forEach(s => { zaehler[s] = (zaehler[s] || 0) + 1; }));
    const sortiert = Object.entries(zaehler).sort((a,b) => b[1] - a[1]).slice(0, 20);

    if (!sortiert.length) {
      sc.innerHTML = '<span style="font-size:.88rem;color:var(--muted)">Noch keine Angaben.</span>';
    } else {
      const maxAnzahl = sortiert[0][1];
      sc.innerHTML = sortiert.map(([skill, anzahl]) => {
        const anteil = anzahl / maxAnzahl;
        const klasse = anteil > 0.66 ? 'big' : anteil > 0.33 ? 'med' : '';
        return `<span class="skill-bubble ${klasse}" title="${anzahl}× genannt">${escHtml(skill)}</span>`;
      }).join('');
    }
  }
}

function renderBewertung(b) {
  const stars = '★'.repeat(b.bewertung_gesamt || 0) + '☆'.repeat(5 - (b.bewertung_gesamt || 0));
  const tags = (b.skills || []).map(s => `<span class="rc-tag">${escHtml(s)}</span>`).join('');
  const datum = new Date(b.created_at).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
  const empf = b.weiterempfehlung ? 'Empfohlen' : 'Nicht empfohlen';

  return `
    <div class="review-card fade-in">
      <div class="rc-top">
        <div>
          <div class="rc-stars">${stars}</div>
          <div class="rc-title">${escHtml(b.freitext || 'Bewertung')}</div>
        </div>
        <div class="rc-meta">${escHtml(b.anon_name || 'Anonym')}<br>${escHtml(b.berufsjahre || '')}<br>${datum}</div>
      </div>
      ${b.was_erwartet ? `<div class="rc-body"><strong>Erwartet:</strong> ${escHtml(b.was_erwartet)}</div>` : ''}
      ${b.alltag_vs_stelle ? `<div class="rc-body"><strong>Realität:</strong> ${escHtml(b.alltag_vs_stelle)}</div>` : ''}
      ${tags ? `<div class="rc-tags">${tags}</div>` : ''}
      <div class="rc-footer">
        <span>${b.gehalt_brutto ? `Bruttogehalt: <strong>${b.gehalt_brutto.toLocaleString('de')} €</strong>` : ''} ${b.region ? '· ' + escHtml(b.region) : ''} · ${empf}</span>
        <div style="display:flex;gap:1rem;align-items:center">
          <button class="rc-helpful" onclick="markHilfreich('${b.id}', this)">👍 ${b.hilfreich || 0} Hilfreich</button>
          <span class="rc-flag" title="Melden" onclick="meldenBewertung('${b.id}')">⚑</span>
        </div>
      </div>
    </div>`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ════════════════════════════════════════
// BEWERTUNG SPEICHERN
// ════════════════════════════════════════
// ════════════════════════════════════════
// SICHERES SCHREIBEN über Edge Function
// (Rate Limiting + Validierung serverseitig)
// ════════════════════════════════════════
const SUBMIT_URL = SUPABASE_URL + '/functions/v1/submit';

async function secureSubmit(action, data) {
  try {
    const res = await fetch(SUBMIT_URL, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action,
        data,
        website: document.getElementById('hp-website')?.value || '' // Honeypot
      })
    });
    return await res.json();
  } catch (err) {
    return { ok: false, error: 'Keine Verbindung. Bitte versuch es gleich nochmal.' };
  }
}

async function submitBewertung() {
  const berufName = document.getElementById('f-beruf')?.value?.trim();

  if (!berufName) {
    hinweis('Bitte trag einen Beruf ein.', 'fehler');
    document.getElementById('f-beruf')?.focus();
    return;
  }
  if (!formStars.overall) {
    hinweis('Bitte vergib eine Gesamtbewertung.', 'fehler');
    return;
  }

  // Skills aus allen vier Gruppen einsammeln
  const selectedSkills = [...document.querySelectorAll('#page-bewerten .skill-opt.sel')].map(s => s.textContent);
  const weiterempfehlung = document.querySelector('#f-empfehlung .toggle-opt.yes.sel') !== null;

  const payload = {
    beruf_name: berufName,
    berufsjahre: document.getElementById('f-jahre')?.value || null,
    region: document.getElementById('f-region')?.value || null,
    was_erwartet: document.getElementById('f-erwartet')?.value || null,
    bewertung_erwartung: formStars.expect || null,
    alltag_vs_stelle: document.getElementById('f-alltag')?.value || null,
    skills: selectedSkills.length ? selectedSkills : null,
    gehalt_brutto: parseInt(document.getElementById('f-gehalt')?.value) || null,
    bewertung_gesamt: formStars.overall,
    weiterempfehlung,
    freitext: document.getElementById('f-freitext')?.value || null,
    anon_name: generateAnonName(berufName)
  };

  const btn = document.querySelector('.btn-submit');
  btn.textContent = 'Wird gespeichert…';
  btn.disabled = true;

  const result = await secureSubmit('bewertung', payload);

  btn.textContent = 'Anonym einreichen →';
  btn.disabled = false;

  if (!result.ok) {
    hinweis(result.error || 'Das hat nicht geklappt. Bitte versuch es nochmal.', 'fehler');
    return;
  }

  // Berufsname ins Newsletter-Modal übernehmen
  document.querySelectorAll('.nl-beruf-name').forEach(el => el.textContent = berufName);
  window._nlBeruf = berufName;
  document.getElementById('modal').classList.add('open');
  document.body.style.overflow = 'hidden';

  formularZuruecksetzen();
}

// Leert das Bewertungsformular nach dem Absenden
function formularZuruecksetzen() {
  ['f-erwartet','f-alltag','f-freitext','f-gehalt'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.querySelectorAll('#page-bewerten .skill-opt.sel').forEach(el => el.classList.remove('sel'));
  document.querySelectorAll('#page-bewerten .stern').forEach(el => el.classList.remove('aktiv','vorschau','gerade'));
  document.querySelectorAll('#page-bewerten .toggle-opt.sel').forEach(el => el.classList.remove('sel'));
  document.querySelectorAll('#page-bewerten .sterne-text').forEach(el => { el.textContent = 'Tipp einen Stern an'; el.classList.remove('gesetzt'); });
  const z = document.getElementById('skill-zaehler'); if (z) z.innerHTML = '';
  formStars.expect = 0; formStars.overall = 0;
  fortschrittAktualisieren();
}

// ════════════════════════════════════════
// NEWSLETTER-ABO (optional, nach Bewertung)
// ════════════════════════════════════════
function closeModalToBeruf() {
  document.getElementById('modal').classList.remove('open');
  document.body.style.overflow = '';
  // Felder zurücksetzen
  const fb = document.getElementById('nl-feedback');
  if (fb) { fb.style.display = 'none'; }
  ['nl-bewertungen','nl-stellen'].forEach(id => { const el = document.getElementById(id); if (el) el.checked = false; });
  ['nl-email','nl-plz'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  toggleStellenFelder();
  // Zur Berufsseite zurück – ohne neuen Verlaufseintrag,
  // damit Zurück weiterhin zur Suche führt
  if (currentBeruf) {
    showPage('beruf', true);
  } else {
    showPage('home');
  }
}

// Blendet die Regionsfelder ein/aus je nach Stellen-Häkchen
function toggleStellenFelder() {
  const box = document.getElementById('nl-region-felder');
  const checked = document.getElementById('nl-stellen')?.checked;
  if (box) box.style.display = checked ? 'block' : 'none';
}

async function submitNewsletter() {
  const email = document.getElementById('nl-email')?.value?.trim();
  const aboBewertungen = document.getElementById('nl-bewertungen')?.checked || false;
  const aboStellen = document.getElementById('nl-stellen')?.checked || false;
  const plz = document.getElementById('nl-plz')?.value?.trim() || null;
  const umkreis = parseInt(document.getElementById('nl-umkreis')?.value) || 50;
  const fb = document.getElementById('nl-feedback');

  function feedback(msg, ok) {
    if (!fb) return;
    fb.textContent = msg;
    fb.style.color = ok ? 'var(--green)' : '#e8552d';
    fb.style.display = 'block';
  }

  if (!aboBewertungen && !aboStellen) {
    feedback('Bitte wähl mindestens eine Benachrichtigung aus.', false);
    return;
  }
  if (aboStellen && (!plz || !/^\d{5}$/.test(plz))) {
    feedback('Bitte gib eine gültige Postleitzahl ein (5 Ziffern).', false);
    document.getElementById('nl-plz')?.focus();
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    feedback('Bitte gib eine gültige E-Mail-Adresse ein.', false);
    return;
  }

  const btn = document.querySelector('#modal .modal-btn');
  if (btn) { btn.textContent = 'Wird gesendet…'; btn.disabled = true; }

  let result;
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/newsletter', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email.toLowerCase(),
        beruf_name: window._nlBeruf || 'Allgemein',
        abo_bewertungen: aboBewertungen,
        abo_stellen: aboStellen,
        plz: aboStellen ? plz : null,
        umkreis_km: aboStellen ? umkreis : null
      })
    });
    result = await res.json();
  } catch {
    result = { ok: false, error: 'Keine Verbindung. Bitte versuch es gleich nochmal.' };
  }

  if (btn) { btn.textContent = 'Abonnieren'; btn.disabled = false; }

  if (!result.ok) {
    feedback(result.error || 'Etwas ist schiefgelaufen.', false);
    return;
  }

  if (result.alreadyConfirmed) {
    feedback('Du bekommst für diesen Beruf schon Benachrichtigungen.', true);
    setTimeout(closeModalToBeruf, 2000);
    return;
  }

  feedback('Fast geschafft – bitte bestätige den Link in der Mail, die wir dir gerade geschickt haben.', true);
  setTimeout(closeModalToBeruf, 4000);
}

// ════════════════════════════════════════
// DISKUSSIONEN
// Anonymer Nickname wird einmalig generiert und
// im Browser gespeichert – kein Login nötig
// ════════════════════════════════════════
function getNickname(beruf) {
  let nick = localStorage.getItem('ji_nickname');
  if (!nick) {
    const wort = (beruf || 'Nutzer').split(/[\s\/–-]/)[0].replace(/[^a-zA-ZäöüÄÖÜ]/g,'') || 'Nutzer';
    nick = wort + '_' + (Math.floor(Math.random() * 900) + 100);
    localStorage.setItem('ji_nickname', nick);
  }
  return nick;
}

function zeitAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  const std = Math.floor(min / 60);
  if (std < 24) return `vor ${std} Std.`;
  const tage = Math.floor(std / 24);
  if (tage < 7) return `vor ${tage} Tag${tage > 1 ? 'en' : ''}`;
  const wochen = Math.floor(tage / 7);
  if (wochen < 5) return `vor ${wochen} Woche${wochen > 1 ? 'n' : ''}`;
  return new Date(dateStr).toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toggleNewDiscussion() {
  const form = document.getElementById('disc-form');
  if (!form) return;
  const offen = form.style.display !== 'none';
  form.style.display = offen ? 'none' : 'block';
  if (!offen) {
    document.getElementById('disc-nickname').textContent = getNickname(currentBeruf?.name);
    document.getElementById('disc-titel')?.focus();
  }
}

async function loadDiskussionen(berufName) {
  const liste = document.getElementById('disc-liste');
  if (!liste) return;
  liste.innerHTML = `<div style="color:var(--muted);font-size:.9rem;padding:1rem 0">Lade Diskussionen…</div>`;

  try {
    const { data: threads, error } = await sb
      .from('diskussionen')
      .select('id, created_at, titel, inhalt, anon_name, upvotes')
      .eq('beruf_name', berufName)
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    if (!threads || !threads.length) {
      liste.innerHTML = `<div style="border:2px dashed var(--border);border-radius:16px;padding:2rem;text-align:center">
        <div style="font-size:1.6rem;margin-bottom:.5rem">💬</div>
        <div style="font-weight:700;margin-bottom:.25rem">Noch keine Diskussionen</div>
        <div style="font-size:.85rem;color:var(--muted)">Stell die erste Frage zu diesem Beruf.</div>
      </div>`;
      return;
    }

    // Antwortanzahl pro Thread laden
    const ids = threads.map(t => t.id);
    const { data: antworten } = await sb
      .from('diskussion_antworten')
      .select('diskussion_id')
      .in('diskussion_id', ids);

    const counts = {};
    (antworten || []).forEach(a => { counts[a.diskussion_id] = (counts[a.diskussion_id] || 0) + 1; });

    liste.innerHTML = threads.map(t => `
      <div class="disc-thread fade-in" onclick="toggleThread('${t.id}')">
        <div class="dt-title">${escapeHtml(t.titel)}</div>
        ${t.inhalt ? `<div style="font-size:.85rem;color:var(--muted);margin:.4rem 0;line-height:1.5">${escapeHtml(t.inhalt)}</div>` : ''}
        <div class="dt-meta">
          <span>${counts[t.id] || 0} Antwort${(counts[t.id] || 0) === 1 ? '' : 'en'}</span>
          <span>${escapeHtml(t.anon_name || 'Anonym')}</span>
          <span>${zeitAgo(t.created_at)}</span>
        </div>
        <div id="thread-${t.id}" style="display:none;margin-top:1rem;padding-top:1rem;border-top:1px solid var(--border)" onclick="event.stopPropagation()"></div>
      </div>
    `).join('');
  } catch (err) {
    liste.innerHTML = `<div style="color:var(--muted);font-size:.9rem;padding:1rem 0">Die Diskussionen lassen sich gerade nicht laden.</div>`;
  }
}

async function submitDiskussion() {
  const titel = document.getElementById('disc-titel')?.value?.trim();
  const inhalt = document.getElementById('disc-inhalt')?.value?.trim();

  if (!titel) {
    hinweis('Bitte gib deiner Diskussion einen Titel.', 'fehler');
    return;
  }

  const result = await secureSubmit('diskussion', {
    beruf_name: currentBeruf?.name || 'Allgemein',
    titel,
    inhalt: inhalt || null,
    anon_name: getNickname(currentBeruf?.name)
  });

  if (!result.ok) {
    hinweis(result.error || 'Das hat nicht geklappt. Bitte versuch es nochmal.', 'fehler');
    return;
  }

  document.getElementById('disc-titel').value = '';
  document.getElementById('disc-inhalt').value = '';
  toggleNewDiscussion();
  loadDiskussionen(currentBeruf?.name);
}

// Thread aufklappen: Antworten + Antwortformular
async function toggleThread(id) {
  const box = document.getElementById('thread-' + id);
  if (!box) return;

  if (box.style.display !== 'none') {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  box.innerHTML = `<div style="color:var(--muted);font-size:.85rem">Lade Antworten…</div>`;

  const { data: antworten } = await sb
    .from('diskussion_antworten')
    .select('created_at, inhalt, anon_name')
    .eq('diskussion_id', id)
    .order('created_at', { ascending: true });

  const antwortenHtml = (antworten || []).map(a => `
    <div style="background:var(--bg-soft);border-radius:12px;padding:.8rem 1rem;margin-bottom:.6rem">
      <div style="font-size:.88rem;line-height:1.55">${escapeHtml(a.inhalt)}</div>
      <div style="font-size:.72rem;color:var(--muted);margin-top:.4rem">${escapeHtml(a.anon_name || 'Anonym')} · ${zeitAgo(a.created_at)}</div>
    </div>
  `).join('') || `<div style="font-size:.85rem;color:var(--muted);margin-bottom:.6rem">Noch keine Antworten – schreib die erste!</div>`;

  box.innerHTML = antwortenHtml + `
    <div style="display:flex;gap:.5rem;margin-top:.75rem">
      <input id="antwort-${id}" class="form-input" placeholder="Deine Antwort…" style="flex:1" onkeydown="if(event.key==='Enter')submitAntwort('${id}')">
      <button class="modal-btn" style="padding:.6rem 1.2rem;font-size:.85rem;flex-shrink:0" onclick="submitAntwort('${id}')">Senden</button>
    </div>`;
}

async function submitAntwort(diskussionId) {
  const input = document.getElementById('antwort-' + diskussionId);
  const inhalt = input?.value?.trim();
  if (!inhalt) return;

  const result = await secureSubmit('antwort', {
    diskussion_id: diskussionId,
    inhalt,
    anon_name: getNickname(currentBeruf?.name)
  });

  if (!result.ok) {
    hinweis(result.error || 'Das hat nicht geklappt. Bitte versuch es nochmal.', 'fehler');
    return;
  }

  // Thread neu laden (zu, dann wieder auf)
  const box = document.getElementById('thread-' + diskussionId);
  box.style.display = 'none';
  toggleThread(diskussionId);
}

function generateAnonName(beruf) {
  const wort = beruf.split(/[\s\/]/)[0].replace(/[^a-zA-ZäöüÄÖÜ]/g,'');
  const num = Math.floor(Math.random() * 900) + 100;
  return wort + '_' + num;
}

// ════════════════════════════════════════
// HILFREICH & MELDEN
// ════════════════════════════════════════
async function markHilfreich(id, btn) {
  const key = 'hilfreich_' + id;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');

  await sb.rpc('increment_hilfreich', { row_id: id });
  const current = parseInt(btn.textContent.match(/\d+/)?.[0] || 0);
  btn.textContent = `👍 ${current + 1} Hilfreich`;
}

async function meldenBewertung(id) {
  if (confirm('Diese Bewertung als unangemessen melden?')) {
    const result = await secureSubmit('meldung', { bewertung_id: id });
    hinweis(result.ok ? 'Danke, wir schauen uns die Bewertung an.' : (result.error || 'Das hat nicht geklappt.'), result.ok ? 'erfolg' : 'fehler');
  }
}

// ════════════════════════════════════════
// STELLENANGEBOTE (Jobbörse der Bundesagentur)
// ════════════════════════════════════════
let stellenGeladenFuer = null;

async function ladeStellen(force) {
  const liste = document.getElementById('stellen-liste');
  if (!liste || !currentBeruf) return;

  const plz = document.getElementById('job-plz')?.value?.trim() || '';
  const umkreis = parseInt(document.getElementById('job-umkreis')?.value) || 50;
  const schluessel = currentBeruf.name + '|' + plz + '|' + umkreis;

  // Nicht unnötig neu laden
  if (!force && stellenGeladenFuer === schluessel) return;
  stellenGeladenFuer = schluessel;

  if (plz && !/^\d{5}$/.test(plz)) {
    liste.innerHTML = `<div style="color:#e8552d;font-size:.88rem;padding:1rem 0">Bitte gib eine gültige 5-stellige Postleitzahl ein (oder lass das Feld leer).</div>`;
    return;
  }

  liste.innerHTML = `<div style="color:var(--muted);font-size:.9rem;padding:1rem 0"><span class="search-spinner"></span> Suche Stellenangebote…</div>`;

  // Eigene Anzeigen von Partnerfirmen zuerst laden
  let eigene = [];
  try {
    let q = sb.from('stellenanzeigen')
      .select('id, titel, beruf_name, plz, ort, beschaeftigungsart, gehalt_von, gehalt_bis, bewerbung_url, bewerbung_email, firma_id')
      .ilike('beruf_name', currentBeruf.name)
      .eq('freigegeben', true).eq('aktiv', true)
      .order('created_at', { ascending: false }).limit(5);
    const { data } = await q;
    eigene = data || [];
  } catch { /* nicht kritisch */ }

  let result;
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/jobs', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        beruf: currentBeruf.name,
        plz: plz || null,
        umkreis,
        size: 12
      })
    });
    result = await res.json();
  } catch {
    result = { ok: false, error: 'Netzwerkfehler' };
  }

  if (!result.ok) {
    liste.innerHTML = `<div style="border:2px dashed var(--border);border-radius:16px;padding:2rem;text-align:center">
      <div style="font-size:1.6rem;margin-bottom:.5rem">⚠️</div>
      <div style="font-weight:700;margin-bottom:.25rem">Die Stellen lassen sich gerade nicht laden</div>
      <div style="font-size:.85rem;color:var(--muted)">Bitte versuch es in ein paar Minuten nochmal.</div>
    </div>`;
    return;
  }

  // Eigene Anzeigen hervorgehoben darstellen
  const eigeneHtml = eigene.length ? eigene.map(s => {
    const ort = [s.plz, s.ort].filter(Boolean).join(' ');
    const gehalt = s.gehalt_von || s.gehalt_bis
      ? `💰 ${s.gehalt_von ? s.gehalt_von.toLocaleString('de') : '?'}–${s.gehalt_bis ? s.gehalt_bis.toLocaleString('de') : '?'} €` : null;
    const details = [ort ? '📍 ' + escHtml(ort) : null, s.beschaeftigungsart ? escHtml(s.beschaeftigungsart) : null, gehalt]
      .filter(Boolean).join(' · ');
    const ziel = s.bewerbung_url || (s.bewerbung_email ? 'mailto:' + s.bewerbung_email : null);
    return `<div class="stellenanzeige" style="border-color:var(--accent)"
      ${ziel ? `onclick="stelleGeklickt('${s.id}');window.open('${escHtml(ziel)}','_blank','noopener')"` : ''}>
      <div class="sa-badge">DIREKT</div>
      <div class="sa-title">${escHtml(s.titel)}</div>
      ${details ? `<div class="sa-detail">${details}</div>` : ''}
    </div>`;
  }).join('') : '';

  const stellen = result.stellen || [];
  if (!stellen.length && !eigene.length) {
    liste.innerHTML = `<div style="border:2px dashed var(--border);border-radius:16px;padding:2rem;text-align:center">
      <div style="font-size:1.6rem;margin-bottom:.5rem">🔎</div>
      <div style="font-weight:700;margin-bottom:.25rem">Keine passenden Stellen gefunden</div>
      <div style="font-size:.85rem;color:var(--muted)">${plz ? 'Vergrößer den Umkreis oder lass die PLZ weg.' : 'Für diesen Beruf gibt es gerade keine Ausschreibungen.'}</div>
    </div>`;
    return;
  }

  const kopf = `<div style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">${result.gesamt > stellen.length
    ? `${stellen.length} von ${result.gesamt.toLocaleString('de')} Angeboten`
    : `${stellen.length} Angebot${stellen.length === 1 ? '' : 'e'}`}${plz ? ` · im Umkreis von ${umkreis} km um ${escHtml(plz)}` : ' · bundesweit'}</div>`;

  liste.innerHTML = eigeneHtml + kopf + stellen.map(s => {
    const ort = [s.plz, s.ort].filter(Boolean).join(' ');
    const details = [
      ort ? '📍 ' + escHtml(ort) : null,
      s.entfernung != null ? `${s.entfernung} km entfernt` : null,
      s.eintrittsdatum ? 'ab ' + new Date(s.eintrittsdatum).toLocaleDateString('de-DE', { month: '2-digit', year: 'numeric' }) : null
    ].filter(Boolean).join(' · ');

    const neu = s.veroeffentlicht && (Date.now() - new Date(s.veroeffentlicht).getTime()) < 7 * 864e5;

    return `<div class="stellenanzeige" ${s.url ? `onclick="window.open('${s.url}','_blank','noopener')"` : ''}>
      ${neu ? '<div class="sa-badge">NEU</div>' : ''}
      ${s.arbeitgeber && s.arbeitgeber !== 'Arbeitgeber nicht genannt'
        ? `<div class="sa-company">${escHtml(s.arbeitgeber)}</div>` : ''}
      <div class="sa-title">${escHtml(s.titel)}</div>
      ${details ? `<div class="sa-detail">${details}</div>` : ''}
    </div>`;
  }).join('') + `<div style="font-size:.72rem;color:var(--muted);text-align:center;margin-top:1rem">Quelle: Jobbörse der Bundesagentur für Arbeit</div>`;
}

// Zählt Klicks auf eigene Stellenanzeigen (für die Arbeitgeber-Statistik)
async function stelleGeklickt(id) {
  try { await sb.rpc('stelle_geklickt', { stelle_id: id }); } catch { /* nicht kritisch */ }
}

// ════════════════════════════════════════
// BERUFSVERGLEICH – mit echten Bewertungsdaten
// ════════════════════════════════════════
async function berufStatistik(name) {
  const { data, error } = await sb
    .from('bewertungen').select('*').ilike('beruf_name', name);
  if (error || !data?.length) return null;

  const n = data.length;
  const gesamt = data.reduce((s,b) => s + (b.bewertung_gesamt||0), 0) / n;
  const empf = Math.round(data.filter(b => b.weiterempfehlung).length / n * 100);
  const mitErw = data.filter(b => b.bewertung_erwartung > 0);
  const erwartung = mitErw.length ? mitErw.reduce((s,b) => s + b.bewertung_erwartung, 0) / mitErw.length : null;
  const geh = data.filter(b => b.gehalt_brutto > 0).map(b => b.gehalt_brutto).sort((a,b) => a-b);
  const median = geh.length ? (geh.length % 2 ? geh[Math.floor(geh.length/2)]
    : Math.round((geh[geh.length/2 - 1] + geh[geh.length/2]) / 2)) : null;

  return { n, gesamt, empf, erwartung, median };
}

function renderVergleichKarte(el, name, stat) {
  if (!stat) {
    el.innerHTML = `<h3>${escHtml(name)}</h3>
      <p style="font-size:.88rem;color:var(--muted)">Für diesen Beruf gibt es noch keine Bewertungen.
      <span onclick="showPage('bewerten')" style="color:var(--accent-deep);cursor:pointer;font-weight:600">Jetzt bewerten</span></p>`;
    return;
  }
  const farbe = v => v >= 4 ? 'good' : v >= 3 ? 'mid' : '';
  el.innerHTML = `<h3>${escHtml(name)}</h3>
    <div class="v-row"><span class="v-label">Gesamtbewertung</span><span class="v-val ${farbe(stat.gesamt)}">${stat.gesamt.toFixed(1)} / 5 ★</span></div>
    <div class="v-row"><span class="v-label">Weiterempfehlung</span><span class="v-val ${stat.empf >= 70 ? 'good' : stat.empf >= 50 ? 'mid' : ''}">${stat.empf}%</span></div>
    <div class="v-row"><span class="v-label">Versprechen ≈ Realität</span><span class="v-val ${stat.erwartung ? farbe(stat.erwartung) : ''}">${stat.erwartung ? stat.erwartung.toFixed(1) + ' / 5' : '–'}</span></div>
    <div class="v-row"><span class="v-label">Ø Gehalt (Median)</span><span class="v-val good">${stat.median ? stat.median.toLocaleString('de') + ' €' : '–'}</span></div>
    <div class="v-row"><span class="v-label">Bewertungen</span><span class="v-val">${stat.n}</span></div>`;
}

async function vergleicheBerufe() {
  const n1 = document.getElementById('v-input-1')?.value?.trim();
  const n2 = document.getElementById('v-input-2')?.value?.trim();
  const c1 = document.getElementById('v-card-1');
  const c2 = document.getElementById('v-card-2');

  if (!n1 || !n2) {
    hinweis('Bitte trag zwei Berufe ein, die du vergleichen möchtest.', 'fehler');
    return;
  }

  c1.innerHTML = '<p style="color:var(--muted)">Lade…</p>';
  c2.innerHTML = '<p style="color:var(--muted)">Lade…</p>';

  const [s1, s2] = await Promise.all([berufStatistik(n1), berufStatistik(n2)]);
  renderVergleichKarte(c1, n1, s1);
  renderVergleichKarte(c2, n2, s2);
}

// ════════════════════════════════════════
// STATISTIKEN HOMEPAGE
// ════════════════════════════════════════
async function loadStats() {
  const berEl = document.getElementById('stat-berufe');
  if (!berEl) return;
  try {
    const { count } = await sb.from('berufe').select('*', { count: 'exact', head: true });
    berEl.textContent = (count ?? 0).toLocaleString('de');
  } catch {
    berEl.textContent = '–';
  }
}

// ════════════════════════════════════════
// Öffentlich, kostenlos, kein eigener Key nötig
// ════════════════════════════════════════
const BERUFENET_PROXY = '/.netlify/functions/berufenet';

// Berufsgruppen-Mapping für lesbare Kategorien
const BERUFSGRUPPEN = {
  '100': 'Ausbildungsberuf', '102': 'Ausbildungsberuf', '105': 'Ausbildungsberuf',
  '200': 'Weiterbildung', '201': 'Weiterbildung', '203': 'Weiterbildung', '204': 'Weiterbildung',
  '300': 'Studium', '301': 'Studium', '302': 'Studium',
  '400': 'Hochschulberuf', '401': 'Hochschulberuf', '402': 'Hochschulberuf',
  '500': 'Beamtenlaufbahn', '503': 'Beamtenlaufbahn',
  '700': 'Tätigkeitsfeld'
};

// Debounce damit nicht bei jedem Tastendruck eine API-Anfrage geht
let searchTimeout = null;
let currentBeruf = null;

// ── Navigation
// ════════════════════════════════════════
// SCHUTZ VOR DATENVERLUST
// Warnt, wenn eine angefangene Bewertung verloren ginge
// ════════════════════════════════════════
function bewertungAngefangen() {
  // Nur relevant, solange das Bewertungsformular offen ist
  const seite = document.getElementById('page-bewerten');
  if (!seite || !seite.classList.contains('active')) return false;

  // Das Berufsfeld wird beim Öffnen einer Berufsseite automatisch
  // vorbelegt – es allein zählt nicht als "angefangen"
  const gefuellt = ['f-erwartet','f-alltag','f-freitext','f-gehalt']
    .some(id => (document.getElementById(id)?.value || '').trim().length > 0);
  const ausgewaehlt = document.querySelector('#page-bewerten .skill-opt.sel')
    || document.querySelector('#page-bewerten .stern.aktiv')
    || document.querySelector('#page-bewerten .toggle-opt.sel');

  return gefuellt || !!ausgewaehlt;
}

// Beim Schließen des Tabs oder Zurück aus der Seite heraus
window.addEventListener('beforeunload', (e) => {
  if (bewertungAngefangen()) {
    e.preventDefault();
    e.returnValue = '';   // Browser zeigen ihren eigenen Hinweistext
  }
});

// ════════════════════════════════════════
// SEITENWECHSEL mit Browser-Verlauf
// Damit der Zurück-Knopf innerhalb der Seite funktioniert
// statt JobInsides ganz zu verlassen
// ════════════════════════════════════════
let verlaufAktiv = true;   // false, während wir auf ein Zurück reagieren

function showPage(id, ausVerlauf) {
  // Angefangene Bewertung schützen, wenn woanders hin gewechselt wird
  if (!ausVerlauf && id !== 'bewerten' && bewertungAngefangen()) {
    if (!confirm('Deine Bewertung ist noch nicht abgeschickt und geht verloren. Trotzdem wechseln?')) return;
    formularZuruecksetzen();
  }

  // Sicherstellen, dass ein Grundzustand im Verlauf liegt –
  // sonst führt der erste Zurück-Klick aus der Seite heraus
  if (!ausVerlauf && verlaufAktiv && !history.state) {
    history.replaceState({ seite: 'home' }, '', location.pathname);
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const ziel = document.getElementById('page-' + id);
  if (ziel) ziel.classList.add('active');
  window.scrollTo(0, 0);

  if (!ausVerlauf && verlaufAktiv) {
    const zustand = { seite: id };
    // Startseite als Grundzustand, alles andere kommt obendrauf
    if (id === 'home') history.replaceState(zustand, '', location.pathname);
    else history.pushState(zustand, '', '#' + id);
  }
}

// Reagiert auf den Zurück- und Vorwärts-Knopf des Browsers
window.addEventListener('popstate', (e) => {
  // Angefangene Bewertung? Dann nachfragen bevor sie verloren geht
  if (bewertungAngefangen()) {
    const weiter = confirm('Deine Bewertung ist noch nicht abgeschickt und geht verloren. Trotzdem zurück?');
    if (!weiter) {
      // Auf der Bewertungsseite bleiben: Verlaufseintrag wiederherstellen
      history.pushState({ seite: 'bewerten' }, '', '#bewerten');
      return;
    }
    formularZuruecksetzen();
  }

  const z = e.state;
  verlaufAktiv = false;
  if (!z || z.seite === 'home') {
    showPage('home', true);
  } else if (z.seite === 'beruf' && z.beruf) {
    zeigeBerufOhneVerlauf(z.beruf, z.gruppe, z.dkz);
  } else {
    showPage(z.seite, true);
  }
  verlaufAktiv = true;
});

// Öffnet einen Beruf, ohne einen neuen Verlaufseintrag anzulegen
function zeigeBerufOhneVerlauf(name, gruppe, dkz) {
  const merker = verlaufAktiv;
  verlaufAktiv = false;
  showBeruf(name, gruppe, dkz, true);
  verlaufAktiv = merker;
}

function showBeruf(name, berufsgruppe, dkzId, ausVerlauf) {
  currentBeruf = { name, berufsgruppe, dkzId };
  document.getElementById('beruf-title').textContent = name;
  document.getElementById('beruf-breadcrumb').textContent = name;

  // Berufsgruppe im Header aktualisieren (akzeptiert Code ODER lesbaren Namen)
  const bgLabel = BERUFSGRUPPEN[String(berufsgruppe)] || berufsgruppe || 'Beruf';
  document.querySelector('.beruf-pill').textContent = '🎓 ' + bgLabel;
  const bcGruppe = document.getElementById('beruf-breadcrumb-gruppe');
  if (bcGruppe) {
    const plural = {
      'Ausbildungsberuf': 'Ausbildungsberufe',
      'Weiterbildung': 'Weiterbildungen',
      'Studium': 'Studiengänge',
      'Hochschulberuf': 'Hochschulberufe',
      'Beamtenlaufbahn': 'Beamtenlaufbahnen',
      'Tätigkeitsfeld': 'Tätigkeitsfelder'
    };
    bcGruppe.textContent = plural[bgLabel] || 'Berufe';
  }

  // Bewertungsformular: Berufsfeld vorausfüllen
  const berufInput = document.getElementById('f-beruf');
  if (berufInput) berufInput.value = name;

  showPage('beruf', true);
  // Beruf im Verlauf ablegen, damit Zurück wieder zur Suche führt
  if (!ausVerlauf && verlaufAktiv) {
    if (!history.state) history.replaceState({ seite: 'home' }, '', location.pathname);
    history.pushState(
      { seite: 'beruf', beruf: name, gruppe: berufsgruppe, dkz: dkzId },
      '', '#beruf=' + encodeURIComponent(name)
    );
  }
  switchTabByName('tab-bewertungen');

  // Echte Bewertungen aus Supabase laden
  loadBewertungen(name);

  // Stellen-Cache zurücksetzen (werden beim Tab-Öffnen neu geladen)
  stellenGeladenFuer = null;
  const sl = document.getElementById('stellen-liste');
  if (sl) sl.innerHTML = '';

  // Diskussionen laden
  loadDiskussionen(name);

  // Spezialisierungen laden (verwandte Berufe mit gleichem Stamm)
  loadSpezialisierungen(name);

  // Ähnliche Berufe laden
  loadAehnlicheBerufe(dkzId);
}

// ════════════════════════════════════════
// SPEZIALISIERUNGEN – verwandte Berufe mit gleichem Wortstamm
// z.B. "Fachinformatiker - Anwendungsentwicklung" + "... Systemintegration"
// ════════════════════════════════════════
function basisName(name) {
  // Schneidet alles nach Trennzeichen ab um den Stammberuf zu finden
  return name.split(/\s[-–—(/]\s?|,\s/)[0].trim();
}

async function loadSpezialisierungen(name) {
  const widget = document.getElementById('spezi-widget');
  const list = document.getElementById('spezi-list');
  if (!widget || !list) return;

  const basis = basisName(name);
  // Nur sinnvoll wenn der Stamm lang genug ist
  if (basis.length < 4) { widget.style.display = 'none'; return; }

  try {
    const { data, error } = await sb
      .from('berufe')
      .select('name, berufsgruppe, dkz_id')
      .ilike('name_lower', basis.toLowerCase() + '%')
      .limit(24);

    if (error || !data || !data.length) {
      widget.style.display = 'none';
      return;
    }

    // Duplikate entfernen: gleicher Name kann in mehreren Berufsgruppen
    // vorkommen – jeden Namen nur einmal anzeigen
    const gesehen = new Set();
    const eindeutig = [];
    for (const b of data) {
      if (!gesehen.has(b.name)) {
        gesehen.add(b.name);
        eindeutig.push(b);
      }
    }

    if (eindeutig.length < 2) {
      widget.style.display = 'none';
      return;
    }

    // Aktuellen Beruf nach oben, Rest danach
    const sortiert = eindeutig.sort((a, b) => (a.name === name ? -1 : b.name === name ? 1 : 0)).slice(0, 12);

    list.innerHTML = sortiert.map(b => {
      const aktiv = b.name === name;
      return `<div class="similar-job" ${aktiv ? '' : `onclick="showBeruf('${b.name.replace(/'/g,"\\'")}', '${b.berufsgruppe}', '${b.dkz_id||''}')"`} style="${aktiv ? 'opacity:.6;cursor:default' : ''}">
        <span class="sj-name">${aktiv ? '▸ ' : ''}${b.name}</span>
      </div>`;
    }).join('');

    widget.style.display = 'block';
  } catch {
    widget.style.display = 'none';
  }
}

// ════════════════════════════════════════
// AUTOCOMPLETE im Bewertungsformular
// Schlägt Berufe aus der Datenbank vor während der Eingabe
// ════════════════════════════════════════
let formBerufTimer = null;

function handleFormBerufSearch(wert) {
  clearTimeout(formBerufTimer);
  const dd = document.getElementById('f-beruf-dropdown');
  if (!dd) return;

  const suchbegriff = (wert || '').trim();
  if (suchbegriff.length < 2) {
    dd.classList.remove('open');
    return;
  }

  // Kurze Verzögerung damit nicht bei jedem Tastendruck gesucht wird
  formBerufTimer = setTimeout(async () => {
    try {
      const q = suchbegriff.toLowerCase();
      const varianten = erweitereSuchbegriff(q);

      const abfragen = [];
      for (const v of varianten) {
        abfragen.push(sb.from('berufe').select('name, berufsgruppe').ilike('name_lower', `${v}%`).limit(12));
        abfragen.push(sb.from('berufe').select('name, berufsgruppe').ilike('name_lower', `%${v}%`).limit(20));
      }

      const ergebnisse = await Promise.all(abfragen);
      const zusammen = ergebnisse.flatMap(r => r.data || []);
      const treffer = sortiereNachRelevanz(entdupliziere(zusammen), q, varianten).slice(0, 8);

      if (!treffer.length) {
        dd.innerHTML = `<div class="search-item" style="color:var(--muted)">Kein Treffer – du kannst den Beruf auch so eintragen</div>`;
        dd.classList.add('open');
        return;
      }

      dd.innerHTML = treffer.map(b =>
        `<div class="search-item" onmousedown="selectFormBeruf('${b.name.replace(/'/g,"\\'")}')">
          <span>${escHtml(b.name)}</span><span class="tag">${escHtml(b.berufsgruppe)}</span>
        </div>`
      ).join('');
      dd.classList.add('open');
    } catch {
      dd.classList.remove('open');
    }
  }, 250);
}

function selectFormBeruf(name) {
  const input = document.getElementById('f-beruf');
  if (input) input.value = name;
  closeFormBerufDropdown();
}

function closeFormBerufDropdown() {
  const dd = document.getElementById('f-beruf-dropdown');
  if (dd) dd.classList.remove('open');
}

// Init beim Seitenstart
window.addEventListener('DOMContentLoaded', async () => {
  loadStats();

  // Startseite als Grundzustand im Verlauf ablegen
  history.replaceState({ seite: 'home' }, '', location.pathname + location.search);

  // Direktlink aus Newsletter-Mails: ?beruf=Name öffnet die Berufsseite
  const gewuenscht = new URLSearchParams(location.search).get('beruf');
  if (gewuenscht) {
    try {
      const { data } = await sb
        .from('berufe')
        .select('name, berufsgruppe, dkz_id')
        .ilike('name', gewuenscht)
        .limit(1);
      if (data?.length) {
        showBeruf(data[0].name, data[0].berufsgruppe, data[0].dkz_id || '');
      }
    } catch { /* stillschweigend auf Startseite bleiben */ }
  }
});

// ── Tabs
function switchTab(el, tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  switchTabByName(tabId);
}

function switchTabByName(tabId) {
  const tabs = ['tab-bewertungen','tab-gehalt','tab-skills','tab-diskussion','tab-stellen'];
  tabs.forEach(t => {
    const el = document.getElementById(t);
    if (el) el.style.display = t === tabId ? 'block' : 'none';
  });

  // Stellen erst laden wenn der Tab wirklich geöffnet wird
  if (tabId === 'tab-stellen') ladeStellen();
}

// ════════════════════════════════════════
// LIVE SUCHE – BERUFENET API
// ════════════════════════════════════════
async function handleSearch(val) {
  const dd = document.getElementById('search-dropdown');

  if (!val || val.length < 2) {
    dd.classList.remove('open');
    return;
  }

  // Debounce: warte 300ms nach letztem Tastendruck
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => fetchBerufe(val), 300);
}

// ════════════════════════════════════════
// UMGANGSSPRACHE → OFFIZIELLE BERUFSBEZEICHNUNG
// Menschen suchen wie sie sprechen ("KFZler"), nicht wie
// BERUFENET schreibt ("Kraftfahrzeugmechatroniker/in").
// Diese Liste übersetzt beim Suchen – einfach erweiterbar.
// ════════════════════════════════════════
const SYNONYME = {
  // Fahrzeug & Technik
  'kfz': ['kraftfahrzeug'],
  'kfzler': ['kraftfahrzeug'],
  'automechaniker': ['kraftfahrzeugmechatroniker'],
  'autoschlosser': ['kraftfahrzeugmechatroniker'],
  'automechatroniker': ['kraftfahrzeugmechatroniker'],
  'schrauber': ['kraftfahrzeugmechatroniker'],
  'lkw fahrer': ['berufskraftfahrer'],
  'lkwfahrer': ['berufskraftfahrer'],
  'trucker': ['berufskraftfahrer'],
  'busfahrer': ['berufskraftfahrer'],
  'zugführer': ['triebfahrzeugführer'],
  'lokführer': ['triebfahrzeugführer'],
  'pilot': ['luftfahrzeugführer', 'pilot'],

  // IT & Büro
  'it': ['informationstechnik', 'informatik'],
  'itler': ['informatik', 'informationstechnik'],
  'programmierer': ['fachinformatiker', 'informatik', 'softwareentwickl'],
  'entwickler': ['fachinformatiker', 'softwareentwickl'],
  'softwareentwickler': ['fachinformatiker', 'softwareentwickl'],
  'informatiker': ['informatik', 'fachinformatiker'],
  'admin': ['systemadministrator', 'fachinformatiker'],
  'sekretärin': ['büromanagement', 'sekretär'],
  'sekretär': ['büromanagement', 'sekretär'],
  'bürokaufmann': ['büromanagement'],
  'bürokauffrau': ['büromanagement'],
  'bürokraft': ['büromanagement'],
  'buchhalter': ['buchhaltung', 'finanzbuchhalter'],
  'sachbearbeiter': ['sachbearbeit'],

  // Gesundheit & Pflege
  'krankenschwester': ['pflegefachfrau', 'pflegefach', 'gesundheits- und krankenpfleg'],
  'krankenpfleger': ['pflegefachmann', 'pflegefach', 'gesundheits- und krankenpfleg'],
  'pfleger': ['pflegefach', 'altenpfleg'],
  'pflegerin': ['pflegefach', 'altenpfleg'],
  'altenpfleger': ['altenpfleg', 'pflegefach'],
  'arzthelferin': ['medizinische fachangestellte', 'medizinisch'],
  'sprechstundenhilfe': ['medizinische fachangestellte'],
  'zahnarzthelferin': ['zahnmedizinische fachangestellte'],
  'apothekenhelferin': ['pharmazeutisch-kaufmännische'],
  'hebamme': ['hebamme', 'entbindungspfleger'],
  'sanitäter': ['rettungssanitäter', 'notfallsanitäter'],
  'physio': ['physiotherapeut'],

  // Handwerk & Bau
  'elektriker': ['elektroniker', 'elektro'],
  'elektro': ['elektroniker'],
  'installateur': ['anlagenmechaniker'],
  'klempner': ['anlagenmechaniker', 'klempner'],
  'heizungsbauer': ['anlagenmechaniker'],
  'sanitär': ['anlagenmechaniker'],
  'schreiner': ['tischler', 'schreiner'],
  'maurer': ['maurer'],
  'zimmermann': ['zimmerer'],
  'dachdecker': ['dachdecker'],
  'schlosser': ['metallbauer', 'industriemechaniker'],
  'schweißer': ['schweiß', 'metallbauer'],
  'gärtner': ['gärtner', 'garten- und landschaftsbau'],
  'landschaftsgärtner': ['garten- und landschaftsbau'],

  // Handel & Gastro
  'verkäufer': ['verkäufer', 'kaufmann im einzelhandel'],
  'verkäuferin': ['verkäufer', 'kauffrau im einzelhandel'],
  'kassiererin': ['verkäufer', 'einzelhandel'],
  'einzelhandelskaufmann': ['einzelhandel'],
  'koch': ['koch', 'köchin'],
  'kellner': ['restaurantfachmann', 'fachkraft für gastronomie'],
  'kellnerin': ['restaurantfachfrau', 'fachkraft für gastronomie'],
  'bäcker': ['bäcker'],
  'metzger': ['fleischer', 'metzger'],
  'friseur': ['friseur'],
  'frisör': ['friseur'],

  // Soziales & Bildung
  'erzieher': ['erzieher'],
  'kindergärtnerin': ['erzieher', 'kinderpfleg'],
  'lehrer': ['lehrer', 'lehramt'],
  'sozialarbeiter': ['sozialarbeit', 'sozialpädagog'],
  'sozialpädagoge': ['sozialpädagog', 'sozialarbeit'],

  // Wirtschaft & Recht
  'anwalt': ['rechtsanwalt', 'jurist'],
  'rechtsanwaltsgehilfin': ['rechtsanwaltsfachangestellte'],
  'steuerberater': ['steuerberater', 'steuerfachangestellte'],
  'banker': ['bankkaufmann', 'bankkauffrau'],
  'versicherungsmakler': ['versicherungskaufmann', 'versicherung'],
  'schadenregulierer': ['schadensregulierer'],
  'schadensregulierer': ['schadensregulierer'],
  'personaler': ['personal', 'human resources'],
  'hr': ['personal', 'human resources'],
  'controller': ['controlling'],
  'einkäufer': ['einkauf'],

  // Logistik & Sicherheit
  'lagerist': ['fachkraft für lagerlogistik', 'fachlagerist'],
  'lagerarbeiter': ['fachlagerist', 'lagerlogistik'],
  'staplerfahrer': ['fachlagerist', 'lagerlogistik'],
  'paketbote': ['zusteller', 'post'],
  'postbote': ['zusteller', 'post'],
  'wachmann': ['schutz und sicherheit', 'werkschutz'],
  'sicherheitsmann': ['schutz und sicherheit'],
  'polizist': ['polizeivollzugsdienst', 'polizei'],
  'feuerwehrmann': ['brandmeister', 'feuerwehr'],
  'soldat': ['soldat', 'bundeswehr'],

  // Medien & Design
  'grafiker': ['mediengestalter', 'grafikdesign'],
  'grafikdesigner': ['grafikdesign', 'mediengestalter'],
  'fotograf': ['fotograf'],
  'journalist': ['journalis', 'redakteur'],
  'texter': ['redakteur', 'text']
};

// Erweitert einen Suchbegriff um passende Fachbegriffe
function erweitereSuchbegriff(begriff) {
  const q = begriff.toLowerCase().trim();
  const varianten = new Set([q]);

  // Direkter Treffer im Verzeichnis
  if (SYNONYME[q]) {
    SYNONYME[q].forEach(v => varianten.add(v));
    return [...varianten];
  }

  // Teiltreffer nur ab 4 Zeichen und nur wenn der Eintrag
  // mit der Eingabe beginnt ("kfzme" → "kfz" nein, "kfz" → "kfzler" ja).
  // So löst "sch" nicht schreiner/schweißer/schadensregulierer gleichzeitig aus.
  if (q.length >= 4) {
    for (const [umgangssprachlich, fachbegriffe] of Object.entries(SYNONYME)) {
      if (umgangssprachlich.startsWith(q)) {
        fachbegriffe.forEach(v => varianten.add(v));
      }
    }
  }

  // Mehrwortsuche: erstes Wort prüfen ("kfz mechaniker" → "kfz")
  const ersterTeil = q.split(/\s+/)[0];
  if (ersterTeil !== q && SYNONYME[ersterTeil]) {
    SYNONYME[ersterTeil].forEach(v => varianten.add(v));
  }

  // Nie mehr als 4 Varianten – schont die Datenbank
  return [...varianten].slice(0, 4);
}

// Sortiert Treffer nach Relevanz:
// 1. Name beginnt mit dem Suchbegriff
// 2. Ein Wort im Namen beginnt damit
// 3. Rest (kommt irgendwo vor)
// Bei gleichem Rang: kürzere Namen zuerst
function sortiereNachRelevanz(liste, suchbegriff, varianten) {
  const q = suchbegriff.toLowerCase().trim();
  const alle = varianten && varianten.length ? varianten : [q];

  const rang = (name) => {
    const n = name.toLowerCase();
    // Bester Rang über alle Suchvarianten
    let best = 4;
    for (const v of alle) {
      // Originalbegriff bekommt Vorrang vor Synonymen
      const bonus = v === q ? 0 : 0.5;
      if (n.startsWith(v)) best = Math.min(best, 0 + bonus);
      else if (new RegExp('[\\s\\-/(,]' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(n)) best = Math.min(best, 1 + bonus);
      else if (n.includes(v)) best = Math.min(best, 2 + bonus);
    }
    return best;
  };

  return liste.sort((a, b) => {
    const ra = rang(a.name), rb = rang(b.name);
    if (ra !== rb) return ra - rb;
    return a.name.length - b.name.length;
  });
}

// Entfernt Duplikate (gleicher Name in mehreren Berufsgruppen)
function entdupliziere(liste) {
  const gesehen = new Set();
  return liste.filter(b => {
    if (gesehen.has(b.name)) return false;
    gesehen.add(b.name);
    return true;
  });
}

// ════════════════════════════════════════
// SUCHPROTOKOLL (anonym, ohne Personenbezug)
// Speichert nur den Suchbegriff – hilft zu erkennen
// welche Berufe gesucht aber noch nicht bewertet sind
// ════════════════════════════════════════
let suchProtokollTimer = null;
let zuletztProtokolliert = '';

function protokolliereSuche(begriff, trefferAnzahl) {
  // Nur den finalen Suchbegriff protokollieren, nicht jeden Tastendruck
  clearTimeout(suchProtokollTimer);
  suchProtokollTimer = setTimeout(async () => {
    const q = (begriff || '').trim();
    if (q.length < 3 || q === zuletztProtokolliert) return;
    zuletztProtokolliert = q;
    try {
      await secureSubmit('suche', { begriff: q, treffer: trefferAnzahl });
    } catch { /* Protokoll ist nicht kritisch */ }
  }, 1200);
}

async function fetchBerufe(suchbegriff) {
  const dd = document.getElementById('search-dropdown');

  dd.innerHTML = `<div class="search-item" style="color:var(--muted);justify-content:center;gap:.5rem">
    <span class="search-spinner"></span> Suche läuft…</div>`;
  dd.classList.add('open');

  try {
    const q = suchbegriff.toLowerCase().trim();
    const varianten = erweitereSuchbegriff(q);

    // Für jede Variante zwei Abfragen: "beginnt mit" und "enthält"
    const abfragen = [];
    for (const v of varianten) {
      abfragen.push(sb.from('berufe').select('name, berufsgruppe, dkz_id').ilike('name_lower', `${v}%`).limit(15));
      abfragen.push(sb.from('berufe').select('name, berufsgruppe, dkz_id').ilike('name_lower', `%${v}%`).limit(25));
    }

    const ergebnisse = await Promise.all(abfragen);
    const zusammen = ergebnisse.flatMap(r => r.data || []);
    const treffer = sortiereNachRelevanz(entdupliziere(zusammen), q, varianten).slice(0, 10);

    if (!treffer.length) {
      dd.innerHTML = `<div class="search-item" style="color:var(--muted)">Kein Beruf gefunden – <strong onclick="showPage('bewerten')" style="cursor:pointer;color:var(--accent)">trotzdem bewerten</strong></div>`;
      protokolliereSuche(q, 0);
      return;
    }

    dd.innerHTML = treffer.map(b =>
      `<div class="search-item" onmousedown="showBeruf('${b.name.replace(/'/g,"\\'")}', '${b.berufsgruppe}', '${b.dkz_id||''}')">
        <span>${escHtml(b.name)}</span><span class="tag">${escHtml(b.berufsgruppe)}</span>
      </div>`
    ).join('');

    protokolliereSuche(q, treffer.length);

  } catch (err) {
    dd.innerHTML = `<div class="search-item" style="color:var(--muted)">Suche nicht verfügbar</div>${getFallbackBerufe(suchbegriff)}`;
  }

  dd.classList.add('open');
}

// Fallback mit lokalen Beispielberufen falls API nicht erreichbar
function getFallbackBerufe(val) {
  const fallback = [
    { name: 'Elektroniker/in', gruppe: 'Ausbildungsberuf' },
    { name: 'Mechatroniker/in', gruppe: 'Ausbildungsberuf' },
    { name: 'Fachinformatiker/in – Anwendungsentwicklung', gruppe: 'Ausbildungsberuf' },
    { name: 'Fachinformatiker/in – Systemintegration', gruppe: 'Ausbildungsberuf' },
    { name: 'Pflegefachkraft', gruppe: 'Ausbildungsberuf' },
    { name: 'Industriemechaniker/in', gruppe: 'Ausbildungsberuf' },
    { name: 'Kaufmann/frau für Büromanagement', gruppe: 'Ausbildungsberuf' },
    { name: 'Erzieher/in', gruppe: 'Ausbildungsberuf' },
    { name: 'Kfz-Mechatroniker/in', gruppe: 'Ausbildungsberuf' },
    { name: 'Koch/Köchin', gruppe: 'Ausbildungsberuf' },
  ];
  const matches = fallback.filter(b => b.name.toLowerCase().includes(val.toLowerCase()));
  return matches.slice(0,5).map(b =>
    `<div class="search-item" onmousedown="showBeruf('${b.name}', 100, '')">
      <span>${b.name}</span>
      <span class="tag">${b.gruppe}</span>
    </div>`
  ).join('');
}

function closeSearch() {
  setTimeout(() => document.getElementById('search-dropdown').classList.remove('open'), 150);
}

// ════════════════════════════════════════
// ÄHNLICHE BERUFE – BERUFENET API
// ════════════════════════════════════════
async function loadAehnlicheBerufe(dkzId) {
  // Ähnliche Berufe aus der eigenen Datenbank:
  // gleiche Berufsgruppe + ähnlicher Wortstamm
  const widget = document.getElementById('similar-widget');
  const container = document.getElementById('similar-jobs-list');
  if (!widget || !container || !currentBeruf) return;

  const name = currentBeruf.name;
  const stamm = basisName(name).split(/\s+/)[0];
  if (!stamm || stamm.length < 4) { widget.style.display = 'none'; return; }

  try {
    // Wortanfang suchen, aber den aktuellen Beruf ausschließen
    const { data, error } = await sb
      .from('berufe')
      .select('name, berufsgruppe, dkz_id')
      .ilike('name_lower', '%' + stamm.toLowerCase().slice(0, Math.max(4, stamm.length - 2)) + '%')
      .limit(30);

    if (error || !data?.length) { widget.style.display = 'none'; return; }

    // Duplikate und den aktuellen Beruf entfernen
    const gesehen = new Set([name]);
    const treffer = [];
    for (const b of data) {
      if (gesehen.has(b.name)) continue;
      // Spezialisierungen (gleicher Stamm mit Bindestrich) hat schon das andere Widget
      if (basisName(b.name) === basisName(name)) continue;
      gesehen.add(b.name);
      treffer.push(b);
      if (treffer.length >= 5) break;
    }

    if (!treffer.length) { widget.style.display = 'none'; return; }

    container.innerHTML = treffer.map(b =>
      `<div class="similar-job" onclick="showBeruf('${b.name.replace(/'/g, "\\'")}', '${b.berufsgruppe}', '${b.dkz_id || ''}')">
        <span class="sj-name">${escHtml(b.name)}</span>
      </div>`
    ).join('');
    widget.style.display = 'block';

  } catch {
    widget.style.display = 'none';
  }
}

// ── Kategorie-Suche (Browse ohne Suchbegriff)
// ── Stars (form)
const formStars = { expect: 0, overall: 0 };

// Was die Sterne bedeuten – erscheint neben der Auswahl
const STERN_TEXTE = {
  expect:  ['', 'Ganz anders als gedacht', 'Eher enttäuschend', 'Teils, teils', 'Größtenteils bestätigt', 'Genau wie erwartet'],
  overall: ['', 'Würde ich nicht nochmal machen', 'Eher anstrengend', 'Geht so', 'Kann ich empfehlen', 'Richtig guter Job']
};

function setStarForm(type, val) {
  formStars[type] = val;
  const sterne = document.querySelectorAll(`#stars-${type} .stern`);
  sterne.forEach((s, i) => {
    s.classList.toggle('aktiv', i < val);
    s.classList.remove('vorschau', 'gerade');
    if (i === val - 1) {
      // kurzer Pop nur beim angetippten Stern
      s.classList.add('gerade');
      s.addEventListener('animationend', () => s.classList.remove('gerade'), { once: true });
    }
  });
  const text = document.getElementById(`sterne-text-${type}`);
  if (text) { text.textContent = STERN_TEXTE[type][val] || 'Tipp einen Stern an'; text.classList.toggle('gesetzt', val > 0); }
  fortschrittAktualisieren();
}

// Vorschau beim Darüberfahren (Desktop) – Touch-Geräte überspringen das
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.sterne').forEach(gruppe => {
    const sterne = [...gruppe.querySelectorAll('.stern')];
    sterne.forEach((s, i) => {
      s.addEventListener('mouseenter', () => sterne.forEach((x, j) => x.classList.toggle('vorschau', j <= i)));
    });
    gruppe.addEventListener('mouseleave', () => sterne.forEach(x => x.classList.remove('vorschau')));
  });
  fortschrittAktualisieren();
});

// Skill-Chip umschalten und Zähler aktualisieren
function skillWaehlen(el) {
  el.classList.toggle('sel');
  const n = document.querySelectorAll('#page-bewerten .skill-opt.sel').length;
  const z = document.getElementById('skill-zaehler');
  if (z) z.innerHTML = n ? `<strong>${n}</strong> ausgewählt` : '';
}

// Zeigt, wie viele Pflichtangaben stehen – und markiert erledigte Schritte
function fortschrittAktualisieren() {
  const beruf = (document.getElementById('f-beruf')?.value || '').trim().length > 0;
  const erwartung = formStars.expect > 0;
  const gesamt = formStars.overall > 0;
  const empfehlung = !!document.querySelector('#f-empfehlung .toggle-opt.sel');

  const punkte = [beruf, erwartung, gesamt, empfehlung];
  const fertig = punkte.filter(Boolean).length;

  const fuellung = document.getElementById('fortschritt-fuellung');
  const text = document.getElementById('fortschritt-text');
  const wrap = document.getElementById('fortschritt');
  if (fuellung) fuellung.style.width = (fertig / punkte.length * 100) + '%';
  if (text) text.textContent = fertig === punkte.length
    ? 'Alles da – du kannst abschicken'
    : `${fertig} von ${punkte.length} Pflichtangaben`;
  if (wrap) wrap.classList.toggle('fertig', fertig === punkte.length);

  // Schritt-Karten abhaken
  document.getElementById('schritt-1')?.classList.toggle('erledigt', beruf);
  document.getElementById('schritt-2')?.classList.toggle('erledigt', erwartung);
  document.getElementById('schritt-4')?.classList.toggle('erledigt', gesamt && empfehlung);
}

// ── Toggle
function selectToggle(el, group) {
  el.closest('.toggle-group').querySelectorAll('.toggle-opt').forEach(o => {
    o.classList.remove('sel');
  });
  el.classList.add('sel');
  fortschrittAktualisieren();
}
