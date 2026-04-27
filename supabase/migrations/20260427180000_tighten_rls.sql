-- ============================================================================
-- Tighten Row-Level Security on tickets and related tables.
--
-- Until now, the original init.sql had permissive `USING (true)` policies on
-- tickets / ticket_photos / ticket_messages / ticket_history. The React UI
-- already filtered by division_id / store_id / assigned_to, but a determined
-- user could bypass the UI and pull every row by hitting PostgREST directly.
--
-- This migration replaces those policies with role-aware ones that mirror the
-- UI scoping at the database level:
--   - admin       → all rows
--   - director    → tickets in their own division_id
--   - employee    → tickets they created or that belong to their store_id
--   - contractor  → tickets assigned to them
--
-- INSERT policies are left untouched (they already check the right thing:
-- created_by = auth.uid() / sender_id = auth.uid() / uploaded_by = auth.uid()).
--
-- Service-role calls (server-side API routes) bypass RLS, so server flows
-- like push delivery, role updates, and Excel exports are unaffected.
-- ============================================================================

BEGIN;

-- ---------- Helper functions ------------------------------------------------
-- All marked STABLE + SECURITY DEFINER so they can:
--   - read profiles regardless of caller's RLS visibility
--   - be cached by the planner within a single query (no N+1 lookups)

CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT role FROM profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.current_user_division() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT division_id FROM profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.current_user_store() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT store_id FROM profiles WHERE id = auth.uid(); $$;

CREATE OR REPLACE FUNCTION public.is_admin() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'); $$;

GRANT EXECUTE ON FUNCTION public.current_user_role()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_division() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_store()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin()              TO authenticated;

-- ---------- tickets ---------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated can read tickets"   ON tickets;
DROP POLICY IF EXISTS "Authenticated can update tickets" ON tickets;
DROP POLICY IF EXISTS "tickets_select" ON tickets;
DROP POLICY IF EXISTS "tickets_update" ON tickets;

CREATE POLICY "tickets_select" ON tickets FOR SELECT TO authenticated
USING (
  public.is_admin()
  OR (
    public.current_user_role() = 'director'
    AND division_id = public.current_user_division()
  )
  OR (
    public.current_user_role() = 'employee'
    AND (
      created_by = auth.uid()
      OR (public.current_user_store() IS NOT NULL AND store_id = public.current_user_store())
    )
  )
  OR (
    public.current_user_role() = 'contractor'
    AND assigned_to = auth.uid()
  )
);

CREATE POLICY "tickets_update" ON tickets FOR UPDATE TO authenticated
USING (
  public.is_admin()
  OR (
    public.current_user_role() = 'director'
    AND division_id = public.current_user_division()
  )
  OR (
    public.current_user_role() = 'employee'
    AND (
      created_by = auth.uid()
      OR (public.current_user_store() IS NOT NULL AND store_id = public.current_user_store())
    )
  )
  OR (
    public.current_user_role() = 'contractor'
    AND assigned_to = auth.uid()
  )
)
WITH CHECK (
  public.is_admin()
  OR (
    public.current_user_role() = 'director'
    AND division_id = public.current_user_division()
  )
  OR (
    public.current_user_role() = 'employee'
    AND (
      created_by = auth.uid()
      OR (public.current_user_store() IS NOT NULL AND store_id = public.current_user_store())
    )
  )
  OR (
    public.current_user_role() = 'contractor'
    AND assigned_to = auth.uid()
  )
);

-- ---------- ticket_photos ---------------------------------------------------

DROP POLICY IF EXISTS "Authenticated can read photos" ON ticket_photos;
DROP POLICY IF EXISTS "ticket_photos_select" ON ticket_photos;

CREATE POLICY "ticket_photos_select" ON ticket_photos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_photos.ticket_id
      AND (
        public.is_admin()
        OR (public.current_user_role() = 'director' AND t.division_id = public.current_user_division())
        OR (public.current_user_role() = 'employee' AND (t.created_by = auth.uid() OR (public.current_user_store() IS NOT NULL AND t.store_id = public.current_user_store())))
        OR (public.current_user_role() = 'contractor' AND t.assigned_to = auth.uid())
      )
  )
);

-- ---------- ticket_messages -------------------------------------------------

DROP POLICY IF EXISTS "Authenticated can read messages" ON ticket_messages;
DROP POLICY IF EXISTS "ticket_messages_select" ON ticket_messages;

CREATE POLICY "ticket_messages_select" ON ticket_messages FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_messages.ticket_id
      AND (
        public.is_admin()
        OR (public.current_user_role() = 'director' AND t.division_id = public.current_user_division())
        OR (public.current_user_role() = 'employee' AND (t.created_by = auth.uid() OR (public.current_user_store() IS NOT NULL AND t.store_id = public.current_user_store())))
        OR (public.current_user_role() = 'contractor' AND t.assigned_to = auth.uid())
      )
  )
);

-- ---------- ticket_history --------------------------------------------------

DROP POLICY IF EXISTS "Authenticated can read history" ON ticket_history;
DROP POLICY IF EXISTS "ticket_history_select" ON ticket_history;

CREATE POLICY "ticket_history_select" ON ticket_history FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM tickets t
    WHERE t.id = ticket_history.ticket_id
      AND (
        public.is_admin()
        OR (public.current_user_role() = 'director' AND t.division_id = public.current_user_division())
        OR (public.current_user_role() = 'employee' AND (t.created_by = auth.uid() OR (public.current_user_store() IS NOT NULL AND t.store_id = public.current_user_store())))
        OR (public.current_user_role() = 'contractor' AND t.assigned_to = auth.uid())
      )
  )
);

-- ---------- push_subscriptions (had no RLS at all) --------------------------

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subs_select_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subs_insert_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subs_update_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_subs_delete_own" ON push_subscriptions;

CREATE POLICY "push_subs_select_own" ON push_subscriptions FOR SELECT TO authenticated
USING (user_id = auth.uid());
CREATE POLICY "push_subs_insert_own" ON push_subscriptions FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subs_update_own" ON push_subscriptions FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "push_subs_delete_own" ON push_subscriptions FOR DELETE TO authenticated
USING (user_id = auth.uid());

COMMIT;
