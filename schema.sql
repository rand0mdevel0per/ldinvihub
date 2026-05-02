-- Linux.do 邀请链接分享站 D1 schema

CREATE TABLE IF NOT EXISTS invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  submitter_fp TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  used_at INTEGER,
  used_by_fp TEXT,
  used_by_request_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_invites_unused ON invites(used, id) WHERE used = 0;
CREATE INDEX IF NOT EXISTS idx_invites_submitter ON invites(submitter_fp, created_at);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fp TEXT NOT NULL,
  text TEXT NOT NULL,
  score INTEGER,
  reason TEXT,
  violations TEXT,
  status TEXT NOT NULL,
  invite_id INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_requests_fp_time ON requests(fp, created_at);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status, created_at);
