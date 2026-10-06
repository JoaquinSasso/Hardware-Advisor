CREATE TYPE turn_role AS ENUM ('user', 'assistant', 'tool');
CREATE TYPE event_type AS ENUM ('cart_added', 'whatsapp_clicked');

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  session_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, session_id)
);
CREATE INDEX conversations_last_message_at_idx ON conversations (last_message_at);

CREATE TABLE conversation_turns (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq int NOT NULL CHECK (seq >= 1),
  role turn_role NOT NULL,
  payload jsonb NOT NULL CHECK (payload->>'role' = role::text),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, seq)
);

CREATE TABLE recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  requirements jsonb NOT NULL,
  builds jsonb NOT NULL,
  cheapest_valid_total_cents bigint NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE recommendation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  type event_type NOT NULL,
  build_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
