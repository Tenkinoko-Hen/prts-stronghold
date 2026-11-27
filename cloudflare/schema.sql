CREATE TABLE IF NOT EXISTS releases (
  product TEXT NOT NULL CHECK (product IN ('stronghold', 'telemetry')),
  platform TEXT NOT NULL CHECK (platform IN ('win', 'android')),
  channel TEXT NOT NULL CHECK (channel IN ('stable', 'beta')),
  manifest_json TEXT NOT NULL CHECK (json_valid(manifest_json)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (product, platform, channel)
);

CREATE TABLE IF NOT EXISTS comps (
  id TEXT PRIMARY KEY NOT NULL,
  uploader_id TEXT NOT NULL,
  comp_json TEXT NOT NULL CHECK (json_valid(comp_json)),
  warning_flag INTEGER NOT NULL DEFAULT 0 CHECK (warning_flag IN (0, 1)),
  report_count INTEGER NOT NULL DEFAULT 0 CHECK (report_count >= 0),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible', 'hidden')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS comps_status_created ON comps (status, created_at DESC);
CREATE INDEX IF NOT EXISTS comps_uploader_created ON comps (uploader_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comp_votes (
  comp_id TEXT NOT NULL REFERENCES comps (id) ON DELETE CASCADE,
  voter_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('upvote', 'report')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (comp_id, voter_id, kind)
);

CREATE INDEX IF NOT EXISTS comp_votes_comp_kind ON comp_votes (comp_id, kind);

CREATE TABLE IF NOT EXISTS rate_limits (
  uploader_id TEXT NOT NULL,
  day TEXT NOT NULL,
  upload_count INTEGER NOT NULL DEFAULT 0 CHECK (upload_count >= 0),
  PRIMARY KEY (uploader_id, day)
);

CREATE INDEX IF NOT EXISTS rate_limits_day ON rate_limits (day);
