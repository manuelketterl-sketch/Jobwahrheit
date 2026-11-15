// ════════════════════════════════════════
// EINWILLIGUNG UND WERBE-PIXEL (Meta, TikTok)
//
// Die Pixel messen, ob unsere Anzeigen auf Instagram, Facebook und TikTok
// Leute zu uns bringen. Sie greifen auf das Gerät zu und senden Daten an
// die Plattformen – das geht nur mit Einwilligung VORHER (§ 25 TDDDG,
// Art. 6 Abs. 1 lit. a DSGVO). Deshalb gilt hier:
//
//  1. Ohne „Akzeptieren“ wird kein Pixel geladen. Nichts, nicht einmal
//     das Skript von Meta oder TikTok.
//  2. Auf der Bewertungsseite (/bewerten) wird nichts gesendet, und nach
//     dem Abschicken einer Bewertung sendet die Seite für den Rest des
//     Besuchs nichts mehr. Sonst wüssten Meta und TikTok, dass ein
//     bestimmtes Konto zu einem bestimmten Zeitpunkt bewertet hat – und
//     die Bewertungen stehen mit Datum öffentlich auf der Seite.
//  3. Es gehen nie Berufsnamen, Formulareingaben oder Inhalte als
//     Ereignisdaten an die Plattformen. Gemessen wird nur „Seite
//     aufgerufen“ und „Klick auf Beruf bewerten“.
//
// Solange unten keine ID eingetragen ist, passiert gar nichts: kein
// Banner, kein Link im Footer, kein Pixel.
// ════════════════════════════════════════

const WERBE_IDS = {
  // Meta: Events Manager → Datenquellen → Datensatz-ID (nur Ziffern)
  meta: '',
  // TikTok: Ads Manager → Tools → Events → Web-Events → Pixel-ID
  tiktok: ''
};

// Welches Ereignis als Erfolg zählt. Standard-Ereignisse lassen sich in
// beiden Werbekonten direkt als Kampagnenziel auswählen.
const ERFOLG = { meta: 'Lead', tiktok: 'ClickButton' };

// Speicherort der Entscheidung. Das Speichern der Entscheidung selbst
// ist technisch erforderlich und braucht keine Einwilligung.
const EW_SCHLUESSEL = 'jobinsides-einwilligung';
const EW_VERSION = 1;            // erhöhen, wenn neue Dienste dazukommen → erneut fragen
const EW_GUELTIG_TAGE = 365;     // nach einem Jahr erneut fragen
const PAUSE_SCHLUESSEL = 'jobinsides-pixelpause';

