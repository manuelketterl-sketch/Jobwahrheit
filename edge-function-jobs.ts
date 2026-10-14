// ════════════════════════════════════════
// JOBSUCHE – Proxy zur Jobbörse der Bundesagentur für Arbeit
// Umgeht das CORS-Problem (Browser darf die API nicht direkt aufrufen)
// ════════════════════════════════════════

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

// Öffentlicher Client-Key der Jobsuche-API (kein Geheimnis, in der App fest hinterlegt)
const JOB_API_KEY = 'jobboerse-jobsuche'
// Stand 2026: Suche läuft über v6 (v4 wurde abgeschaltet)
const JOB_API = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v6/jobs'

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// Sucht den Arbeitgebernamen, egal unter welchem Feldnamen er steckt
function findeArbeitgeber(s: any): string | null {
  // Bekannte Varianten zuerst
  const direkt = s.arbeitgeber || s.arbeitgeberName || s.firmenname ||
                 s.arbeitgeberAdresse?.name || s.unternehmen?.name
  if (typeof direkt === 'string' && direkt.trim()) return direkt.trim()

  // Sonst: jedes Feld durchgehen dessen Name "arbeitgeber" oder "firma" enthält
  for (const [key, wert] of Object.entries(s)) {
    if (!/arbeitgeber|firma|unternehmen/i.test(key)) continue
    if (typeof wert === 'string' && wert.trim() && !/hash|nummer|id$/i.test(key)) {
      return wert.trim()
    }
    if (wert && typeof wert === 'object') {
      const name = (wert as any).name || (wert as any).bezeichnung
      if (typeof name === 'string' && name.trim()) return name.trim()
    }
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Nur POST erlaubt' }, 405)

  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'Ungültiger Request' }, 400) }

  const beruf = String(body.beruf || '').trim().slice(0, 200)
  if (!beruf) return json({ ok: false, error: 'Beruf fehlt' }, 400)

  // Berufsnamen für die Jobbörse aufbereiten:
  // "Kraftfahrzeugmechatroniker/in - Personenkraftwagentechnik" → "Kraftfahrzeugmechatroniker"
  // Klammern, Paragrafen und Fachrichtungen stören die Volltextsuche
  const suchbegriff = beruf
    .split(/\s[-–—]\s/)[0]        // Fachrichtung nach Bindestrich abschneiden
    .replace(/\([^)]*\)/g, '')     // Klammerzusätze entfernen
    .replace(/\/(in|-in|frau|mann)\b/gi, '') // "/in", "/-frau" entfernen
    .replace(/\s+/g, ' ')
    .trim() || beruf

  const plz = /^\d{5}$/.test(String(body.plz || '')) ? String(body.plz) : null
  const umkreis = [25, 50, 100, 200].includes(Number(body.umkreis)) ? Number(body.umkreis) : 50
  const size = Math.min(Number(body.size) || 10, 25)

  // Suchparameter zusammenbauen
  const params = new URLSearchParams({
    was: suchbegriff,
    page: '1',
    size: String(size),
    // Nur aktuelle Angebote (Veröffentlichung nicht älter als 100 Tage)
    veroeffentlichtseit: '100'
  })
  if (plz) {
    params.set('wo', plz)
    params.set('umkreis', String(umkreis))
  }

  try {
    // Primär v6, bei Ausfall Rückfall auf die App-Route v4
    const endpunkte = [
      JOB_API,
      'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs'
    ]

    let res: Response | null = null
    let letzterStatus = 0
    for (const endpunkt of endpunkte) {
      const versuch = await fetch(`${endpunkt}?${params}`, {
        headers: { 'X-API-Key': JOB_API_KEY, 'Accept': 'application/json' }
      })
      if (versuch.ok) { res = versuch; break }
      letzterStatus = versuch.status
    }

    if (!res) {
      return json({ ok: false, error: `Jobbörse antwortete mit ${letzterStatus}` }, 502)
    }

    const data = await res.json()
    const roh = data?.ergebnisliste || []

    // Diagnose-Schalter: mit { "debug": true } liefert die Funktion
    // den unveränderten ersten Eintrag – hilfreich wenn die Jobbörse
    // erneut Feldnamen ändert
    if (body.debug) {
      return json({
        ok: true,
        felderImEintrag: Object.keys(roh[0] || {}),
        ersterEintrag: roh[0] || null
      })
    }

    // ── Schlanker Modus für die Berufssuche ──
    // Liefert nur, welchen Berufen die Bundesagentur diese Anzeigen zuordnet.
    // Damit lernt die Suche, dass "Schadensachbearbeiter" unter
    // "Versicherungskaufmann/-frau" geführt wird – ohne 25 Anzeigen zu übertragen.
    if (body.nurBerufe) {
      const zaehler = new Map<string, number>()
      for (const s of roh) {
        const namen = Array.isArray(s.alleBerufe) && s.alleBerufe.length
          ? s.alleBerufe
          : (s.hauptberuf ? [s.hauptberuf] : [])
        for (const n of namen) {
          const k = String(n || '').trim()
          if (k) zaehler.set(k, (zaehler.get(k) || 0) + 1)
        }
      }
      const berufe = [...zaehler.entries()]
        .map(([name, anzahl]) => ({ name, anzahl }))
        .sort((a, b) => b.anzahl - a.anzahl)
        .slice(0, 5)
      return json({ ok: true, gesamt: data?.maxErgebnisse ?? roh.length, berufe })
    }

    // Felder der v6-Antwort auf unser Format bringen
    const stellen = roh.map((s: any) => {
      const ref = s.referenznummer || s.refnr || null
      // v6 liefert Orte als Array – wir nehmen den ersten
      const ort = s.stellenlokationen?.[0]?.adresse || s.arbeitsort || {}
      // v6 schreibt Regionen als "BADEN_WUERTTEMBERG" – lesbar machen
      const region = ort.region
        ? String(ort.region)
            .toLowerCase()
            .replace(/_/g, '-')
            .replace(/ue/g, 'ü').replace(/oe/g, 'ö').replace(/ae/g, 'ä')
            .replace(/(^|[\s-])([a-zäöü])/g, (_m, p, c) => p + c.toUpperCase())
        : null
      // Orte kommen teils ohne Leerzeichen nach dem Komma ("Wien,Favoriten")
      const ortName = ort.ort ? String(ort.ort).replace(/,\s*/g, ', ') : null
      return {
        id: ref,
        titel: s.stellenangebotsTitel || s.titel || s.hauptberuf || 'Stellenangebot',
        // v6 nennt das Feld "hauptberuf", nicht "beruf". Darüber ordnet die
        // Bundesagentur jede Anzeige einem Beruf zu – das ist die Brücke
        // zwischen Stellenbezeichnung ("Schadensachbearbeiter") und Beruf.
        beruf: s.hauptberuf || s.alleBerufe?.[0] || null,
        alle_berufe: Array.isArray(s.alleBerufe) ? s.alleBerufe : null,
        arbeitgeber: findeArbeitgeber(s) || 'Arbeitgeber nicht genannt',
        ort: ortName,
        plz: ort.plz || null,
        region,
        entfernung: ort.entfernung ?? s.entfernung ?? null,
        eintrittsdatum: s.eintrittszeitraum?.von || s.eintrittsdatum || null,
        veroeffentlicht: s.aktuelleVeroeffentlichungsdatum || s.veroeffentlichungsdatum || null,
        // Link zur Originalanzeige in der Jobbörse
        url: ref ? `https://www.arbeitsagentur.de/jobsuche/jobdetail/${encodeURIComponent(ref)}` : null
      }
    })

    return json({
      ok: true,
      suchbegriff,
      gesamt: data?.maxErgebnisse ?? stellen.length,
      stellen
    })

  } catch (err) {
    return json({ ok: false, error: 'Jobbörse nicht erreichbar' }, 502)
  }
})
