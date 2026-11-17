-- ════════════════════════════════════════
-- SCHLÜSSEL FÜR IP-PRÜFWERTE IM VAULT (17. November 2026)
--
-- Die Funktionen submit und admin bilden Prüfwerte von IP-Adressen mit
-- HMAC. Den Schlüssel holen sie aus dem Supabase-Secret IP_HASH_SECRET –
-- oder, wenn das fehlt, über diese Funktion aus dem Vault. So muss niemand
-- einen Schlüssel erzeugen und abtippen.
--
-- EINGESPIELT am 17.11.2026
-- ════════════════════════════════════════

select vault.create_secret(
  replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  'ip_pruefwert_schluessel',
  'HMAC-Schlüssel für IP-Prüfwerte (Rate Limits in submit und admin)'
)
where not exists (select 1 from vault.secrets where name = 'ip_pruefwert_schluessel');

create or replace function ip_pruefwert_schluessel()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'ip_pruefwert_schluessel';
$$;

revoke execute on function ip_pruefwert_schluessel() from public, anon, authenticated;
grant execute on function ip_pruefwert_schluessel() to service_role;

notify pgrst, 'reload schema';
