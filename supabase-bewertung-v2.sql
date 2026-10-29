-- ════════════════════════════════════════
-- BEWERTUNGSFORMULAR v2 (Oktober 2026)
--
-- 1. "Wie viel davon hat sich bestätigt?" ist jetzt ein Schieberegler
--    1–10 statt fünf Sterne. Die alte Prüfung erlaubte nur 1–5.
-- 2. Neue Spalte für Sonderzahlungen (Weihnachts-/Urlaubsgeld,
--    Gewinnbeteiligung, Bonus) – gemessen in Monatsgehältern,
--    in halben Schritten von 0 bis 6.
--    null = keine Angabe, 0 = ausdrücklich keine Sonderzahlungen.
--
-- Bei der Umstellung gab es zwei echte Bewertungen auf der alten
-- 1–5-Skala. Die werden mal zwei genommen (3/5 → 6/10), das erhält
-- die Aussage. Das passiert nur, solange die alte 1–5-Regel noch
-- existiert – ein zweiter Lauf des Skripts verdoppelt also nichts.
-- ════════════════════════════════════════

do $$
declare
  r record;
  alte_skala boolean := false;
begin
  for r in
    select con.conname, pg_get_constraintdef(con.oid) as regel
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'bewertungen'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%bewertung_erwartung%'
  loop
    if r.regel like '%5%' and r.regel not like '%10%' then
      alte_skala := true;
    end if;
    execute format('alter table bewertungen drop constraint %I', r.conname);
  end loop;

  if alte_skala then
    update bewertungen
      set bewertung_erwartung = bewertung_erwartung * 2
      where bewertung_erwartung is not null;
    raise notice 'Erwartungswerte von 1–5 auf 1–10 umgerechnet (mal 2)';
  end if;
end $$;

alter table bewertungen
  add constraint bewertungen_bewertung_erwartung_check
  check (bewertung_erwartung between 1 and 10);

-- Sonderzahlungen
alter table bewertungen
  add column if not exists bonus_monatsgehaelter numeric(3,1);

alter table bewertungen
  drop constraint if exists bewertungen_bonus_monatsgehaelter_check;
alter table bewertungen
  add constraint bewertungen_bonus_monatsgehaelter_check
  check (bonus_monatsgehaelter is null
         or (bonus_monatsgehaelter between 0 and 6
             and bonus_monatsgehaelter * 2 = floor(bonus_monatsgehaelter * 2)));

comment on column bewertungen.bewertung_erwartung is
  'Wie viel der Erwartung hat sich bestätigt, 1–10 (Schieberegler)';
comment on column bewertungen.bonus_monatsgehaelter is
  'Sonderzahlungen pro Jahr in Monatsgehältern (0–6, halbe Schritte); null = keine Angabe';

-- Kontrolle nachher: Regeln und die umgerechneten Bewertungen
select
  (select string_agg(conname || ': ' || pg_get_constraintdef(oid), '  |  ' order by conname)
     from pg_constraint
     where conrelid = 'bewertungen'::regclass and contype = 'c'
       and conname in ('bewertungen_bewertung_erwartung_check', 'bewertungen_bonus_monatsgehaelter_check')) as regeln,
  (select string_agg(beruf_name || ' = ' || bewertung_erwartung, '  |  ' order by created_at)
     from bewertungen) as erwartung_je_bewertung;
