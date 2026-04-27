-- Drop the temporary RLS verification helper. Verification complete:
--   admins see all 8/8 tickets,
--   directors see exactly the tickets in their division,
--   employees see only their own + their store,
--   contractors see only assigned tickets.
DROP FUNCTION IF EXISTS public.rls_test_count_tickets(UUID);
