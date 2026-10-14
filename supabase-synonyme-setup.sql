-- ════════════════════════════════════════
-- SUCHBEGRIFFE, DIE KEIN BERUF SIND
--
-- "Schadensachbearbeiter" ist keine Berufsbezeichnung der Klassifikation,
-- aber 52 Stellenanzeigen heißen so. Die Bundesagentur ordnet sie dem
-- Beruf "Versicherungskaufmann/-frau" zu.
--
-- Diese Zuordnung sammeln wir hier ein, damit die Suche sie beim nächsten
-- Mal sofort kennt und die Jobbörse nicht erneut fragen muss.
--
-- WICHTIG: Bewusst eine eigene Tabelle, NICHT die Tabelle "berufe".
-- Stünde "Schadensachbearbeiter" dort als Zeile, würde das Wort sofort
-- als vermeintliche Spezialisierung auf den Berufsseiten auftauchen.
-- ════════════════════════════════════════

create table if not exists berufs_synonyme (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default now(),
  aktualisiert timestamp with time zone default now(),

  -- Wonach gesucht wurde, klein geschrieben als Schlüssel
  begriff text not null,
  begriff_lower text not null,

  -- Was die Jobbörse dazu als Beruf führt
  hauptberuf text not null,

  -- Unser Beruf aus der Tabelle "berufe", falls die Zuordnung geklappt hat.
  -- Bleibt leer, wenn die Schreibweisen zu weit auseinanderliegen –
  -- dann ist die Zeile ein Hinweis für die manuelle Nacharbeit.
  beruf_name text,

  -- Wie viele Stellenanzeigen es zu dem Begriff gab
  stellen integer default 0,

  -- Wie oft dieser Begriff schon gesucht wurde
  gesucht integer default 1,

  unique (begriff_lower)
);

create index if not exists idx_synonyme_begriff on berufs_synonyme(begriff_lower);
create index if not exists idx_synonyme_offen
  on berufs_synonyme(gesucht desc) where beruf_name is null;

alter table berufs_synonyme enable row level security;

-- Lesen darf jeder (die Suche fragt die Tabelle ab).
-- Geschrieben wird ausschließlich über die submit-Function mit Service-Role.
drop policy if exists "synonyme lesen" on berufs_synonyme;
create policy "synonyme lesen" on berufs_synonyme for select using (true);


-- ════════════════════════════════════════
-- AUSWERTUNG fürs Admin-Board:
-- Welche Begriffe suchen Leute, die wir noch keinem Beruf zuordnen konnten?
-- Das ist die Liste, die du von Hand nachpflegen willst.
-- ════════════════════════════════════════
create or replace view synonyme_ohne_zuordnung as
select begriff, hauptberuf, stellen, gesucht, aktualisiert
from berufs_synonyme
where beruf_name is null
order by gesucht desc, stellen desc;

revoke all on synonyme_ohne_zuordnung from anon, authenticated;


-- Kontrolle
select count(*) as eintraege from berufs_synonyme;
