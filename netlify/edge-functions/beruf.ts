// ════════════════════════════════════════
// BERUFSSEITEN – Kopfdaten schon vom Server
//
// Alle Adressen unter /beruf/… liefern dieselbe index.html aus. Titel,
// Beschreibung und Canonical setzt bisher erst app.js im Browser. Im
// ausgelieferten HTML steht deshalb auf jeder Berufsseite der Titel der
// Startseite und – schlimmer – ein Canonical auf die Startseite.
//
// Das trifft zwei Gruppen:
//  - WhatsApp, Facebook, LinkedIn und Co. führen kein JavaScript aus. Jeder
//    geteilte Berufs-Link zeigt die Vorschau der Startseite.
//  - Suchmaschinen lesen zuerst das rohe HTML. Dort behauptet jede
//    Berufsseite, sie sei eine Kopie der Startseite.
//
// Diese Funktion schlägt den Beruf in der Datenbank nach und schreibt die
// richtigen Angaben ins HTML, bevor es den Server verlässt. Die Texte
// entsprechen setzeBerufMeta() in app.js. Unbekannte Adressen bekommen
// einen echten 404-Status statt einer Umleitung im Browser.
//
// Geht irgendetwas schief (Datenbank langsam, Fehler hier), wird die Seite
// unverändert ausgeliefert – dann gilt der bisherige Stand.
// ════════════════════════════════════════

const DATENBANK = 'https://kvqdgcixmdnrarlaskyb.supabase.co/rest/v1'
// Öffentlicher Schlüssel, derselbe wie in app.js – darf jeder sehen
const SCHLUESSEL = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2cWRnY2l4bWRucmFybGFza3liIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU5NzUwMTQsImV4cCI6MjA5MTU1MTAxNH0.ngU8OG7cFC7ZWRrt0ZxlUBDIbtv-cEa-rFJbjZII2wk'
const SEITE = 'https://jobinsides.de'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

async function frage(pfad: string, zaehlen = false): Promise<Response> {
  return fetch(DATENBANK + pfad, {
    headers: {
      apikey: SCHLUESSEL,
      Authorization: 'Bearer ' + SCHLUESSEL,
      ...(zaehlen ? { Prefer: 'count=exact' } : {}),
    },
    signal: AbortSignal.timeout(1500),
  })
}

// Ersetzt den Inhalt genau einer Angabe im Kopf. Findet sich die Stelle
// nicht, bleibt das HTML an dieser Stelle, wie es war.
function setze(html: string, muster: RegExp, neu: string): string {
  return html.replace(muster, (_ganz, davor, _alt, danach) => davor + neu + danach)
}

export default async (req: Request, context: { next: () => Promise<Response> }) => {
  const antwort = await context.next()
  const typ = antwort.headers.get('content-type') || ''
  if (!typ.includes('text/html')) return antwort
  const reserve = antwort.clone()

  try {
    const slug = decodeURIComponent(new URL(req.url).pathname.slice('/beruf/'.length)).replace(/\/+$/, '')
    // So sehen Adressen aus, die slugify() in app.js erzeugt
    const gueltig = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 200

    let beruf: { name: string } | undefined
    if (gueltig) {
      const r = await frage(`/berufe?select=name&slug=eq.${slug}&limit=1`)
      if (!r.ok) return reserve
      beruf = (await r.json())[0]
    }

    // Unbekannter Beruf: echte Fehlerseite mit Status 404
    if (!beruf) {
      const fehlerseite = await fetch(new URL('/404.html', req.url))
      if (!fehlerseite.ok) return reserve
      return new Response(await fehlerseite.text(), {
        status: 404,
        headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex' },
      })
    }

    const name = beruf.name
    let bewertungen = 0
    try {
      const z = await frage(`/bewertungen?select=id&beruf_name=ilike.${encodeURIComponent(name)}&limit=1`, true)
      bewertungen = parseInt((z.headers.get('content-range') || '').split('/')[1]) || 0
    } catch { /* ohne Zahl geht es auch */ }

    const pfad = '/beruf/' + slug
    const kurz = name.length > 42 ? name.slice(0, 40) + '…' : name
    const titel = bewertungen > 0
      ? `${kurz}: Erfahrungen, Gehalt & Alltag | JobInsides`
      : `${kurz} | JobInsides`
    const beschreibung = bewertungen > 0
      ? `${bewertungen} ehrliche${bewertungen === 1 ? 'r' : ''} Erfahrungsbericht${bewertungen === 1 ? '' : 'e'} zum Beruf ${name}: Alltag, Gehalt und Anforderungen – anonym von Menschen, die den Job machen.`
      : `Wie ist der Beruf ${name} wirklich? Erfahrungen, Gehalt und Alltag – anonym bewertet auf JobInsides.`

    let html = await antwort.text()
    const t = esc(titel), b = esc(beschreibung), u = esc(SEITE + pfad)
    html = setze(html, /(<title>)([^<]*)(<\/title>)/, t)
    html = setze(html, /(<link rel="canonical" href=")([^"]*)(")/, u)
    html = setze(html, /(<meta name="description" content=")([^"]*)(")/, b)
    html = setze(html, /(<meta property="og:url" content=")([^"]*)(")/, u)
    html = setze(html, /(<meta property="og:title" content=")([^"]*)(")/, t)
    html = setze(html, /(<meta property="og:description" content=")([^"]*)(")/, b)
    html = setze(html, /(<meta name="twitter:title" content=")([^"]*)(")/, t)
    html = setze(html, /(<meta name="twitter:description" content=")([^"]*)(")/, b)
    // Die Angabe zur Indexierung bleibt unberührt: Ob eine leere Berufsseite
    // in den Index soll, entscheidet app.js erst, wenn die Stellenzahl da ist.

    const kopf = new Headers(antwort.headers)
    kopf.delete('content-length')
    kopf.delete('etag')
    return new Response(html, { status: 200, headers: kopf })
  } catch {
    return reserve
  }
}

export const config = { path: '/beruf/*' }
