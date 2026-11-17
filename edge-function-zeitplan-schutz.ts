// ════════════════════════════════════════
// PRÜFUNG FÜR "versand" UND "benachrichtigung"
//
// Beide Funktionen liegen nur in Supabase, nicht in diesem Repository.
// Dieser Block kommt in beiden direkt hinter die Zeile, die den
// Supabase-Client anlegt:
//
//   const supabase = createClient(
//     Deno.env.get('SUPABASE_URL')!,
//     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
//   )
//   ← HIER EINFÜGEN
//
// Durch kommen danach nur noch:
//  - der Zeitplan (Schlüssel aus dem Vault, siehe supabase-zeitplan-absichern.sql)
//  - die Funktionen submit und admin (rufen mit dem Service-Schlüssel auf)
//
// Vorher konnte jeder "versand" mit {"testlauf": true} aufrufen und bekam
// die E-Mail-Adressen aller Abonnenten zurück.
// ════════════════════════════════════════

  // ── Nur Zeitplan und eigene Funktionen ──
  {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const dienst = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    let erlaubt = !!dienst && token === dienst
    if (!erlaubt && token.length >= 32) {
      const { data } = await supabase.rpc('zeitplan_schluessel_pruefen', { k: token })
      erlaubt = data === true
    }
    if (!erlaubt) {
      return new Response(JSON.stringify({ ok: false, error: 'Nicht erlaubt' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }
