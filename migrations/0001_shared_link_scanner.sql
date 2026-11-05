CREATE TABLE IF NOT EXISTS link_scan_runs (
  run_id TEXT PRIMARY KEY,
  checked_at TEXT NOT NULL,
  scope_label TEXT NOT NULL,
  initiated_by_email TEXT NOT NULL,
  initiated_by_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS link_scan_results (
  run_id TEXT NOT NULL,
  placement_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  automated_status TEXT NOT NULL,
  current_status TEXT NOT NULL,
  manual_reviewed_by TEXT,
  manual_reviewed_at TEXT,
  PRIMARY KEY (run_id, placement_id),
  FOREIGN KEY (run_id) REFERENCES link_scan_runs(run_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_link_scan_runs_checked_at
ON link_scan_runs(checked_at DESC);

CREATE INDEX IF NOT EXISTS idx_link_scan_results_placement_id
ON link_scan_results(placement_id);
