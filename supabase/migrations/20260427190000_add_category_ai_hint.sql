-- Per-category context for the AI description checker.
-- The existing `hint` field is user-facing (shown to magazines when they
-- pick the category). `ai_hint` is consumed only by the DeepSeek prompt —
-- admins can teach the model Kari-specific details ("for lighting: ask
-- which type — LED panel / track / spot / fitting / display window") so
-- the model asks domain-aware questions instead of generic ones.
ALTER TABLE ticket_categories
  ADD COLUMN IF NOT EXISTS ai_hint TEXT;

COMMENT ON COLUMN ticket_categories.ai_hint IS
  'Free-form context fed to the AI description checker prompt. Admin-editable. Hidden from end users.';
