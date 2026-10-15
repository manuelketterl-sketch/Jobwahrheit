// ════════════════════════════════════════
// ADMIN – Dashboard-Daten und Moderation
// Zugriff nur mit ADMIN_PASSWORT (als Supabase-Secret hinterlegt)
// ════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// Zeitkonstanter Vergleich – erschwert das Erraten per Zeitmessung
function passwortStimmt(eingabe: string, echt: string): boolean {
  if (typeof eingabe !== 'string' || eingabe.length !== echt.length) return false
  let diff = 0
  for (let i = 0; i < echt.length; i++) diff |= eingabe.charCodeAt(i) ^ echt.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ ok: false, error: 'Nur POST erlaubt' }, 405)

  let body: any
  try { body = await req.json() } catch { return json({ ok: false, error: 'Ungültiger Request' }, 400) }

  const adminPw = Deno.env.get('ADMIN_PASSWORT')
  if (!adminPw) return json({ ok: false, error: 'ADMIN_PASSWORT ist nicht gesetzt' }, 500)
  if (!passwortStimmt(body.passwort || '', adminPw)) {
    // Kurze Verzögerung gegen automatisiertes Durchprobieren
    await new Promise(r => setTimeout(r, 800))
    return json({ ok: false, error: 'Falsches Passwort' }, 401)
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const aktion = body.aktion || 'uebersicht'

  // ── Moderation: Inhalte löschen ──
  if (aktion === 'loeschen') {
    const tabelle = body.tabelle
    const id = body.id
    const erlaubt = ['bewertungen', 'diskussionen', 'diskussion_antworten', 'meldungen']
    if (!erlaubt.includes(tabelle) || !id) return json({ ok: false, error: 'Ungültige Anfrage' }, 400)

    const { error } = await supabase.from(tabelle).delete().eq('id', id)
    if (error) return json({ ok: false, error: error.message }, 500)

    // Zugehörige Meldungen mitentfernen
    if (tabelle === 'bewertungen') {
      await supabase.from('meldungen').delete().eq('bewertung_id', id)
    }
    return json({ ok: true })
  }

  // ── Meldung als erledigt abhaken (ohne den Inhalt zu löschen) ──
  if (aktion === 'meldung_erledigt') {
    if (!body.id) return json({ ok: false, error: 'ID fehlt' }, 400)
    const { error } = await supabase.from('meldungen').delete().eq('id', body.id)
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }

  // ── Firma freigeben / sperren ──
  if (aktion === 'firma_status') {
    if (!body.id) return json({ ok: false, error: 'ID fehlt' }, 400)
    const felder: any = {}
    if (body.freigeben !== undefined) {
      felder.freigegeben = !!body.freigeben
      felder.freigegeben_am = body.freigeben ? new Date().toISOString() : null
    }
    if (body.sperren !== undefined) felder.gesperrt = !!body.sperren
    const { error } = await supabase.from('firmen').update(felder).eq('id', body.id)
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }

  // ── Stellenanzeige freigeben / ablehnen ──
  if (aktion === 'stelle_status') {
    if (!body.id) return json({ ok: false, error: 'ID fehlt' }, 400)
    if (body.loeschen) {
      const { error } = await supabase.from('stellenanzeigen').delete().eq('id', body.id)
      if (error) return json({ ok: false, error: error.message }, 500)
      return json({ ok: true })
    }
    const { error } = await supabase.from('stellenanzeigen').update({
      freigegeben: !!body.freigeben,
      freigegeben_am: body.freigeben ? new Date().toISOString() : null
    }).eq('id', body.id)
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }

  // ── Einstellung umschalten ──
  if (aktion === 'einstellung') {
    const schluessel = String(body.schluessel || '')
    const erlaubt = ['mail_tagesbericht', 'mail_sofort_firma', 'mail_sofort_stelle', 'mail_sofort_meldung']
    if (!erlaubt.includes(schluessel)) return json({ ok: false, error: 'Unbekannte Einstellung' }, 400)

    const { error } = await supabase.from('einstellungen').upsert([{
      schluessel, wert: !!body.wert, geaendert_am: new Date().toISOString()
    }], { onConflict: 'schluessel' })
    if (error) return json({ ok: false, error: error.message }, 500)
    return json({ ok: true })
  }

  // ── Testmail auslösen ──
  if (aktion === 'testmail') {
    const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/benachrichtigung`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ art: 'taeglich', immer: true, test: true })
    })
    const ergebnis = await res.json().catch(() => ({}))
    return json({ ok: !!ergebnis.ok, ...ergebnis })
  }

  // ── Suchauswertung: wo soll die nächste Bewertung herkommen? ──
  //
  // Vier Fragen, vier Listen:
  //  1. Was suchen Leute überhaupt?
  //  2. Welche Begriffe finden bei uns nichts?
  //  3. Welche Berufe werden gesucht, haben aber noch keine Bewertung?
  //  4. Welche Begriffe konnten wir keinem Beruf zuordnen? (Handarbeit)
  if (aktion === 'suchauswertung') {
    const tage = Math.min(Math.max(parseInt(body.tage) || 90, 1), 365)
    const seit = new Date(Date.now() - tage * 864e5).toISOString()

    const [suchRes, bewRes, synRes] = await Promise.all([
      supabase.from('suchanfragen')
        .select('begriff, begriff_lower, treffer, geoeffnet')
        .gte('created_at', seit)
        .limit(20000),
      supabase.from('bewertungen').select('beruf_name'),
      supabase.from('berufs_synonyme')
        .select('begriff, hauptberuf, beruf_name, stellen, gesucht, aktualisiert')
        .order('gesucht', { ascending: false })
        .limit(200)
    ])

    if (suchRes.error) return json({ ok: false, error: suchRes.error.message }, 500)

    // Bewertungen je Beruf, klein geschrieben als Schlüssel
    const bewProBeruf: Record<string, number> = {}
    ;(bewRes.data || []).forEach((b: any) => {
      const k = (b.beruf_name || '').toLowerCase()
      if (k) bewProBeruf[k] = (bewProBeruf[k] || 0) + 1
    })

    // Suchanfragen zusammenfassen
    type Eintrag = {
      anzeige: string
      anzahl: number
      treffer: number
      geoeffnet: Record<string, number>
      mitKlick: number
    }
    const zaehler: Record<string, Eintrag> = {}
    ;(suchRes.data || []).forEach((s: any) => {
      const k = s.begriff_lower
      if (!k) return
      if (!zaehler[k]) {
        zaehler[k] = { anzeige: s.begriff || k, anzahl: 0, treffer: 0, geoeffnet: {}, mitKlick: 0 }
      }
      const e = zaehler[k]
      e.anzahl++
      // Höchster je gesehener Trefferwert – ein einzelner Ausreißer mit 0
      // soll einen funktionierenden Begriff nicht abwerten
      if ((s.treffer ?? 0) > e.treffer) e.treffer = s.treffer ?? 0
      if (s.geoeffnet) {
        e.geoeffnet[s.geoeffnet] = (e.geoeffnet[s.geoeffnet] || 0) + 1
        e.mitKlick++
      }
    })

    const alle = Object.entries(zaehler).map(([begriff, e]) => {
      // Welcher Beruf wurde nach dieser Suche am häufigsten geöffnet?
      let zielBeruf: string | null = null
      let zielAnzahl = 0
      for (const [name, n] of Object.entries(e.geoeffnet)) {
        if (n > zielAnzahl) { zielAnzahl = n; zielBeruf = name }
      }
      const bewertungenDesZiels = zielBeruf
        ? (bewProBeruf[zielBeruf.toLowerCase()] || 0)
        : (bewProBeruf[begriff] || 0)
      return {
        begriff: e.anzeige || begriff,
        anzahl: e.anzahl,
        treffer: e.treffer,
        geoeffnet: zielBeruf,
        klicks: e.mitKlick,
        bewertungen: bewertungenDesZiels
      }
    })

    const nachAnzahl = (a: any, b: any) => b.anzahl - a.anzahl
    const meistgesucht = [...alle].sort(nachAnzahl).slice(0, 30)

    // Begriffe, die bei uns nichts finden – entweder fehlt der Beruf,
    // oder er heißt bei uns anders
    const ohneTrefferAlle = alle.filter(e => e.treffer === 0)
    const ohneTreffer = [...ohneTrefferAlle].sort(nachAnzahl).slice(0, 30)

    // Nachfrage ist da, Antwort fehlt: Suche findet den Beruf,
    // aber es steht noch keine einzige Bewertung drin
    const ohneBewertung = alle
      .filter(e => e.treffer > 0 && e.bewertungen === 0)
      .sort(nachAnzahl).slice(0, 30)

    const synListe = synRes.data || []
    const nichtZuordenbar = synListe
      .filter((s: any) => !s.beruf_name).slice(0, 30)
      .map((s: any) => ({
        begriff: s.begriff, hauptberuf: s.hauptberuf,
        stellen: s.stellen ?? 0, gesucht: s.gesucht ?? 0
      }))
    const zugeordnet = synListe
      .filter((s: any) => !!s.beruf_name).slice(0, 30)
      .map((s: any) => ({
        begriff: s.begriff, hauptberuf: s.hauptberuf,
        beruf_name: s.beruf_name, stellen: s.stellen ?? 0, gesucht: s.gesucht ?? 0
      }))

    return json({
      ok: true,
      tage,
      gesamtSuchen: (suchRes.data || []).length,
      verschiedeneBegriffe: alle.length,
      quoteOhneTreffer: alle.length
        ? Math.round((ohneTrefferAlle.length / alle.length) * 100)
        : 0,
      meistgesucht,
      ohneTreffer,
      ohneBewertung,
      nichtZuordenbar,
      zugeordnet
    })
  }

  // ── Übersicht: alle Daten fürs Dashboard ──
  const jetzt = new Date()
  const vor7 = new Date(jetzt.getTime() - 7 * 864e5).toISOString()
  const vor14 = new Date(jetzt.getTime() - 14 * 864e5).toISOString()

  const [
    meldungen, bewertungen, diskussionen, abos,
    bewCount, berCount, bew7, bew14, suchen,
    firmen, stellen, einstellungen
  ] = await Promise.all([
    supabase.from('meldungen').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('bewertungen').select('*').order('created_at', { ascending: false }).limit(25),
    supabase.from('diskussionen').select('*').order('created_at', { ascending: false }).limit(15),
    supabase.from('newsletter_abos').select('bestaetigt, beruf_name, abo_bewertungen, abo_stellen'),
    supabase.from('bewertungen').select('id', { count: 'exact', head: true }),
    supabase.from('berufe').select('id', { count: 'exact', head: true }),
    supabase.from('bewertungen').select('id', { count: 'exact', head: true }).gte('created_at', vor7),
    supabase.from('bewertungen').select('id', { count: 'exact', head: true }).gte('created_at', vor14).lt('created_at', vor7),
    supabase.from('suchanfragen').select('begriff_lower, begriff, treffer').gte('created_at', vor7),
    supabase.from('firmen').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('stellenanzeigen').select('*').order('created_at', { ascending: false }).limit(50),
    supabase.from('einstellungen').select('schluessel, wert')
  ])

  // Gemeldete Bewertungen mit Inhalt anreichern
  const meldungsListe = meldungen.data || []
  let gemeldet: any[] = []
  if (meldungsListe.length) {
    const ids = [...new Set(meldungsListe.map((m: any) => m.bewertung_id).filter(Boolean))]
    const { data: inhalte } = await supabase.from('bewertungen').select('*').in('id', ids)
    const nachId: Record<string, any> = {}
    ;(inhalte || []).forEach((b: any) => { nachId[b.id] = b })
    gemeldet = meldungsListe.map((m: any) => ({
      meldung_id: m.id,
      gemeldet_am: m.created_at,
      bewertung: nachId[m.bewertung_id] || null
    }))
  }

  // Abo-Statistik
  const aboListe = abos.data || []
  const aboStats = {
    gesamt: aboListe.length,
    bestaetigt: aboListe.filter((a: any) => a.bestaetigt).length,
    offen: aboListe.filter((a: any) => !a.bestaetigt).length,
    fuerBewertungen: aboListe.filter((a: any) => a.bestaetigt && a.abo_bewertungen).length,
    fuerStellen: aboListe.filter((a: any) => a.bestaetigt && a.abo_stellen).length
  }

  // Top-Berufe nach Bewertungen
  const { data: alleBew } = await supabase.from('bewertungen').select('beruf_name')
  const berufZaehler: Record<string, number> = {}
  ;(alleBew || []).forEach((b: any) => {
    const k = b.beruf_name || 'Unbekannt'
    berufZaehler[k] = (berufZaehler[k] || 0) + 1
  })
  const topBerufe = Object.entries(berufZaehler)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, anzahl]) => ({ name, anzahl }))

  // Suchbegriffe der letzten 7 Tage auswerten
  const suchZaehler: Record<string, { anzahl: number, treffer: number, anzeige: string }> = {}
  ;(suchen.data || []).forEach((s: any) => {
    const k = s.begriff_lower
    if (!suchZaehler[k]) suchZaehler[k] = { anzahl: 0, treffer: s.treffer ?? 0, anzeige: s.begriff }
    suchZaehler[k].anzahl++
  })
  const bewertetLower = new Set(Object.keys(berufZaehler).map(n => n.toLowerCase()))
  const topSuchen = Object.entries(suchZaehler)
    .sort((a, b) => b[1].anzahl - a[1].anzahl).slice(0, 15)
    .map(([begriff, d]) => ({
      begriff: d.anzeige || begriff,
      anzahl: d.anzahl,
      treffer: d.treffer,
      hatBewertung: bewertetLower.has(begriff)
    }))

  // Firmennamen zu den Anzeigen ergänzen
  const firmenListe = firmen.data || []
  const firmaNachId: Record<string, string> = {}
  firmenListe.forEach((f: any) => { firmaNachId[f.id] = f.name })
  const stellenListe = (stellen.data || []).map((s: any) => ({
    ...s, firma_name: firmaNachId[s.firma_id] || 'Unbekannt'
  }))

  // Einstellungen als einfaches Objekt (fehlende gelten als aktiv)
  const einst: Record<string, boolean> = {
    mail_tagesbericht: true, mail_sofort_firma: true,
    mail_sofort_stelle: true, mail_sofort_meldung: true
  }
  ;(einstellungen.data || []).forEach((e: any) => { einst[e.schluessel] = e.wert !== false })

  return json({
    ok: true,
    statistik: {
      bewertungenGesamt: bewCount.count ?? 0,
      berufeGesamt: berCount.count ?? 0,
      bewertungenWoche: bew7.count ?? 0,
      bewertungenVorwoche: bew14.count ?? 0,
      offeneMeldungen: gemeldet.length,
      offeneFirmen: firmenListe.filter((f: any) => !f.freigegeben && !f.gesperrt).length,
      offeneStellen: stellenListe.filter((s: any) => !s.freigegeben).length
    },
    gemeldet,
    bewertungen: bewertungen.data || [],
    diskussionen: diskussionen.data || [],
    firmen: firmenListe,
    stellen: stellenListe,
    aboStats,
    einstellungen: einst,
    topBerufe,
    topSuchen
  })
})
