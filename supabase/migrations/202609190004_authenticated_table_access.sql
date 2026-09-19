-- RLS policies filter rows but do not grant access to their tables. Make the
-- hosted adapter's permissions explicit instead of relying on project-specific
-- default privileges or grants made manually in the dashboard.
grant usage on schema public to authenticated;
grant select, insert, update, delete
  on table public.profiles, public.entities
  to authenticated;

-- Existing owner-only RLS policies remain in force. No anonymous table access
-- or access to auth.users is granted by this migration.
