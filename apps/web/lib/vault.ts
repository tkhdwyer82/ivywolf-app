// apps/web/lib/vault.ts
// Supabase Vault helpers for storing/retrieving adapter credentials.
// Calls SECURITY DEFINER wrapper functions via the service-role client (see supabase/migrations/0003_vault.sql).
// Only works with the service_role key — never call from client-side.
//
// Lifted verbatim from gamesfield-app lib/vault.ts per docs/lift-list.md ("zero coupling").
// Only change: the shared admin client from lib/supabase.ts replaces a second inline createClient,
// and "platform" is named "adapter" to match the Ivy vocabulary.

import { supabaseAdmin } from './supabase'

/**
 * Build the canonical Vault secret name for an adapter credential.
 * Pattern: adapter_cred_{creatorId}_{adapterSlug}
 */
export function vaultSecretName(creatorId: string, adapterSlug: string): string {
  return `adapter_cred_${creatorId}_${adapterSlug}`
}

/**
 * Store (or update) a secret in Supabase Vault.
 * Returns the Vault secret UUID.
 */
export async function storeSecret(
  name: string,
  secret: string,
  description = ''
): Promise<string> {
  const { data, error } = await supabaseAdmin().rpc('vault_store_secret', {
    p_name: name,
    p_secret: secret,
    p_description: description,
  })

  if (error) throw new Error(`Vault store failed: ${error.message}`)
  return data as string
}

/**
 * Retrieve a decrypted secret from Supabase Vault by name.
 * Returns null if the secret doesn't exist.
 */
export async function getSecret(name: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin().rpc('vault_get_secret', {
    p_name: name,
  })

  if (error) throw new Error(`Vault read failed: ${error.message}`)
  return (data as string) || null
}

/**
 * Delete a secret from Supabase Vault by name.
 */
export async function deleteSecret(name: string): Promise<void> {
  const { error } = await supabaseAdmin().rpc('vault_delete_secret', {
    p_name: name,
  })

  if (error) throw new Error(`Vault delete failed: ${error.message}`)
}
