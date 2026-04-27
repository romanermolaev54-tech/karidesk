-- Temporary debug helper: count tickets visible to a given user under RLS.
-- Allows verification that the new policies match expectations without
-- needing actual JWTs for each role. Service-role caller switches itself
-- to authenticated + a synthetic JWT for the duration of the function.
-- Drop after verification.
CREATE OR REPLACE FUNCTION public.rls_test_count_tickets(test_uid UUID)
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  result BIGINT;
BEGIN
  -- Mimic an authenticated request as `test_uid`.
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', test_uid::text, 'role', 'authenticated')::text,
    true  -- transaction-local: auto-resets on COMMIT/ROLLBACK
  );
  PERFORM set_config('role', 'authenticated', true);

  SELECT count(*) INTO result FROM tickets;

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rls_test_count_tickets(UUID) TO service_role;
