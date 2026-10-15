-- ════════════════════════════════════════
-- AUTOMATISCHES AUFRÄUMEN
--
-- Die Datenschutzerklärung nennt Löschfristen. Bisher stand die Löschung
-- nur auskommentiert in supabase-security-setup.sql – passiert ist also
-- nichts, und im Spam-Log lagen Einträge von vor Monaten.
--
-- Dieses Skript macht aus dem Versprechen eine laufende Routine.
-- Arbeitgeber-Inhalte werden bewusst NICHT angefasst: Das sind fremde
-- Daten, deren Löschung nirgends zugesagt ist.
-- ════════════════════════════════════════

create or replace function aufraeumen()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Spam-Schutz-Log: Fürs Rate Limit zählt nur die letzte Stunde.
  -- Alles ab zwei Tagen ist nutzlos – und genau das sagt die
  -- Datenschutzerklärung zu.
  delete from submissions_log
  where created_at < now() - interval '2 days';

  -- Suchprotokoll: ohne Personenbezug, aber nicht für die Ewigkeit nötig.
  -- Zwölf Monate decken Auswertung und Sitemap ab.
  delete from suchanfragen
  where created_at < now() - interval '12 months';
end;
$$;

-- Täglich um 3 Uhr UTC (4 bzw. 5 Uhr deutscher Zeit) – dann ist nichts los
select cron.unschedule('aufraeumen')
where exists (select 1 from cron.job where jobname = 'aufraeumen');

select cron.schedule(
  'aufraeumen',
  '0 3 * * *',
  $$ select aufraeumen(); $$
);

-- Einmal sofort ausführen, damit die Altlasten gleich weg sind
select aufraeumen();

-- Kontrolle
select
  (select count(*) from submissions_log) as spam_log_eintraege,
  (select count(*) from suchanfragen)    as suchanfragen;

select jobname, schedule, active from cron.job order by jobname;
