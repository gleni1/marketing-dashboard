-- Webhook log table for debugging GHL payloads
-- Insert-only, stores raw JSON payloads

CREATE TABLE webhook_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'ghl',
  contact_id text,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  error text
);

-- Index for looking up by contact_id
CREATE INDEX webhook_log_contact_id_idx ON webhook_log(contact_id);

-- Index for finding unprocessed logs
CREATE INDEX webhook_log_processed_idx ON webhook_log(processed) WHERE NOT processed;

-- No RLS needed - this is server-only via service role key
