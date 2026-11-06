
-- these include things that prisma cannot express.
--
-- How to use
--   1. npx prisma migrate dev --create-only --name db_hardening
--   2. Paste this file's contents into the generated migration.sql
--   3. npx prisma migrate dev
--   4. Run `npx prisma migrate dev` once more and confirm it proposes no DROP of the
--      indexes below. If it does, move them into a post-migrate step.

-- Emails are stored lowercase
ALTER TABLE users ADD CONSTRAINT users_email_lowercase CHECK (email = lower(email));

-- Exactly one current assignment per ticket
CREATE UNIQUE INDEX ticket_assignments_one_current
  ON ticket_assignments (ticket_id) WHERE unassigned_at IS NULL;

-- Rejected tickets must carry a reason; resolved tickets must carry a resolution
ALTER TABLE tickets ADD CONSTRAINT tickets_rejection_reason_required
  CHECK (status <> 'REJECTED' OR rejection_reason IS NOT NULL);
ALTER TABLE tickets ADD CONSTRAINT tickets_resolution_required
  CHECK (status NOT IN ('RESOLVED','CLOSED') OR resolution IS NOT NULL);

-- Fast lookups for live credentials only
CREATE INDEX refresh_tokens_live_idx
  ON refresh_tokens (session_id) WHERE used_at IS NULL AND revoked_at IS NULL;
CREATE INDEX sessions_live_idx
  ON sessions (user_id) WHERE revoked_at IS NULL;

-- Fuzzy title search for ticket lists
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX tickets_title_trgm_idx ON tickets USING gin (title gin_trgm_ops);

-- Append-only audit log
CREATE OR REPLACE FUNCTION audit_logs_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update_delete
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_immutable();
