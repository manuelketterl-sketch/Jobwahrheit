-- ════════════════════════════════════════
-- SCHUTZ UND MELDEVERFAHREN (November 2026)
--
-- Zwei Teile. Beide im SQL-Editor von Supabase ausführen, aber zu
-- unterschiedlichen Zeitpunkten:
--
--   TEIL 1  sofort – ändert nichts, was die laufende Seite braucht
--   TEIL 2  erst, wenn die neue Seite live ist (Pull Request gemergt
--           und bei Netlify veröffentlicht). Vorher würde die alte Seite
--           keine Bewertungen mehr anzeigen.
--
-- Was sich ändert:
--  - Bewertungen bekommen einen Löschcode (nur als Prüfwert gespeichert)
--    und können vorläufig ausgeblendet werden.
--  - Öffentlich lesbar ist nur noch eine Sicht ohne Löschcode-Prüfwert,
--    ohne ausgeblendete Bewertungen und mit dem Eingang nur auf den Monat.
--  - Meldungen bekommen Begründung, Fundstelle, Kontakt und Entscheidung
--    (Meldeverfahren nach Art. 16 DSA) und sind nur noch für die
--    Server-Funktionen zugänglich.
--  - Name und E-Mail von Meldenden werden nach sechs Monaten gelöscht.
--  - Arbeitgeber können Firma und Anzeigen nicht mehr selbst freigeben.
--  - Suchbegriffe sind nicht mehr öffentlich lesbar.
-- ════════════════════════════════════════


-- ════════════════════════════════════════
-- TEIL 1 – sofort ausführen
-- ════════════════════════════════════════

-- ── 1. Bewertungen: Löschcode und Ausblenden ──
alter table bewertungen add column if not exists loesch_hash text;
alter table bewertungen add column if not exists ausgeblendet boolean not null default false;

create unique index if not exists bewertungen_loesch_hash_idx
  on bewertungen (loesch_hash) where loesch_hash is not null;

comment on column bewertungen.loesch_hash is
  'SHA-256 des Löschcodes, den der Verfasser einmal angezeigt bekommt. Nie öffentlich.';
comment on column bewertungen.ausgeblendet is
  'Vorläufig ausgeblendet, z. B. während eine Meldung geprüft wird.';


-- ── 2. Öffentliche Sicht ──
-- Die Sicht läuft mit den Rechten ihres Eigentümers (Standard). Das ist
-- hier gewollt: Fremde lesen nur diese Spalten, die Tabelle selbst wird in
-- Teil 2 für sie gesperrt. Der Supabase-Advisor meldet das als
-- „Security Definer View“ – für diese Sicht ist das in Ordnung.
create or replace view bewertungen_oeffentlich as
select
  id, beruf_name, berufsjahre, region,
  was_erwartet, bewertung_erwartung, alltag_vs_stelle, skills,
  gehalt_brutto, bonus_monatsgehaelter,
  bewertung_gesamt, weiterempfehlung, freitext,
  anon_name, hilfreich,
  -- Nur der Monat: Der genaue Zeitpunkt ließe sich mit dem Pixel-Ereignis
  -- „Bewertung abgeschickt“ verbinden.
  date_trunc('month', created_at) as created_at
from bewertungen
where not ausgeblendet;

grant select on bewertungen_oeffentlich to anon, authenticated;


-- ── 3. Meldungen: Meldeverfahren ──
alter table meldungen add column if not exists art text not null default 'bewertung';
alter table meldungen add column if not exists inhalt_id text;
alter table meldungen add column if not exists fundstelle text;
alter table meldungen add column if not exists grund text;
alter table meldungen add column if not exists melder_name text;
alter table meldungen add column if not exists melder_email text;
alter table meldungen add column if not exists status text not null default 'offen';
alter table meldungen add column if not exists begruendung text;
alter table meldungen add column if not exists entschieden_am timestamptz;

