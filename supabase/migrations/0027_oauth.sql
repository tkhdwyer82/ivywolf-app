-- OAuth 2.1 for the Muse connector (Job F2): a reviewer's client — or any MCP client — connects to /mcp without a
-- pasted key. apps/web is the authorization server; Clerk is how she signs in to it. Ivy issues its own tokens so
-- they can carry Ivy's scopes (ideas:read, ideas:capture), which Clerk's OAuth apps can't, and so they show up and
-- revoke in Connect your Muse next to her keys.
--
--   oauth_clients         who may ask: registered (RFC 7591, /oauth/register) or identified by a client metadata
--                         document URL (CIMD, MCP 2026-07-28). Service role only.
--   oauth_authorizations  one authorization request: made at /oauth/authorize, decided on the consent page, and
--                         exchanged once for tokens at /oauth/token (PKCE S256). Service role only.
--   creator_api_keys      a grant is a key row with a client_id: its hash is the access token's, refresh_hash the
--                         refresh token's (rotated on every refresh), expires_at the access token's expiry. Revoking
--                         the row (Connect your Muse, or /oauth/revoke) ends both.

create table oauth_clients (
  client_id text primary key,                      -- random for registered clients; the https URL for CIMD
  kind text not null check (kind in ('registered', 'metadata_document')),
  client_name text not null check (length(client_name) between 1 and 120),
  client_uri text,
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 10),
  token_endpoint_auth_method text not null default 'none'
    check (token_endpoint_auth_method in ('none', 'client_secret_post', 'client_secret_basic')),
  secret_hash text,                                -- sha256, confidential registered clients only
  metadata jsonb not null default '{}',            -- what the client sent, for audit
  created_at timestamptz not null default now(),
  refreshed_at timestamptz not null default now(), -- CIMD: when the document was last fetched
  check ((token_endpoint_auth_method = 'none') = (secret_hash is null))
);
create index oauth_clients_created_idx on oauth_clients (created_at desc);
alter table oauth_clients enable row level security;

create table oauth_authorizations (
  id uuid primary key default gen_random_uuid(),   -- also the consent page's id: unguessable, bound to her
  creator_id text not null references creators(id) on delete cascade,
  client_id text not null references oauth_clients(client_id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,                    -- S256 only
  requested_scopes text[] not null,
  granted_scopes text[],                           -- what she allowed; null until she decides
  state text,
  resource text,                                   -- RFC 8707, checked against /mcp
  code_hash text unique,                           -- sha256 of the code, set when she allows
  key_id uuid references creator_api_keys(id) on delete set null,  -- the grant the code was exchanged for
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,                 -- the request, then the code
  decided_at timestamptz,
  used_at timestamptz
);
create index oauth_authorizations_creator_idx on oauth_authorizations (creator_id, created_at desc);
alter table oauth_authorizations enable row level security;

alter table creator_api_keys
  add column client_id text references oauth_clients(client_id) on delete cascade,
  add column refresh_hash text unique,
  add column expires_at timestamptz;             -- null for a pasted key: it lasts until revoked

-- She sees which of her keys are sign-ins, from what, and until when; never the refresh hash (0024's grants).
grant select (client_id, expires_at) on creator_api_keys to authenticated;
