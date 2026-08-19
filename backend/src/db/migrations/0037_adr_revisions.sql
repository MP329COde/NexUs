-- Historique des modifications d'une ADR (todo.md item 11 : "historique
-- des modifications") — même principe que wiki_page_revisions
-- (0012_wiki.sql) : une ligne par version précédente, écrite avant
-- écrasement, pas la version courante (déjà dans adrs).
CREATE TABLE IF NOT EXISTS adr_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adr_id UUID NOT NULL REFERENCES adrs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  content TEXT NOT NULL,
  edited_by TEXT NOT NULL,
  edited_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_adr_revisions_adr ON adr_revisions(adr_id, edited_at DESC);