-- Meldungen zu Diskussionen haben keine Bewertungs-ID
alter table meldungen alter column bewertung_id drop not null;

alter table meldungen drop constraint if exists meldungen_art_check;
alter table meldungen add constraint meldungen_art_check
  check (art in ('bewertung', 'diskussion', 'antwort', 'sonstiges'));
alter table meldungen drop constraint if exists meldungen_status_check;
alter table meldungen add constraint meldungen_status_check
  check (status in ('offen', 'entfernt', 'bleibt'));

-- Eine Meldung muss bleiben, auch wenn der gemeldete Inhalt gelöscht wird –
-- sie ist die Dokumentation der Entscheidung. Ein Fremdschlüssel auf
-- bewertungen würde sie mitlöschen oder das Löschen verhindern.
do $$
declare r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'meldungen'::regclass and contype = 'f'
  loop
    execute format('alter table meldungen drop constraint %I', r.conname);
    raise notice 'Fremdschlüssel % entfernt', r.conname;
  end loop;
end $$;


-- ── 4. Meldungen und Spam-Log nur für Server-Funktionen ──
-- In meldungen stehen jetzt Namen und E-Mail-Adressen, in submissions_log
-- Prüfwerte von IP-Adressen. Beides darf kein Besucher lesen. Die
-- Funktionen submit und admin arbeiten mit dem Service-Schlüssel und sind
-- davon nicht betroffen.
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['meldungen', 'submissions_log'] loop
    execute format('alter table %I enable row level security', t);
    for r in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on %I', r.policyname, t);
      raise notice 'Regel % auf % entfernt', r.policyname, t;
    end loop;
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;


-- ── 5. Aufräumen: Kontakt von Meldenden nach sechs Monaten löschen ──
create or replace function aufraeumen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Spam-Schutz-Log: Fürs Rate Limit zählt nur die letzte Stunde.
  delete from submissions_log
  where created_at < now() - interval '2 days';

  -- Suchprotokoll: zwölf Monate
  delete from suchanfragen
  where created_at < now() - interval '12 months';

  -- Meldungen: Name und E-Mail nach sechs Monaten weg, die Meldung selbst
  -- bleibt als Dokumentation der Entscheidung
  update meldungen
  set melder_name = null, melder_email = null
  where created_at < now() - interval '6 months'
    and (melder_name is not null or melder_email is not null);
end;
$$;

-- ── 6. Arbeitgeber können sich nicht mehr selbst freigeben ──
-- Befund aus dem Export vom 17.11.: Die Regeln „Firma ändert sich selbst“
-- und „Firma ändert eigene Anzeigen“ erlauben Änderungen an ALLEN Spalten.
-- Ein eingeloggter Arbeitgeber konnte deshalb seine Firma und seine
-- Anzeigen selbst auf freigegeben = true setzen, eine Sperre aufheben und
-- Anzeigen schon freigegeben anlegen. Die Prüfung im Admin-Bereich ließ
-- sich so komplett umgehen.
--
-- Die Trigger greifen nur für Besucher und eingeloggte Arbeitgeber.
-- Admin-Funktion (service_role), SQL-Editor und Zeitpläne sind nicht
-- betroffen.
create or replace function schuetze_freigabe_firma()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.freigegeben := false;
      new.freigegeben_am := null;
      new.gesperrt := false;
    else
      new.freigegeben := old.freigegeben;
      new.freigegeben_am := old.freigegeben_am;
      new.gesperrt := old.gesperrt;
      new.user_id := old.user_id;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists firmen_freigabe_schuetzen on firmen;
create trigger firmen_freigabe_schuetzen
  before insert or update on firmen
  for each row execute function schuetze_freigabe_firma();