// Als window.werbung, damit app.js und die onclick-Links im HTML es finden
window.werbung = (() => {
  const dienste = [
    WERBE_IDS.meta && 'Meta (Instagram, Facebook)',
    WERBE_IDS.tiktok && 'TikTok'
  ].filter(Boolean);
  const konfiguriert = dienste.length > 0;

  let geladen = false;
  let gesperrt = false;
  let zuletztGesehen = null;

  // ── Entscheidung lesen und speichern ───────────────────────
  function lesen() {
    try {
      const roh = JSON.parse(localStorage.getItem(EW_SCHLUESSEL) || 'null');
      if (!roh || roh.v !== EW_VERSION) return null;
      if (Date.now() - new Date(roh.zeit).getTime() > EW_GUELTIG_TAGE * 864e5) return null;
      return roh;
    } catch { return null; }
  }

  function speichern(marketing) {
    try {
      localStorage.setItem(EW_SCHLUESSEL,
        JSON.stringify({ v: EW_VERSION, marketing, zeit: new Date().toISOString() }));
    } catch { /* privater Modus: dann fragen wir beim nächsten Besuch eben wieder */ }
  }

  const eingewilligt = () => konfiguriert && lesen()?.marketing === true;

  // ── Wann darf etwas gesendet werden? ───────────────────────
  function pausiert() {
    try { return sessionStorage.getItem(PAUSE_SCHLUESSEL) === '1'; } catch { return false; }
  }
  const aufBewertungsseite = () => location.pathname === '/bewerten';
  const darfSenden = () => eingewilligt() && !pausiert() && !aufBewertungsseite();

  // ── Pixel laden (Original-Grundcode der Anbieter) ──────────
  function metaLaden(id) {
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    // Keine automatischen Seitenaufrufe bei Adresswechseln – das steuern wir selbst,
    // sonst würde Meta auch /bewerten melden.
    window.fbq.disablePushState = true;
    // Keine automatisch erkannten Ereignisse (z. B. Klicks mit Knopftexten)
    window.fbq('set', 'autoConfig', false, id);
    window.fbq('init', id);
  }

  function tiktokLaden(id) {
    !function (w, d, t) {
      w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify",
      "instances","debug","on","off","once","ready","alias","group","enableCookie",
      "disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e)
      {t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
      for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
      ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)
      ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){
      var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;
      ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,
      ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");
      n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;
      e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
      ttq.load(id);
    }(window, document, 'ttq');
  }

  function laden() {
    if (geladen) return;
    geladen = true;
    if (WERBE_IDS.meta) metaLaden(WERBE_IDS.meta);
    if (WERBE_IDS.tiktok) tiktokLaden(WERBE_IDS.tiktok);
  }

  // Beide Pixel haben eine eingebaute Sperre. Wir schalten sie auf der
  // Bewertungsseite und nach dem Abschicken ein – damit auch das, was die
  // Skripte von sich aus senden würden, nicht rausgeht.
  function sperreSetzen(an) {
    if (!geladen || gesperrt === an) return;
    gesperrt = an;
    try {
      if (window.fbq) window.fbq('consent', an ? 'revoke' : 'grant');
      if (window.ttq) window.ttq[an ? 'revokeConsent' : 'grantConsent']();
    } catch { /* Pixel noch nicht bereit – dann wird ohnehin nichts gesendet */ }
  }

  // ── Seitenaufrufe ──────────────────────────────────────────
  // Die Seite ist eine Single-Page-App: Seitenwechsel passieren per
  // history.pushState. Wir hängen uns dort ein, statt in jede Funktion
  // von app.js einen Aufruf zu schreiben.
  function seitenwechsel() {
    if (!eingewilligt()) return;
    // Dieselbe Adresse zweimal hintereinander zählt nur einmal
    if (location.pathname === zuletztGesehen) return;
    zuletztGesehen = location.pathname;
    if (!darfSenden()) { sperreSetzen(true); return; }
    // Erst auf einer erlaubten Seite laden – wer direkt auf /bewerten
    // landet, lädt gar nichts.
    laden();
    sperreSetzen(false);
    try {
      if (window.fbq) window.fbq('track', 'PageView');
      if (window.ttq) window.ttq.page();
    } catch {}
  }

  const originalPush = history.pushState;
  history.pushState = function () {
    const ergebnis = originalPush.apply(this, arguments);
    setTimeout(seitenwechsel, 0);
    return ergebnis;
  };
  window.addEventListener('popstate', () => setTimeout(seitenwechsel, 0));

  // ── Von app.js aufgerufen ──────────────────────────────────
  // Klick auf „Beruf bewerten“, noch bevor die Adresse wechselt.
  // Ohne Berufsnamen oder sonstige Angaben.
  function bewertungGestartet() {
    if (!darfSenden() || !geladen) return;
    try {
      if (window.fbq && WERBE_IDS.meta) window.fbq('track', ERFOLG.meta);
      if (window.ttq && WERBE_IDS.tiktok) window.ttq.track(ERFOLG.tiktok);
    } catch {}
  }

  // Nach dem Abschicken einer Bewertung: für den Rest des Besuchs Ruhe.
  function bewertungAbgeschickt() {
    if (!eingewilligt()) return;
    try { sessionStorage.setItem(PAUSE_SCHLUESSEL, '1'); } catch {}
    sperreSetzen(true);
  }

  // ── Banner ─────────────────────────────────────────────────
  function bannerZeigen() {
    if (!konfiguriert || document.getElementById('einwilligung')) return;
    const box = document.createElement('div');
    box.id = 'einwilligung';
    box.className = 'einwilligung';
    box.setAttribute('role', 'region');
    box.setAttribute('aria-label', 'Cookie-Einstellungen');
    const liste = dienste.join(' und ');
    const mehrere = dienste.length > 1;
    box.innerHTML = `
      <div class="ew-titel">Cookies für unsere Anzeigen</div>
      <p class="ew-text">
        Mit deiner Zustimmung setzen wir Cookies von ${liste} ein. So sehen wir, ob unsere
        Anzeigen dort Leute zu uns bringen. ${mehrere ? 'Die Anbieter erfahren' : 'Der Anbieter erfährt'}
        dabei, welche Seiten du hier aufrufst, und ${mehrere ? 'können' : 'kann'} das mit deinem Konto verknüpfen.
      </p>
      <p class="ew-text ew-anonym">
        Deine Bewertung bleibt in jedem Fall anonym: Auf der Bewertungsseite und nach dem
        Abschicken wird nichts gesendet.
      </p>
      <div class="ew-knoepfe">
        <button type="button" class="ew-knopf" data-wahl="nein">Ablehnen</button>
        <button type="button" class="ew-knopf" data-wahl="ja">Akzeptieren</button>
      </div>
      <a href="/datenschutz" data-intern class="ew-link">Mehr dazu in der Datenschutzerklärung</a>`;
    box.addEventListener('click', e => {
      const k = e.target.closest('[data-wahl]');
      if (k) entscheiden(k.dataset.wahl === 'ja');
    });
    document.body.appendChild(box);
  }

  function bannerSchliessen() {
    document.getElementById('einwilligung')?.remove();
  }

  // Pixel-Cookies löschen, falls jemand seine Zustimmung zurücknimmt
  function pixelCookiesLoeschen() {
    const namen = document.cookie.split(';').map(c => c.split('=')[0].trim())
      .filter(n => /^(_fbp|_fbc|_ttp|_tt_enable_cookie|ttcsid.*|ttclid)$/.test(n));
    const host = location.hostname;
    const domains = ['', host, '.' + host, '.' + host.split('.').slice(-2).join('.')];
    for (const n of namen) for (const d of domains) {
      document.cookie = `${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d ? '; domain=' + d : ''}`;
    }
  }

  function entscheiden(ja) {
    const vorher = eingewilligt();
    speichern(ja);
    bannerSchliessen();
    if (ja) {
      seitenwechsel();
    } else if (vorher) {
      // Widerruf: Geladene Skripte lassen sich nicht entladen – also
      // Cookies weg und Seite neu laden, dann ist nichts mehr aktiv.
      pixelCookiesLoeschen();
      location.reload();
    }
  }

  // Für den Link im Footer und in der Datenschutzerklärung
  function einstellungenOeffnen() {
    bannerSchliessen();
    bannerZeigen();
  }

  // ── Start ──────────────────────────────────────────────────
  function start() {
    document.querySelectorAll('[data-cookie-einstellungen]').forEach(el => {
      el.hidden = !konfiguriert;
    });
    if (!konfiguriert) return;
    if (lesen() === null) bannerZeigen();
    else seitenwechsel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return { bewertungGestartet, bewertungAbgeschickt, einstellungenOeffnen, konfiguriert };
})();
