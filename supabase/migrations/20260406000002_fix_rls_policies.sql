-- Fix RLS: replace USING(true)/WITH CHECK(true) on write operations
-- with auth.uid() IS NOT NULL to prevent unauthenticated writes

DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT tablename, policyname, cmd
    FROM pg_policies
    WHERE schemaname = 'public'
      AND cmd IN ('INSERT', 'UPDATE', 'DELETE')
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
    IF r.cmd = 'INSERT' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL)', r.policyname, r.tablename);
    ELSIF r.cmd = 'UPDATE' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)', r.policyname, r.tablename);
    ELSIF r.cmd = 'DELETE' THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL)', r.policyname, r.tablename);
    END IF;
  END LOOP;
END; $$;
