-- ============================================================
-- Vault helper functions
-- Thin SECURITY DEFINER wrappers so the service-role client can
-- reach Supabase Vault via rpc().
-- Only service_role can call these — public access revoked.
--
-- Lifted verbatim from gamesfield-app
-- (supabase/migrations/20260526130000_vault_helper_functions.sql)
-- per docs/lift-list.md "Take verbatim". Bodies unchanged.
-- ============================================================

-- Store or update a secret in Vault
CREATE OR REPLACE FUNCTION public.vault_store_secret(
  p_name TEXT,
  p_secret TEXT,
  p_description TEXT DEFAULT ''
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;

  IF v_id IS NOT NULL THEN
    PERFORM vault.update_secret(v_id, p_secret, p_name, p_description);
    RETURN v_id;
  ELSE
    RETURN vault.create_secret(p_secret, p_name, p_description);
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_store_secret(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_store_secret(TEXT, TEXT, TEXT) TO service_role;

-- Retrieve a decrypted secret by name
CREATE OR REPLACE FUNCTION public.vault_get_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name;

  RETURN v_secret;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_get_secret(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_get_secret(TEXT) TO service_role;

-- Delete a secret by name
CREATE OR REPLACE FUNCTION public.vault_delete_secret(p_name TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = p_name;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.vault_delete_secret(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vault_delete_secret(TEXT) TO service_role;
