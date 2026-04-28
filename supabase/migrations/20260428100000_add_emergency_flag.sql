-- Reframe "what counts as срочное?" away from a magazine-controlled priority
-- and into an emergency flag the admin owns.
--
-- Why: magazines were marking everything as priority='urgent', so the
-- "Срочные" tile on the dashboard became meaningless. Real emergencies
-- (затопление / упала роллета / безопасность) belong to the «Аварийные
-- работы» category, and admin should be able to flip the flag manually on
-- any other ticket too.
--
-- Plan:
--   - ticket_categories.is_emergency  →  default emergency status for tickets
--                                        created in this category (admin-toggled
--                                        in /admin/categories).
--   - tickets.is_emergency            →  per-ticket override, defaults from the
--                                        category at creation. Admin can
--                                        manually toggle on any ticket.
--
-- Existing data is left intact (per user's "Variant A" choice). priority=urgent
-- rows stay as-is; admin can decide later which of them are actually emergencies
-- and flip the flag.

-- ----- Categories -------------------------------------------------------------
ALTER TABLE ticket_categories
  ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN ticket_categories.is_emergency IS
  'When TRUE, tickets created in this category default to is_emergency=true. Admin-editable in /admin/categories.';

-- Mark the "Аварийные работы" category as the default emergency category. We
-- match by name (case-insensitive, trimmed). If the category was renamed or
-- doesn't exist, this just no-ops — admin can flip the flag manually.
UPDATE ticket_categories
   SET is_emergency = TRUE
 WHERE LOWER(TRIM(name)) IN (
   'аварийные работы',
   'аварийная работа',
   'аварии'
 );

-- ----- Tickets -----------------------------------------------------------------
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS is_emergency BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN tickets.is_emergency IS
  'Per-ticket emergency flag. Defaults to category.is_emergency at creation, but admin can flip on any ticket.';

CREATE INDEX IF NOT EXISTS idx_tickets_emergency_active
  ON tickets(is_emergency, status)
  WHERE is_emergency = TRUE;

-- Backfill: tickets that already belong to an emergency category should be
-- flagged retroactively, so the dashboard tile reflects truth from day one.
UPDATE tickets t
   SET is_emergency = TRUE
  FROM ticket_categories c
 WHERE t.category_id = c.id
   AND c.is_emergency = TRUE
   AND t.is_emergency = FALSE;
