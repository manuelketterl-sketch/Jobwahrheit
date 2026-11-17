-- ════════════════════════════════════════
-- ZEITPLÄNE UND FUNKTIONEN ABSICHERN (17. November 2026)
-- EINGESPIELT am 17.11.2026, Prüfblöcke in versand und benachrichtigung
-- veröffentlicht und getestet
--
-- Befund aus dem Export:
--  - Die Funktionen "versand" und "benachrichtigung" prüfen nicht, wer sie
--    aufruft (JWT-Prüfung aus, keine eigene Prüfung im Code).
--  - "versand" mit {"testlauf": true} gibt die E-Mail-Adressen aller
--    bestätigten Abonnenten zurück. Jeder im Internet konnte sie abrufen.
--  - In den Zeitplänen stehen Schlüssel im Klartext. Der Schlüssel des
--    Tagesberichts ist zudem vertippt („Dsb_…“) – es fiel nur nicht auf,
--    weil die Funktion gar nicht prüft.
--
-- Lösung ohne abgetippte Schlüssel:
--  1. Die Datenbank erzeugt einen Zufallsschlüssel und legt ihn im Vault ab.
--  2. Eine Prüffunktion vergleicht einen übergebenen Schlüssel damit. Nur
--     die Server-Funktionen (service_role) dürfen sie aufrufen.
--  3. Die Zeitpläne holen den Schlüssel aus dem Vault statt Klartext.
--  4. versand und benachrichtigung bekommen eine Prüfung am Anfang
--     (Code: edge-function-zeitplan-schutz.ts). Sie lassen nur noch den
--     Zeitplan und die eigenen Funktionen (submit, admin) durch.
--
-- Reihenfolge: Dieses Skript zuerst, danach die beiden Funktionen mit der
-- Prüfung neu veröffentlichen. Andersherum fällt nur ein Tagesbericht aus.
-- ════════════════════════════════════════

-- 1. Schlüssel erzeugen (nur beim ersten Lauf)
select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'zeitplan_schluessel',
  'Schlüssel für Zeitplan-Aufrufe von versand und benachrichtigung'
)
where not exists (select 1 from vault.secrets where name = 'zeitplan_schluessel');

-- 2. Prüffunktion – nur für Server-Funktionen
create or replace function zeitplan_schluessel_pruefen(k text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from vault.decrypted_secrets
    where name = 'zeitplan_schluessel' and decrypted_secret = k
  );
$$;

revoke execute on function zeitplan_schluessel_pruefen(text) from public, anon, authenticated;
grant execute on function zeitplan_schluessel_pruefen(text) to service_role;

-- 3. Zeitpläne ersetzen (gleicher Name = vorhandener Eintrag wird überschrieben)
select cron.schedule(
  'tagesbericht',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://kvqdgcixmdnrarlaskyb.supabase.co/functions/v1/benachrichtigung',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'zeitplan_schluessel')
    ),
    body := jsonb_build_object('art', 'taeglich')
  );
  $$
);

select cron.schedule(
  'wochennewsletter',
  '0 9 * * 5',
  $$
  select net.http_post(
    url := 'https://kvqdgcixmdnrarlaskyb.supabase.co/functions/v1/versand',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'zeitplan_schluessel')
    ),
    body := '{}'::jsonb
  );
  $$
);

notify pgrst, 'reload schema';

-- Kontrolle – erwartet: true, false, zwei Zeilen ohne „Bearer sb_“ oder „Bearer Dsb_“
select
  exists (select 1 from vault.secrets where name = 'zeitplan_schluessel') as schluessel_da,
  has_function_privilege('anon', 'zeitplan_schluessel_pruefen(text)', 'execute') as fremde_duerfen_pruefen;

select jobname, schedule,
       command ilike '%Bearer sb_%' or command ilike '%Bearer Dsb_%' as klartext_schluessel
from cron.job order by jobname;