-- Anzeigen: Freigabe und Klickzahl darf nur der Admin setzen. Ändert ein
-- Arbeitgeber den Inhalt einer freigegebenen Anzeige, muss sie neu geprüft
-- werden – sonst ließe sich eine harmlose Anzeige freigeben und danach
-- beliebig umschreiben. Ein- und Ausschalten (aktiv) bleibt frei.
create or replace function schuetze_freigabe_stelle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  frei text[] := array['aktiv', 'freigegeben', 'freigegeben_am', 'klicks', 'aktualisiert_am'];
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.freigegeben := false;
      new.freigegeben_am := null;
      new.klicks := 0;
    else
      new.freigegeben := old.freigegeben;
      new.freigegeben_am := old.freigegeben_am;
      new.klicks := old.klicks;
      new.firma_id := old.firma_id;
      if (to_jsonb(new) - frei) is distinct from (to_jsonb(old) - frei) then
        new.freigegeben := false;
        new.freigegeben_am := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists stellen_freigabe_schuetzen on stellenanzeigen;
create trigger stellen_freigabe_schuetzen
  before insert or update on stellenanzeigen
  for each row execute function schuetze_freigabe_stelle();


-- ── 7. Weitere Lücken aus dem Export ──
-- Die Sicht suche_ohne_bewertung war für jeden lesbar: alle Suchbegriffe
-- der letzten 90 Tage. Sie wird nur intern gebraucht.
revoke all on suche_ohne_bewertung from anon, authenticated;

-- aufraeumen() ließ sich von jedem aufrufen. Harmlos, aber unnötig.
revoke execute on function aufraeumen() from public, anon, authenticated;

-- Rechte, die über die Schnittstelle ohnehin nie gebraucht werden
revoke truncate, references, trigger on all tables in schema public from anon, authenticated;


-- Schema neu einlesen, damit die neue Sicht sofort abrufbar ist
notify pgrst, 'reload schema';

-- Kontrolle Teil 1
select
  (select count(*) from bewertungen_oeffentlich) as oeffentlich_sichtbar,
  (select count(*) from bewertungen)            as bewertungen_gesamt,
  has_table_privilege('anon', 'meldungen', 'select')            as fremde_lesen_meldungen,
  has_table_privilege('anon', 'submissions_log', 'select')      as fremde_lesen_spamlog,
  has_table_privilege('anon', 'suche_ohne_bewertung', 'select') as fremde_lesen_suchbegriffe,
  (select count(*) from pg_trigger where tgname in ('firmen_freigabe_schuetzen', 'stellen_freigabe_schuetzen')) as schutz_trigger;
-- Erwartet: beide Zahlen gleich, dreimal false, schutz_trigger = 2



-- ════════════════════════════════════════
-- TEIL 2 – erst ausführen, wenn die neue Seite live ist
-- ════════════════════════════════════════
-- Zum Ausführen: nur den Block ab hier markieren und „Run“ drücken.

/*

-- Bewertungen: Fremde lesen nur noch die Sicht und schreiben gar nicht
-- (geschrieben wird ausschließlich über die Funktion submit).
-- "authenticated" ist dabei, weil eingeloggte Arbeitgeber sonst über ihre
-- Sitzung weiter die Tabelle lesen könnten.
revoke select, insert, update, delete on bewertungen from anon, authenticated;

-- Diskussionen und Antworten: lesen ja, schreiben nur über submit
revoke insert, update, delete on diskussionen, diskussion_antworten from anon, authenticated;

-- „Hilfreich“ läuft jetzt über submit. Der direkte Aufruf aus dem Browser
-- war unbegrenzt und wird gesperrt.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p
           join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'increment_hilfreich'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $$;

notify pgrst, 'reload schema';

-- Kontrolle Teil 2 – erwartet: false, false, true
select
  has_table_privilege('anon', 'bewertungen', 'select')             as fremde_lesen_tabelle,
  has_table_privilege('anon', 'diskussionen', 'insert')            as fremde_schreiben_diskussion,
  has_table_privilege('anon', 'bewertungen_oeffentlich', 'select') as fremde_lesen_sicht;

*/
