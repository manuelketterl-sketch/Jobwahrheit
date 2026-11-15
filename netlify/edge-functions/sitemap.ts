// ════════════════════════════════════════
// SITEMAP – Netlify Edge Function
//
// Die Sitemap selbst erzeugt weiterhin die Supabase-Funktion "sitemap"
// live aus der Datenbank. Supabase liefert Antworten seiner Funktionen
// aber grundsätzlich als text/plain mit einer Sandbox-Richtlinie aus und
// überschreibt dabei unsere eigene Angabe application/xml. Google kennt
// auch reine Text-Sitemaps (eine Adresse pro Zeile) – die Search Console
// meldete deshalb "Konnte nicht abgerufen werden".
//
// Diese Funktion holt die Sitemap bei Supabase und gibt sie mit dem
// richtigen Typ weiter. Sie läuft vor den Regeln in _redirects; fällt
// sie aus, greift dort weiterhin die alte Weiterleitung.
// ════════════════════════════════════════

const QUELLE = 'https://kvqdgcixmdnrarlaskyb.supabase.co/functions/v1/sitemap'

export default async () => {
  try {
    const antwort = await fetch(QUELLE)
    const xml = await antwort.text()
    if (!antwort.ok || !xml.trimStart().startsWith('<?xml')) {
      return new Response('Sitemap vorübergehend nicht verfügbar', {
        status: 503,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '3600' },
      })
    }
    return new Response(xml, {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'cache-control': 'public, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return new Response('Sitemap vorübergehend nicht verfügbar', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'retry-after': '3600' },
    })
  }
}

export const config = { path: '/sitemap.xml' }
