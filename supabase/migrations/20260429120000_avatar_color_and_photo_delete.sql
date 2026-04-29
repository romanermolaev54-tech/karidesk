-- ============================================================================
-- 1. profiles.avatar_color — optional manual override of the contractor's
--    "letter badge" colour. NULL = auto-derived from profiles.id hash on
--    the client (so every contractor still gets a stable colour without admin
--    intervention). Admin can pin a specific colour for their own contractors.
--
-- 2. DELETE policies for ticket_photos + storage.objects so contractors can
--    fix their own mistakes (wrong photo uploaded into completion/act).
--    Rules per the product owner:
--      - admin       → any photo, any time (moderation)
--      - contractor  → only photos they uploaded, only on tickets assigned
--                      to them, at any ticket lifecycle stage
--      - director    → cannot delete (read-only)
--      - employee    → cannot delete photos on existing tickets
--                      (they delete from the local form before submit)
--
--    storage.objects DELETE mirrors the same rules by joining on
--    storage_path = name. We delete the row first, then the blob from the
--    UI; both are guarded so even a tampered client can't remove someone
--    else's evidence.
-- ============================================================================

BEGIN;

-- ---------- profiles.avatar_color ------------------------------------------

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS avatar_color TEXT;

-- We don't enforce a CHECK on the format — admin sets it via a colour-picker
-- UI from a small fixed palette, and the renderer falls back to auto if the
-- value is malformed. Keeping it loose avoids future migrations if we ever
-- expand the palette.

COMMENT ON COLUMN profiles.avatar_color IS
  'Optional override for the contractor letter-badge colour. NULL = auto from id hash. Set by admin via Users → Edit.';

-- ---------- ticket_photos DELETE policy ------------------------------------

DROP POLICY IF EXISTS "ticket_photos_delete" ON ticket_photos;

CREATE POLICY "ticket_photos_delete" ON ticket_photos FOR DELETE TO authenticated
USING (
  public.is_admin()
  OR (
    -- Contractor deleting their own photo on a ticket assigned to them
    public.current_user_role() = 'contractor'
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tickets t
      WHERE t.id = ticket_photos.ticket_id
        AND t.assigned_to = auth.uid()
    )
  )
);

-- ---------- storage.objects DELETE policy ----------------------------------

-- A separate policy specifically for the ticket-photos bucket. We don't touch
-- the existing select/insert policies — they already cover ticket-photos and
-- receipts together. DELETE is gated tighter because deleting evidence is
-- destructive.
DROP POLICY IF EXISTS "Authenticated can delete ticket photos" ON storage.objects;

CREATE POLICY "Authenticated can delete ticket photos" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'ticket-photos'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM ticket_photos tp
      JOIN tickets t ON t.id = tp.ticket_id
      WHERE tp.storage_path = storage.objects.name
        AND tp.uploaded_by = auth.uid()
        AND public.current_user_role() = 'contractor'
        AND t.assigned_to = auth.uid()
    )
  )
);

COMMIT;
