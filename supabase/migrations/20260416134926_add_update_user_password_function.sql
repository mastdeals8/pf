/*
  # Add update_user_password helper function

  Creates a security definer function to update a user's password hash directly
  in auth.users. This bypasses GoTrue's admin API which has issues with users
  created via SQL.
*/

CREATE OR REPLACE FUNCTION update_user_password(p_user_id uuid, p_password_hash text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = p_password_hash,
      updated_at = now()
  WHERE id = p_user_id;
END;
$$;