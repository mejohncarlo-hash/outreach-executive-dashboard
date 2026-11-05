"use client";

import { useEffect, useMemo, useState } from "react";
import {
  notionPlacementsDatabaseUrl,
  type ClientProfile,
  type LinkCategory,
  type LinkScanPayload,
  type LinkScanResult,
  type LinkScanStatus,
  type Placement,
  type SupportedWebsite,
} from "../lib/outreach-data";

type ScannerProps = {
  placements: Placement[];
  clients: ClientProfile[];
  supportedWebsites: SupportedWebsite[];
  sessionName: string;
  source: "notion" | "snapshot";
  syncedAt: string;
};

type ReviewedScanResult = LinkScanResult & {
  automatedStatus: LinkScanStatus;
  manualReview?: {
    status: LinkScanStatus;
    reviewedAt: string;
    reviewedBy: string;
  };
};

const statusExplanation: Array<{
  status: LinkScanStatus;
  label: string;
}> = [
  { status: "Active", label: "Expected backlink is live" },
  { status: "Changed", label: "Anchor text or link attributes changed" },
  { status: "Wrong Destination", label: "Backlink points to a different supported website" },
  { status: "Missing", label: "Expected backlink was not found" },
  { status: "Page Unavailable", label: "Placement page could not be reached" },
  { status: "Verify Manually", label: "Automated access was inconclusive" },
];

function normalizeId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

