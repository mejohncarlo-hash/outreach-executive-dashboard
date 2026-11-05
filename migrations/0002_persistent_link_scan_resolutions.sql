CREATE TABLE IF NOT EXISTS link_scan_resolutions (
  placement_id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL,
  expected_website_url TEXT NOT NULL,
  resolved_status TEXT NOT NULL,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
