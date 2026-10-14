import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// ── Rate Limits pro IP und Stunde ──
const LIMITS: Record<string, number> = {
  bewertung: 3,
  diskussion: 5,
  antwort: 15,
  newsletter: 5,
  meldung: 10,
  suche: 120,
  synonym: 60
}

// ── Hilfsfunktionen ──
async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode('jobinsides-salt-2026::' + ip)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function str(v: any, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  if (!t) return null
  return t.slice(0, max)
}

function fail(msg: string, status = 400) {
  return new Response(JSON.stringify({ ok: false, error: msg }),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function ok(extra: any = {}) {
  return new Response(JSON.stringify({ ok: true, ...extra }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return fail('Nur POST erlaubt', 405)

  let body: any
  try { body = await req.json() } catch { return fail('Ungültiger Request') }

  const action = body?.action
  if (!action || !(action in LIMITS)) return fail('Unbekannte Aktion')

  // ── Honeypot: unsichtbares Feld, das nur Bots ausfüllen ──
  if (body.website) return fail('Spam erkannt')

  // ── Optional: Cloudflare Turnstile prüfen (wenn Secret hinterlegt) ──
  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET')
  if (turnstileSecret) {
    const token = body.turnstileToken
    if (!token) return fail('Captcha fehlt')
    const verify = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: turnstileSecret, response: token })
    }).then(r => r.json()).catch(() => null)
    if (!verify?.success) return fail('Captcha ungültig')
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // ── Rate Limiting per IP-Hash ──
  const ip = (req.headers.get('x-forwarded-for') || 'unbekannt').split(',')[0].trim()
  const ipHash = await hashIp(ip)
  const seitEinerStunde = new Date(Date.now() - 60 * 60 * 1000).toISOString()

  const { count } = await supabase
    .from('submissions_log')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('aktion', action)
    .gte('created_at', seitEinerStunde)

  if ((count ?? 0) >= LIMITS[action]) {
    return fail('Zu viele Anfragen – bitte versuch es später erneut.', 429)
  }

  // ── Aktion validieren und ausführen ──
  const d = body.data || {}

  if (action === 'bewertung') {
    const beruf_name = str(d.beruf_name, 200)
    const bewertung_gesamt = Number(d.bewertung_gesamt)
    if (!beruf_name) return fail('Berufsbezeichnung fehlt')
    if (!Number.isInteger(bewertung_gesamt) || bewertung_gesamt < 1 || bewertung_gesamt > 5)
      return fail('Gesamtbewertung muss 1–5 sein')

    const bewertung_erwartung = Number.isInteger(Number(d.bewertung_erwartung)) &&
      d.bewertung_erwartung >= 1 && d.bewertung_erwartung <= 5 ? Number(d.bewertung_erwartung) : null

    let gehalt: number | null = parseInt(d.gehalt_brutto)
    if (isNaN(gehalt) || gehalt < 0 || gehalt > 100000) gehalt = null

    let skills: string[] | null = null
    if (Array.isArray(d.skills)) {
      skills = d.skills.filter((s: any) => typeof s === 'string')
        .map((s: string) => s.trim().slice(0, 50)).filter(Boolean).slice(0, 15)
      if (!skills.length) skills = null
    }

    const { error } = await supabase.from('bewertungen').insert([{
      beruf_name,
      berufsjahre: str(d.berufsjahre, 50),
      region: str(d.region, 50),
      was_erwartet: str(d.was_erwartet, 2000),
      bewertung_erwartung,
      alltag_vs_stelle: str(d.alltag_vs_stelle, 2000),
      skills,
      gehalt_brutto: gehalt,
      bewertung_gesamt,
      weiterempfehlung: !!d.weiterempfehlung,
      freitext: str(d.freitext, 3000),
      anon_name: str(d.anon_name, 50) || 'Anonym',
      hilfreich: 0
    }])
    if (error) return fail('Speichern fehlgeschlagen: ' + error.message, 500)
  }

  else if (action === 'diskussion') {
    const titel = str(d.titel, 200)
    if (!titel) return fail('Titel fehlt')
    const { error } = await supabase.from('diskussionen').insert([{
      beruf_name: str(d.beruf_name, 200) || 'Allgemein',
      titel,
      inhalt: str(d.inhalt, 3000),
      anon_name: str(d.anon_name, 50) || 'Anonym',
      upvotes: 0
    }])
    if (error) return fail('Speichern fehlgeschlagen: ' + error.message, 500)
  }

  else if (action === 'antwort') {
    const inhalt = str(d.inhalt, 3000)
    const diskussion_id = str(d.diskussion_id, 60)
    if (!inhalt || !diskussion_id) return fail('Antwort unvollständig')
    const { error } = await supabase.from('diskussion_antworten').insert([{
      diskussion_id,
      inhalt,
      anon_name: str(d.anon_name, 50) || 'Anonym',
      upvotes: 0
    }])
    if (error) return fail('Speichern fehlgeschlagen: ' + error.message, 500)
  }

  else if (action === 'newsletter') {
    const email = str(d.email, 200)?.toLowerCase()
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Ungültige E-Mail')
    if (!d.abo_bewertungen && !d.abo_stellen) return fail('Keine Benachrichtigung gewählt')
    const { error } = await supabase.from('newsletter_abos').insert([{
      email,
      beruf_name: str(d.beruf_name, 200) || 'Allgemein',
      abo_bewertungen: !!d.abo_bewertungen,
      abo_stellen: !!d.abo_stellen
    }])
    if (error) {
      if (error.code === '23505') return ok({ duplicate: true })
      return fail('Speichern fehlgeschlagen: ' + error.message, 500)
    }
  }

  else if (action === 'suche') {
    const begriff = str(d.begriff, 100)
    if (!begriff || begriff.length < 3) return ok()
    const treffer = Number.isInteger(Number(d.treffer)) ? Number(d.treffer) : 0
    // geoeffnet = Name des Berufs, den der Besucher danach aufgerufen hat.
    // Daraus speist sich später die Sitemap (häufig geöffnete Berufe).
    const geoeffnet = str(d.geoeffnet, 200)
    await supabase.from('suchanfragen').insert([{
      begriff,
      begriff_lower: begriff.toLowerCase(),
      treffer,
      geoeffnet
    }])
    // Suchprotokoll nicht ins Rate-Limit-Log schreiben (zu häufig)
    return ok()
  }

  else if (action === 'synonym') {
    // Die Suche hat für einen Begriff keinen Beruf gefunden, die Jobbörse
    // aber schon. Diese Zuordnung merken wir uns, damit die nächste Suche
    // sie sofort kennt.
    const begriff = str(d.begriff, 100)
    const hauptberuf = str(d.hauptberuf, 200)
    if (!begriff || begriff.length < 3 || !hauptberuf) return ok()

    const begriff_lower = begriff.toLowerCase()
    const beruf_name = str(d.beruf_name, 200)
    const stellen = Number.isInteger(Number(d.stellen)) ? Number(d.stellen) : 0

    // Schon bekannt? Dann nur Zähler hochsetzen und ggf. die Zuordnung ergänzen.
    const { data: vorhanden } = await supabase
      .from('berufs_synonyme')
      .select('id, gesucht, beruf_name')
      .eq('begriff_lower', begriff_lower)
      .maybeSingle()

    if (vorhanden) {
      await supabase.from('berufs_synonyme').update({
        gesucht: (vorhanden.gesucht || 0) + 1,
        aktualisiert: new Date().toISOString(),
        hauptberuf,
        stellen,
        beruf_name: vorhanden.beruf_name || beruf_name
      }).eq('id', vorhanden.id)
    } else {
      await supabase.from('berufs_synonyme').insert([{
        begriff, begriff_lower, hauptberuf, beruf_name, stellen
      }])
    }
    // Nicht ins Rate-Limit-Log schreiben – passiert bei jeder erfolglosen Suche
    return ok()
  }

  else if (action === 'meldung') {
    const bewertung_id = str(d.bewertung_id, 60)
    if (!bewertung_id) return fail('Bewertungs-ID fehlt')
    const { error } = await supabase.from('meldungen').insert([{ bewertung_id }])
    if (error) return fail('Speichern fehlgeschlagen: ' + error.message, 500)

    // Betreiber sofort informieren (Fehler hier blockieren die Meldung nicht)
    try {
      const { data: bw } = await supabase.from('bewertungen')
        .select('beruf_name, freitext').eq('id', bewertung_id).maybeSingle()
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/benachrichtigung`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ art: 'sofort', typ: 'meldung', daten: bw || {} })
      })
    } catch { /* Benachrichtigung ist nicht kritisch */ }
  }

  // ── Erfolg loggen (für Rate Limiting) ──
  await supabase.from('submissions_log').insert([{ ip_hash: ipHash, aktion: action }])

  return ok()
})