function currency(value: number | null) {
  if (value === null) return "—";
  if (value === 0) return "No cost";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function dateTime(value: string) {
  if (!value) return "Not run yet";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function statusClass(status: LinkScanStatus) {
  return status.toLowerCase().replaceAll(" ", "-");
}

export function SecuredLinkScanner({
  placements,
  clients,
  supportedWebsites,
  sessionName,
  source,
  syncedAt,
}: ScannerProps) {
  const [category, setCategory] = useState<"all" | LinkCategory>("Paid");
  const [websiteId, setWebsiteId] = useState("all");
  const [results, setResults] = useState<ReviewedScanResult[]>([]);
  const [runId, setRunId] = useState("");
  const [checkedAt, setCheckedAt] = useState("");
  const [initiatedBy, setInitiatedBy] = useState("");
  const [scopeLabel, setScopeLabel] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | LinkScanStatus>("all");
  const [expandedId, setExpandedId] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isLoadingShared, setIsLoadingShared] = useState(true);
  const [savingReviewId, setSavingReviewId] = useState("");
  const [message, setMessage] = useState("");

  const clientById = useMemo(
    () => new Map(clients.map((client) => [normalizeId(client.id), client])),
    [clients],
  );
  const websiteById = useMemo(
    () =>
      new Map(
        supportedWebsites.map((website) => [normalizeId(website.id), website]),
      ),
    [supportedWebsites],
  );
  const securedPlacements = useMemo(
    () =>
      placements.filter(
        (placement) =>
          placement.status === "Link Secured" &&
          Boolean(placement.resultUrl) &&
          (category === "all" || placement.linkCategory === category) &&
          (websiteId === "all" ||
            normalizeId(placement.supportedWebsiteId) === normalizeId(websiteId)),
      ),
    [category, placements, websiteId],
  );
  const monitoredValue = securedPlacements.reduce(
    (sum, placement) => sum + (placement.approvedCost ?? 0),
    0,
  );
  const flagged = results.filter((result) => result.status !== "Active").length;
  const resultCounts = useMemo(
    () =>
      Object.fromEntries(
        statusExplanation.map(({ status }) => [
          status,
          results.filter((result) => result.status === status).length,
        ]),
      ) as Record<LinkScanStatus, number>,
    [results],
  );
  const filteredResults = useMemo(
    () =>
      resultFilter === "all"
        ? results
        : results.filter((result) => result.status === resultFilter),
    [resultFilter, results],
  );

  useEffect(() => {
    let active = true;
    async function loadSharedScan() {
      try {
        const response = await fetch("/api/link-scan");
        const payload = (await response.json()) as LinkScanPayload;
        if (!response.ok) throw new Error(payload.error || "Unable to load shared scan results.");
        if (!active) return;
        setRunId(payload.runId ?? "");
        setCheckedAt(payload.checkedAt ?? "");
        setInitiatedBy(payload.initiatedBy ?? "");
        setScopeLabel(payload.scopeLabel ?? "");
        setResults(
          (payload.results ?? []).map((result) => ({
            ...result,
            automatedStatus: result.automatedStatus ?? result.status,
          })),
        );
      } catch (error) {
        if (active) {
          setMessage(error instanceof Error ? error.message : "Unable to load shared scan results.");
        }
      } finally {
        if (active) setIsLoadingShared(false);
      }
    }
    void loadSharedScan();
    return () => {
      active = false;
    };
  }, []);

  async function runScan() {
    setIsScanning(true);
    setMessage("");
    setExpandedId("");
    setResultFilter("all");
    try {
      const candidates = securedPlacements.map((placement) => {
        const client = clientById.get(normalizeId(placement.clientId));
        const website = websiteById.get(normalizeId(placement.supportedWebsiteId));
        return {
          placementId: placement.id,
          placementName: placement.name,
          placementNotionUrl: placement.notionUrl,
          clientName: client?.name ?? "Unknown placement source",
          supportedWebsiteName: website?.name ?? "Unknown supported website",
          linkCategory: placement.linkCategory,
          approvedCost: placement.approvedCost,
          sourceUrl: placement.resultUrl,
          expectedWebsiteUrl: website?.websiteUrl ?? "",
          expectedAnchorText: placement.proposedAnchorText,
        };
      });
      const response = await fetch("/api/link-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidates,
          knownSupportedWebsites: supportedWebsites
            .filter((website) => website.active && website.websiteUrl)
            .map((website) => ({
              name: website.name,
              websiteUrl: website.websiteUrl,
            })),
        }),
      });
      const payload = (await response.json()) as LinkScanPayload;
      if (!response.ok) throw new Error(payload.error || "Link scan failed.");
      setResults(
        (payload.results ?? []).map((result) => ({
          ...result,
          automatedStatus: result.automatedStatus ?? result.status,
        })),
      );
      setRunId(payload.runId ?? "");
      setCheckedAt(payload.checkedAt);
      setInitiatedBy(payload.initiatedBy ?? sessionName);
      setScopeLabel(payload.scopeLabel ?? "");
      setMessage(
        `${payload.results.length} secured ${payload.results.length === 1 ? "placement" : "placements"} checked and shared.`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Link scan failed.");
    } finally {
      setIsScanning(false);
    }
  }

  async function applyManualReview(
    placementId: string,
    status: LinkScanStatus,
  ) {
    if (!runId) {
      setMessage("Run or load a shared scan before recording manual verification.");
      return;
    }
    setSavingReviewId(placementId);
    setMessage("");
    try {
      const response = await fetch("/api/link-scan", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId, placementId, status }),
      });
      const payload = (await response.json()) as {
        error?: string;
        status?: LinkScanStatus;
        reviewedAt?: string;
        reviewedBy?: string;
      };
      if (!response.ok || !payload.status || !payload.reviewedAt || !payload.reviewedBy) {
        throw new Error(payload.error || "Unable to save the manual verification.");
      }
      setResults((current) =>
        current.map((result) =>
          result.placementId === placementId
            ? {
                ...result,
                status: payload.status as LinkScanStatus,
                checkedAt: payload.reviewedAt as string,
                summary: `Manually confirmed as ${payload.status} by ${payload.reviewedBy}.`,
                manualReview: {
                  status: payload.status as LinkScanStatus,
                  reviewedAt: payload.reviewedAt as string,
                  reviewedBy: payload.reviewedBy as string,
                },
              }
            : result,
        ),
      );
      setMessage(`Manual verification saved as ${status} and shared with Coordinator and Executive.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the manual verification.");
    } finally {
      setSavingReviewId("");
    }
  }

  return (
    <main className="app-shell scanner-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">OA</span>
          <span><strong>Outreach Authority</strong><small>Communication HQ</small></span>
        </div>
        <nav className="nav" aria-label="Dashboard navigation">
          <a className="nav-link" href="/"><span aria-hidden="true">◫</span> Overview</a>
          <a className="nav-link" href="/#decisions"><span aria-hidden="true">◇</span> Decisions</a>
          <a className="nav-link" href="/#pipeline"><span aria-hidden="true">↗</span> Placement Pipeline</a>
          <a className="nav-link" href="/#websites"><span aria-hidden="true">◎</span> Supported Websites</a>
          <a className="nav-link is-active" href="/link-scanner"><span aria-hidden="true">⌁</span> Link Scanner</a>
          <a className="nav-link" href="/#activity"><span aria-hidden="true">≋</span> Activity</a>
        </nav>
        <div className="sidebar-spacer" />
        <div className="source-card">
          <div className="source-heading">
            <span className={`sync-dot ${source === "notion" ? "is-live" : ""}`} aria-hidden="true" />
            <strong>{source === "notion" ? "Notion live" : "Notion snapshot"}</strong>
          </div>
          <p>Scanning secured placement URLs against their expected supported websites.</p>
          <a href={notionPlacementsDatabaseUrl} target="_blank" rel="noreferrer">Open working database ↗</a>
        </div>
        <div className="profile">
          <span className="avatar" aria-hidden="true">✓</span>
          <span><strong>{sessionName || "Private workspace"}</strong><small>Authorized access</small></span>
          <a className="sign-out" href="/signout">Sign out</a>
        </div>
      </aside>

      <section className="workspace scanner-workspace">
        <header className="topbar scanner-topbar">
          <div>
            <p className="eyebrow">Link protection</p>
            <h1>Secured Link Scanner</h1>
            <p className="subtitle">Confirm paid and exchanged authority placements remain live, intact and reviewable.</p>
          </div>
          <div className="sync-label"><span>Notion data refreshed</span><strong>{dateTime(syncedAt)}</strong></div>
        </header>

        <section className="scanner-control-panel">
          <div>
            <span className="scanner-kicker">Manual protection scan</span>
            <h2>Check secured placements</h2>
            <p>Runs a live check against the recorded result URL and expected supported website. Paid placements are selected by default.</p>
          </div>
          <div className="scanner-controls">
            <label><span>Link category</span><select value={category} onChange={(event) => setCategory(event.target.value as "all" | LinkCategory)}><option value="Paid">Paid only</option><option value="Free">Free / exchange</option><option value="all">All secured</option></select></label>
            <label><span>Supported website</span><select value={websiteId} onChange={(event) => setWebsiteId(event.target.value)}><option value="all">All websites</option>{supportedWebsites.filter((website) => website.active).map((website) => <option key={website.id} value={website.id}>{website.name}</option>)}</select></label>
            <button className="button scanner-run-button" type="button" disabled={isScanning || securedPlacements.length === 0} onClick={() => void runScan()}>{isScanning ? "Scanning live pages…" : `Run scan (${securedPlacements.length})`}</button>
          </div>
        </section>

        <section className="scanner-metrics" aria-label="Scanner summary">
          <article><span>Secured URLs in scope</span><strong>{securedPlacements.length}</strong><small>Current Notion records with result URLs</small></article>
          <article><span>Protected paid value</span><strong>{currency(monitoredValue)}</strong><small>Recorded placement investment in scope</small></article>
          <article className={flagged > 0 ? "has-alert" : ""}><span>Requires review</span><strong>{results.length ? flagged : "—"}</strong><small>Anything other than confirmed Active</small></article>
          <article><span>Last shared scan</span><strong className="metric-date">{dateTime(checkedAt)}</strong><small>{isLoadingShared ? "Loading shared results…" : initiatedBy ? `${initiatedBy} · ${scopeLabel || "secured placements"}` : "No shared scan recorded"}</small></article>
        </section>

        <section className="panel scanner-logic-panel">
          <div className="panel-heading">
            <div><p className="eyebrow">Result logic</p><h2>How scan outcomes are classified</h2></div>
            {resultFilter !== "all" && (
              <button
                className="scanner-all-results-button"
                type="button"
                onClick={() => {
                  setResultFilter("all");
                  setExpandedId("");
                }}
              >
                ← Back to All Results <span>{results.length}</span>
              </button>
            )}
          </div>
          <div className="scanner-logic-grid">
            {statusExplanation.map((item) => (
              <button
                className={`scanner-logic-card ${resultFilter === item.status ? "is-selected" : ""}`}
                key={item.status}
                type="button"
                aria-pressed={resultFilter === item.status}
                aria-controls="scanner-results"
                onClick={() => {
                  setResultFilter(item.status);
                  setExpandedId("");
                }}
              >
                <span className="scanner-logic-card-topline">
                  <span className={`scan-status ${statusClass(item.status)}`}>{item.status}</span>
                  <strong className="scanner-result-count" aria-label={`${resultCounts[item.status]} results`}>{resultCounts[item.status]}</strong>
                </span>
                <span className="scanner-logic-description">{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel scanner-results-panel" id="scanner-results">
          <div className="panel-heading">
            <div><p className="eyebrow">Protection results</p><h2>{resultFilter === "all" ? "Secured placement health" : `${resultFilter} placements`}</h2></div>
            <div className="scanner-results-heading-actions">
              {results.length > 0 && <span className="scanner-filter-summary">Showing {filteredResults.length} of {results.length}</span>}
              {message && <span className="scanner-message" role="status">{message}</span>}
            </div>
          </div>
          {results.length === 0 ? (
            <div className="scanner-empty"><span aria-hidden="true">⌁</span><div><strong>{isLoadingShared ? "Loading shared results" : "No shared scan results yet"}</strong><p>{isLoadingShared ? "Retrieving the latest team-visible scan." : "Choose the scope and run a scan to create the first shared result set."}</p></div></div>
          ) : filteredResults.length === 0 ? (
            <div className="scanner-empty"><span aria-hidden="true">0</span><div><strong>No {resultFilter} results</strong><p>The latest shared scan has no placements in this classification. Use Back to All Results to restore the complete table.</p></div></div>
          ) : (
            <div className="table-wrap scanner-table-wrap">
              <table className="scanner-table">
                <thead><tr><th>Placement</th><th>Supported Website</th><th>Category</th><th>Investment</th><th>Scan Result</th><th>Affected Link</th><th>Checked</th></tr></thead>
                <tbody>
                  {filteredResults.map((result) => {
                    const expanded = expandedId === result.placementId;
                    return [
                      <tr key={result.placementId} className={result.status === "Active" ? "" : "scan-row-alert"}>
                        <td><strong>{result.placementName}</strong><span>{result.clientName}</span></td>
                        <td>{result.supportedWebsiteName}</td>
                        <td><span className={`category-pill ${result.linkCategory.toLowerCase()}`}>{result.linkCategory}</span></td>
                        <td>{currency(result.approvedCost)}</td>
                        <td><span className={`scan-status ${statusClass(result.status)}`}>{result.status}</span>{result.manualReview && <span className="manual-result-label">Manually verified</span>}<small className="scan-summary">{result.summary}</small></td>
                        <td><button className="affected-count" type="button" aria-expanded={expanded} onClick={() => setExpandedId(expanded ? "" : result.placementId)}>{result.affectedLinks.length}</button></td>
                        <td>{dateTime(result.checkedAt)}</td>
                      </tr>,
                      expanded ? (
                        <tr className="affected-detail-row" key={`${result.placementId}-details`}>
                          <td colSpan={7}>
                            <div className="affected-detail">
                              <div className="affected-detail-heading"><strong>Affected links for manual review</strong><span>HTTP {result.httpStatus ?? "not available"}</span></div>
                              {result.affectedLinks.map((link, index) => (
                                <article key={`${result.placementId}-${index}`}>
                                  <span className="affected-number">{index + 1}</span>
                                  <div><small>Source placement</small><a href={link.sourceUrl} target="_blank" rel="noreferrer">{link.sourceUrl} ↗</a></div>
                                  <div><small>Expected destination</small><a href={link.expectedWebsiteUrl} target="_blank" rel="noreferrer">{link.expectedWebsiteUrl || "Not recorded"} ↗</a></div>
                                  <div><small>Found link / anchor</small><p>{link.foundUrl || "No matching link found"}{link.anchorText ? ` · “${link.anchorText}”` : ""}</p></div>
                                  <p className="affected-note">{link.note}</p>
                                </article>
                              ))}
                              {result.status !== "Active" && (
                                <div className="manual-review-actions">
                                  <div>
                                    <small>Manual verification</small>
                                    <strong>Correct the scan result after opening and checking the placement.</strong>
                                    <p>The correction is saved to the shared scanner record and becomes visible to Coordinator and Executive. Update the Notion placement record when the supported website or result URL is wrong.</p>
                                  </div>
                                  <div className="manual-review-buttons">
                                    <a className="button button-light" href={result.placementNotionUrl} target="_blank" rel="noreferrer">Open placement record ↗</a>
                                    <button className="button manual-active" type="button" disabled={savingReviewId === result.placementId} onClick={() => void applyManualReview(result.placementId, "Active")}>Confirm Active</button>
                                    <button className="button manual-changed" type="button" disabled={savingReviewId === result.placementId} onClick={() => void applyManualReview(result.placementId, "Changed")}>Confirm Changed</button>
                                    <button className="button manual-wrong" type="button" disabled={savingReviewId === result.placementId} onClick={() => void applyManualReview(result.placementId, "Wrong Destination")}>Confirm Wrong Destination</button>
                                    <button className="button manual-missing" type="button" disabled={savingReviewId === result.placementId} onClick={() => void applyManualReview(result.placementId, "Missing")}>Confirm Missing</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      ) : null,
                    ];
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
