CREATE TABLE IF NOT EXISTS agents (
  username     TEXT PRIMARY KEY,
  keycloak_id  TEXT,
  mxid         TEXT NOT NULL UNIQUE,
  full_name    TEXT NOT NULL,
  email        TEXT NOT NULL,
  ministry     TEXT NOT NULL,
  job_title    TEXT NOT NULL DEFAULT '',
  clearance    INTEGER NOT NULL DEFAULT 0,
  role         TEXT NOT NULL DEFAULT 'agent',
  status       TEXT NOT NULL DEFAULT 'active',
  created_by   TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ,
  revoked_by   TEXT,
  revoke_reason TEXT
);

CREATE TABLE IF NOT EXISTS rooms (
  room_id     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  level       TEXT NOT NULL,
  ttl_ms      BIGINT,
  ministry    TEXT,
  created_by  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  seq        BIGINT PRIMARY KEY,
  ts         TEXT NOT NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  target     TEXT,
  details    TEXT NOT NULL,
  prev_hash  TEXT NOT NULL,
  hash       TEXT NOT NULL
);
