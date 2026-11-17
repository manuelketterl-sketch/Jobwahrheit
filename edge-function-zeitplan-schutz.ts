// ════════════════════════════════════════
// PRÜFBLÖCKE FÜR "versand" UND "benachrichtigung"
//
// Beide Funktionen liegen nur in Supabase, nicht in diesem Repository.
// Der passende Block kommt jeweils direkt hinter die Zeilen, die den
// Supabase-Client anlegen:
//
//   const supabase = createClient(
//     Deno.env.get('SUPABASE_URL')!,
//     Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
//   )
//   ← HIER EINFÜGEN
//
// Eingespielt am 17. November 2026.
//
// Weitere Änderungen direkt im Supabase-Dashboard am selben Tag (diese
// Funktionen liegen nicht im Repository):
//  - newsletter: höchstens 5 Anmeldungen pro Anschluss und Stunde, höchstens
//    3 Bestätigungsmails pro Empfängeradresse und Tag (Prüfwerte im
//    submissions_log); die Antwort verrät nicht mehr, ob eine Adresse schon
//    angemeldet ist; bestätigte Abos lassen sich ohne Token nicht mehr ändern;
//    Fehlertexte von Resend gehen nicht mehr an den Aufrufer.
//  - quick-worker (BERUFENET-Import): Prüfblock wie bei versand.
//  - index-ts (alte Jobsuche, ersetzt durch jobs): nur noch mit
//    Service-Schlüssel. Kann gelöscht werden.
//
// Empfehlung: Den Code dieser Funktionen bei Gelegenheit ins Repository
// holen (Dashboard → Funktion → Download), damit er versioniert ist.
// Vorher konnte jeder "versand" mit {"testlauf": true} aufrufen und bekam
// die E-Mail-Adressen aller Abonnenten zurück.
// ════════════════════════════════════════


// ── Block für "versand" ──
// Durch kommen nur der Zeitplan (Schlüssel aus dem Vault, siehe
// supabase-zeitplan-absichern.sql) und Aufrufe mit dem Service-Schlüssel.

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


// ── Block für "benachrichtigung" ──
// Wie oben, zusätzlich: Eingeloggte Arbeitgeber dürfen melden, dass sie
// eine Firma oder Anzeige angelegt haben (arbeitgeber.html schickt dafür
// ihr Anmelde-Token mit). Der öffentliche Schlüssel reicht nicht mehr.

  // ── Nur Zeitplan, eigene Funktionen und eingeloggte Arbeitgeber ──
  {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const dienst = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    let erlaubt = !!dienst && token === dienst
    if (!erlaubt && token.length >= 32) {
      const { data } = await supabase.rpc('zeitplan_schluessel_pruefen', { k: token })
      erlaubt = data === true
    }
    if (!erlaubt && token) {
      let anfrage: any = {}
      try { anfrage = await req.clone().json() } catch { /* kein Body */ }
      if (anfrage?.art === 'sofort' && ['firma', 'stelle'].includes(anfrage?.typ)) {
        const { data } = await supabase.auth.getUser(token)
        erlaubt = !!data?.user
      }
    }
    if (!erlaubt) {
      return new Response(JSON.stringify({ ok: false, error: 'Nicht erlaubt' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }
  }
