import {
  fallbackClients,
  fallbackPlacements,
  fallbackStatusEvents,
  fallbackSupportedWebsites,
  type ClientProfile,
  type DecisionOutcome,
  type EntityGroup,
  type InvoiceStatus,
  type LinkCategory,
  type Placement,
  type PlacementStatus,
  type PlacementType,
  type StatusEvent,
  type SupportedWebsite,
} from "../lib/outreach-data";

type RichTextItem = { plain_text?: string };
type NotionProperty = {
  id?: string;
  title?: RichTextItem[];
  rich_text?: RichTextItem[];
  select?: { name?: string } | null;
  multi_select?: Array<{ name?: string }>;
  number?: number | null;
  formula?: { number?: number | null; string?: string | null } | null;
  rollup?: {
    type?: string;
    array?: NotionProperty[];
    string?: string | null;
  } | null;
  checkbox?: boolean;
  relation?: Array<{ id?: string }>;
  has_more?: boolean;
  people?: Array<{ name?: string }>;
  url?: string | null;
  email?: string | null;
  date?: { start?: string } | null;
  created_time?: string;
  last_edited_time?: string;
};

type NotionPropertyItem = {
  relation?: { id?: string };
};

type NotionPropertyItemPayload = {
  has_more?: boolean;
  next_cursor?: string | null;
  results?: NotionPropertyItem[];
  relation?: { id?: string };
};

type NotionPage = {
  id?: string;
  url?: string;
  created_time?: string;
  last_edited_time?: string;
  properties?: Record<string, NotionProperty>;
};

type NotionQueryPayload = {
  has_more?: boolean;
  next_cursor?: string | null;
  results?: NotionPage[];
};

type NotionComment = {
  id?: string;
  created_time?: string;
  rich_text?: RichTextItem[];
};

type NotionCommentPayload = {
  has_more?: boolean;
  next_cursor?: string | null;
  results?: NotionComment[];
};

type AssetsBinding = {
  fetch(request: Request): Promise<Response>;
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
};

interface Env {
  ASSETS: AssetsBinding;
  LINK_SCANNER_DB?: D1Database;
  AUTH_USERS?: string;
  AUTH_USER_EXECUTIVE?: string;
  AUTH_ADMIN_EMAIL?: string;
  SESSION_SECRET?: string;
  NOTION_API_TOKEN?: string;
  NOTION_DATA_SOURCE_ID?: string;
  NOTION_PLACEMENTS_DATA_SOURCE_ID?: string;
  NOTION_SUPPORTED_WEBSITES_DATA_SOURCE_ID?: string;
  NOTION_STATUS_HISTORY_DATA_SOURCE_ID?: string;
}

type AuthUser = {
  email: string;
  name: string;
  password: string;
};

type Session = {
  email: string;
  name: string;
  expiresAt: number;
};

type ReviewAction = "approve" | "decline";

const sessionCookie = "__Host-outreach_session";
const sessionLengthSeconds = 8 * 60 * 60;
const encoder = new TextEncoder();

function textValue(property?: NotionProperty) {
  return (property?.rich_text ?? property?.title ?? [])
    .map((item) => item.plain_text ?? "")
    .join("")
    .trim();
}

function selectValue(property?: NotionProperty) {
  return property?.select?.name ?? "";
}

function multiSelectValue(property?: NotionProperty) {
  return (property?.multi_select ?? [])
    .map((item) => item.name ?? "")
    .filter(Boolean);
}

function placementTypeValue(value: string): PlacementType {
  const allowed: PlacementType[] = [
    "Link Insert",
    "Guest Post",
    "Social Media",
    "Link Exchange",
  ];
  return allowed.includes(value as PlacementType)
    ? (value as PlacementType)
    : "Link Insert";
}

function placementStatusValue(value: string): PlacementStatus {
  const allowed: PlacementStatus[] = [
    "Negotiating",
    "Pending Internal Review",
    "Approved to Proceed",
    "Submitted",
    "Link Secured",
    "Declined",
  ];
  return allowed.includes(value as PlacementStatus)
    ? (value as PlacementStatus)
    : "Negotiating";
}

function decisionValue(value: string): DecisionOutcome {
  const allowed: DecisionOutcome[] = [
    "Pending Executive Review",
    "Coordinator-Approved",
    "Executive-Approved (Escalated)",
    "Executive-Declined (Escalated)",
    "Disqualified",
    "",
  ];
  return allowed.includes(value as DecisionOutcome)
    ? (value as DecisionOutcome)
    : "";
}

function invoiceStatusValue(value: string): InvoiceStatus {
  if (value === "Not Recorded") return "Not Requested";
  if (value === "Awaiting Invoice") return "Authorized to Request";
  if (
    value === "Ready for Review" ||
    value === "Invoice Received" ||
    value === "Return for Clarification" ||
    value === "Approved for Payment"
  ) {
    return "Invoice Received — Payment Due";
  }
  const allowed: InvoiceStatus[] = [
    "Not Requested",
    "N/A — Free",
    "Authorized to Request",
    "Invoice Received — Payment Due",
    "Paid",
    "",
  ];
  return allowed.includes(value as InvoiceStatus)
    ? (value as InvoiceStatus)
    : "";
}

function linkCategoryValue(value: string): LinkCategory {
  return value === "Paid" ? "Paid" : "Free";
}

function relationId(property?: NotionProperty) {
  return property?.relation?.[0]?.id ?? "";
}

function relationIds(property?: NotionProperty) {
  return (property?.relation ?? [])
    .map((relation) => relation.id ?? "")
    .filter(Boolean);
}

function rollupSelectValue(property?: NotionProperty) {
  const first = property?.rollup?.array?.[0];
  return first?.select?.name ?? property?.rollup?.string ?? "";
}

function formulaTextValue(property?: NotionProperty) {
  return property?.formula?.string?.trim() ?? "";
}

function notionIdKey(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

function dateValue(property?: NotionProperty) {
  return property?.date?.start?.slice(0, 10) ?? "";
}

function entityGroupValue(value: string): EntityGroup {
  const allowed: EntityGroup[] = [
    "Example Services Group",
    "Example Property Group",
    "Example Realty Group",
  ];
  return allowed.includes(value as EntityGroup)
    ? (value as EntityGroup)
    : "Example Services Group";
}

function mapClient(page: NotionPage): ClientProfile {
  const properties = page.properties ?? {};
  const commercialModels = multiSelectValue(properties["Commercial Models"])
    .filter((value): value is LinkCategory =>
      value === "Free" || value === "Paid",
    );
  const availablePlacementTypes = multiSelectValue(
    properties["Available Placement Types"],
  ).filter((value): value is PlacementType =>
    ["Link Insert", "Guest Post", "Social Media", "Link Exchange"].includes(
      value,
    ),
  );
  return {
    id: page.id ?? crypto.randomUUID(),
    name:
      textValue(properties["Client / Website"]) || "Untitled client profile",
    websiteUrl: properties["Website URL"]?.url ?? "",
    notionUrl: page.url ?? "",
    domainRating: properties["Domain Rating"]?.number ?? null,
    estimatedTraffic: properties["Estimated Traffic"]?.number ?? null,
    organicKeywords: properties["Organic Keywords"]?.number ?? null,
    commercialModels,
    availablePlacementTypes,
    offerTerms: textValue(properties["Offer Terms"]),
    pricingNotes: textValue(properties["Pricing Notes"]),
    relationshipOwner: selectValue(properties["Relationship Owner"]) || "Coordinator",
    primaryContact: textValue(properties["Primary Contact"]),
    contactEmail: properties["Contact Email"]?.email ?? "",
    costLinkInsert: properties["Quoted Cost (Link Insert)"]?.number ?? null,
    costGuestPost: properties["Quoted Cost (Guest Post)"]?.number ?? null,
    costSocialMedia: properties["Quoted Cost (Social Media)"]?.number ?? null,
    costLinkExchange:
      properties["Quoted Cost (Link Exchange)"]?.number ?? null,
    dateAdded: dateValue(properties["Date Added"]),
    lastUpdated:
      properties["Last Updated"]?.last_edited_time ??
      page.last_edited_time ??
      "",
  };
}

function mapPlacement(
  page: NotionPage,
  executiveDecisionComment = "",
  executiveDecisionCommentAt = "",
): Placement {
  const properties = page.properties ?? {};
  return {
    id: page.id ?? crypto.randomUUID(),
    name: textValue(properties.Placement) || "Untitled placement",
    notionUrl: page.url ?? "",
    clientId: relationId(properties.Client),
    supportedWebsiteId: relationId(properties["Supported Website"]),
    type: placementTypeValue(selectValue(properties["Placement Type"])),
    linkCategory: linkCategoryValue(selectValue(properties["Link Category"])),
    status: placementStatusValue(selectValue(properties.Status)),
    decision: decisionValue(selectValue(properties.Decision)),
    approvedCost: properties["Approved Cost"]?.number ?? null,
    invoiceStatus: invoiceStatusValue(
      selectValue(properties["Invoice Status"]),
    ),
    invoiceLink: properties["Invoice Link"]?.url ?? "",
    submissionRound: properties["Submission Round"]?.number ?? null,
    nextAction: textValue(properties["Next Action"]),
    resultUrl: properties["Result / Backlink"]?.url ?? "",
    owner: selectValue(properties.Owner) || "Coordinator",
    outcomeNotes: textValue(properties["Outcome Notes"]),
    proposedAnchorText: textValue(properties["Proposed Anchor Text"]),
    decisionPrecedent:
      properties["Decision Precedent"]?.checkbox ?? false,
    precedentNotes: textValue(properties["Precedent Notes"]),
    statusEffectiveDate: dateValue(properties["Status Effective Date"]),
    dateAdded: dateValue(properties["Date Added"]),
    lastUpdated:
      properties["Last Updated"]?.last_edited_time ??
      page.last_edited_time ??
      "",
    executiveDecisionComment,
    executiveDecisionCommentAt,
  };
}

function mapSupportedWebsite(page: NotionPage): SupportedWebsite {
  const properties = page.properties ?? {};
  return {
    id: page.id ?? crypto.randomUUID(),
    name:
      textValue(properties["Supported Website"]) || "Untitled supported website",
    websiteUrl: properties["Website URL"]?.url ?? "",
    notionUrl: page.url ?? "",
    entityGroup: entityGroupValue(selectValue(properties["Entity Group"])),
    entityCode: selectValue(properties["Entity Code"]),
    active: properties.Active?.checkbox ?? false,
  };
}

function mapStatusEvent(page: NotionPage): StatusEvent {
  const properties = page.properties ?? {};
  const previousStatusValue = selectValue(properties["Previous Status"]);
  return {
    id: page.id ?? crypto.randomUUID(),
    notionUrl: page.url ?? "",
    name: textValue(properties["Status Event"]) || "Status change",
    placementId: relationId(properties.Placement),
    previousStatus: previousStatusValue
      ? placementStatusValue(previousStatusValue)
      : "",
    newStatus: placementStatusValue(selectValue(properties["New Status"])),
    statusEffectiveAt: dateValue(properties["Status Effective At"]),
    loggedAt: page.created_time ?? "",
    changedBy:
      (properties["Changed By"]?.people ?? [])
        .map((person) => person.name ?? "")
        .filter(Boolean)
        .join(", "),
    eventKey: textValue(properties["Event Key"]),
  };
}

function json(payload: unknown) {
  return Response.json(payload, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseAuthUsers(value?: string) {
  try {
    const parsed = JSON.parse(value ?? "[]") as AuthUser | AuthUser[];
    const users = Array.isArray(parsed) ? parsed : [parsed];
    return users
      .filter(
        (user) =>
          typeof user.email === "string" &&
          typeof user.name === "string" &&
          typeof user.password === "string" &&
          user.email.includes("@") &&
          user.password.length >= 16,
      )
      .map((user) => ({
        ...user,
        email: user.email.trim().toLowerCase(),
      }));
  } catch {
    return [];
  }
}

function authUsers(env: Env) {
  const users = [
    ...parseAuthUsers(env.AUTH_USERS),
    ...parseAuthUsers(env.AUTH_USER_EXECUTIVE),
  ];
  return [...new Map(users.map((user) => [user.email, user])).values()];
}

function isExecutive(session: Session) {
  return session.email.trim().toLowerCase() === "executive@example.com";
}

function isAdmin(session: Session, env: Env) {
  return (
    session.email.trim().toLowerCase() ===
    (env.AUTH_ADMIN_EMAIL ?? "admin@example.com").trim().toLowerCase()
  );
}

function canRunLinkScanner(session: Session, env: Env) {
  const email = session.email.trim().toLowerCase();
  return (
    isAdmin(session, env) ||
    email === "executive@example.com" ||
    email === "coordinator@example.com"
  );
}

type LinkScanCandidate = {
  placementId: string;
  placementName: string;
  placementNotionUrl: string;
  clientName: string;
  supportedWebsiteName: string;
  linkCategory: LinkCategory;
  approvedCost: number | null;
  sourceUrl: string;
  expectedWebsiteUrl: string;
  expectedAnchorText: string;
};

type KnownSupportedWebsite = {
  name: string;
  websiteUrl: string;
};

function safePublicUrl(value: unknown) {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (
      hostname === "localhost" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.endsWith(".internal") ||
      hostname === "0.0.0.0" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

function comparableHost(value: URL) {
  return value.hostname.toLowerCase().replace(/^www\./, "");
}

function plainAnchorText(value: string) {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function attributeValue(tag: string, name: string) {
  const match = tag.match(
    new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i"),
  );
  return (match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim();
}

async function scanCandidate(
  candidate: LinkScanCandidate,
  knownSupportedWebsites: KnownSupportedWebsite[],
) {
  const checkedAt = new Date().toISOString();
  const sourceUrl = safePublicUrl(candidate.sourceUrl);
  const expectedUrl = safePublicUrl(candidate.expectedWebsiteUrl);
  const base = {
    placementId: candidate.placementId,
    placementName: candidate.placementName,
    placementNotionUrl: candidate.placementNotionUrl,
    clientName: candidate.clientName,
    supportedWebsiteName: candidate.supportedWebsiteName,
    linkCategory: candidate.linkCategory,
    approvedCost: candidate.approvedCost,
    sourceUrl: candidate.sourceUrl,
    expectedWebsiteUrl: candidate.expectedWebsiteUrl,
    checkedAt,
  };
  const expectedLink = {
    sourceUrl: candidate.sourceUrl,
    expectedWebsiteUrl: candidate.expectedWebsiteUrl,
    foundUrl: "",
    anchorText: "",
    rel: "",
    note: "Open the source placement and verify the expected backlink manually.",
  };

  if (!sourceUrl || !expectedUrl) {
    return {
      ...base,
      status: "Verify Manually" as const,
      affectedLinks: [expectedLink],
      httpStatus: null,
      summary: "A valid result URL or supported website URL is not recorded.",
    };
  }

  try {
    const response = await fetch(sourceUrl.toString(), {
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Portfolio-Secured-Link-Scanner/1.0",
      },
      signal: AbortSignal.timeout(12_000),
    });
    const finalUrl = safePublicUrl(response.url);
    if (!finalUrl) throw new Error("The placement redirected to a restricted URL.");
    if (response.status === 403 || response.status === 429) {
      return {
        ...base,
        status: "Verify Manually" as const,
        affectedLinks: [expectedLink],
        httpStatus: response.status,
        summary: "The publisher blocked or rate-limited automated access.",
      };
    }
    if (!response.ok) {
      return {
        ...base,
        status: "Page Unavailable" as const,
        affectedLinks: [expectedLink],
        httpStatus: response.status,
        summary: `The recorded placement page returned HTTP ${response.status}.`,
      };
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {
        ...base,
        status: "Verify Manually" as const,
        affectedLinks: [expectedLink],
        httpStatus: response.status,
        summary: "The placement URL did not return an HTML page.",
      };
    }

    const html = (await response.text()).slice(0, 2_000_000);
    const targetHost = comparableHost(expectedUrl);
    const pageLinks: Array<{
      sourceUrl: string;
      expectedWebsiteUrl: string;
      foundUrl: string;
      anchorText: string;
      rel: string;
      note: string;
      host: string;
    }> = [];
    const anchorPattern = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
    for (const anchorTag of html.match(anchorPattern) ?? []) {
      const href = attributeValue(anchorTag, "href");
      if (!href) continue;
      let foundUrl: URL;
      try {
        foundUrl = new URL(href, finalUrl);
      } catch {
        continue;
      }
      const foundHost = comparableHost(foundUrl);
      const rel = attributeValue(anchorTag, "rel");
      const anchorText = plainAnchorText(anchorTag);
      pageLinks.push({
        sourceUrl: sourceUrl.toString(),
        expectedWebsiteUrl: expectedUrl.toString(),
        foundUrl: foundUrl.toString(),
        anchorText,
        rel,
        host: foundHost,
        note: rel
          ? `Backlink found with rel="${rel}".`
          : "Backlink found and available for manual verification.",
      });
    }

    const matches = pageLinks
      .filter(
        (link) =>
          link.host === targetHost || link.host.endsWith(`.${targetHost}`),
      )
      .map(({ host: _host, ...link }) => link);

    if (matches.length === 0) {
      const alternateDestination = knownSupportedWebsites
        .map((website) => {
          const websiteUrl = safePublicUrl(website.websiteUrl);
          return websiteUrl
            ? { ...website, host: comparableHost(websiteUrl) }
            : null;
        })
        .filter((website): website is KnownSupportedWebsite & { host: string } =>
          Boolean(website && website.host !== targetHost),
        )
        .map((website) => ({
          website,
          link: pageLinks.find(
            (link) =>
              link.host === website.host || link.host.endsWith(`.${website.host}`),
          ),
        }))
        .find((item) => Boolean(item.link));

      if (alternateDestination?.link) {
        const { host: _host, ...affectedLink } = alternateDestination.link;
        return {
          ...base,
          status: "Wrong Destination" as const,
          affectedLinks: [
            {
              ...affectedLink,
              note: `Wrong destination: this backlink points to ${alternateDestination.website.name}, not ${candidate.supportedWebsiteName}.`,
            },
          ],
          httpStatus: response.status,
          summary: `Backlink found, but it points to ${alternateDestination.website.name} instead of ${candidate.supportedWebsiteName}.`,
        };
      }

      return {
        ...base,
        status: "Missing" as const,
        affectedLinks: [
          {
            ...expectedLink,
            note: "No link to the expected supported website was found in the live page HTML.",
          },
        ],
        httpStatus: response.status,
        summary: "The source page is live, but the expected backlink is missing.",
      };
    }

    const expectedAnchor = candidate.expectedAnchorText.trim().toLowerCase();
    const anchorChanged =
      Boolean(expectedAnchor) &&
      !matches.some((match) => match.anchorText.toLowerCase() === expectedAnchor);
    const attributeChanged = matches.some((match) =>
      /\b(?:nofollow|sponsored|ugc)\b/i.test(match.rel),
    );
    const changed = anchorChanged || attributeChanged;
    return {
      ...base,
      status: changed ? ("Changed" as const) : ("Active" as const),
      affectedLinks: matches,
      httpStatus: response.status,
      summary: changed
        ? anchorChanged
          ? "The backlink is live, but the recorded anchor text no longer matches."
          : "The backlink is live, but its rel attributes require review."
        : "The expected backlink is live on the recorded placement page.",
    };
  } catch (error) {
    return {
      ...base,
      status: "Page Unavailable" as const,
      affectedLinks: [expectedLink],
      httpStatus: null,
      summary:
        error instanceof Error && error.name === "TimeoutError"
          ? "The placement page did not respond within 12 seconds."
          : "The placement page could not be reached by the scanner.",
    };
  }
}

const manualLinkScanStatuses = new Set([
  "Active",
  "Changed",
  "Wrong Destination",
  "Missing",
]);

type StoredManualResolution = {
  placement_id: string;
  source_url: string;
  expected_website_url: string;
  resolved_status: string;
  reviewed_by: string;
  reviewed_at: string;
};

function normalizedScanUrl(value: unknown) {
  if (typeof value !== "string") return "";
  const parsed = safePublicUrl(value);
  if (!parsed) return value.trim();
  parsed.hash = "";
  return parsed.toString();
}

function scanTarget(result: Record<string, unknown>) {
  const affectedLinks = Array.isArray(result.affectedLinks)
    ? result.affectedLinks
    : [];
  const firstAffectedLink = affectedLinks[0];
  const fallbackExpectedUrl =
    firstAffectedLink && typeof firstAffectedLink === "object"
      ? (firstAffectedLink as Record<string, unknown>).expectedWebsiteUrl
      : "";
  return {
    sourceUrl: normalizedScanUrl(result.sourceUrl),
    expectedWebsiteUrl: normalizedScanUrl(
      result.expectedWebsiteUrl ?? fallbackExpectedUrl,
    ),
  };
}

async function ensureLinkScannerSchema(database: D1Database) {
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS link_scan_runs (
      run_id TEXT PRIMARY KEY,
      checked_at TEXT NOT NULL,
      scope_label TEXT NOT NULL,
      initiated_by_email TEXT NOT NULL,
      initiated_by_name TEXT NOT NULL
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS link_scan_results (
      run_id TEXT NOT NULL,
      placement_id TEXT NOT NULL,
      result_json TEXT NOT NULL,
      automated_status TEXT NOT NULL,
      current_status TEXT NOT NULL,
      manual_reviewed_by TEXT,
      manual_reviewed_at TEXT,
      PRIMARY KEY (run_id, placement_id),
      FOREIGN KEY (run_id) REFERENCES link_scan_runs(run_id) ON DELETE CASCADE
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS link_scan_resolutions (
      placement_id TEXT PRIMARY KEY,
      source_url TEXT NOT NULL,
      expected_website_url TEXT NOT NULL,
      resolved_status TEXT NOT NULL,
      reviewed_by TEXT NOT NULL,
      reviewed_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS idx_link_scan_runs_checked_at ON link_scan_runs(checked_at DESC)",
    ),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS idx_link_scan_results_placement_id ON link_scan_results(placement_id)",
    ),
  ]);
}

async function applyStoredManualResolutions(
  database: D1Database,
  results: Array<Record<string, unknown>>,
) {
  await ensureLinkScannerSchema(database);
  const stored = await database
    .prepare(
      "SELECT placement_id, source_url, expected_website_url, resolved_status, reviewed_by, reviewed_at FROM link_scan_resolutions",
    )
    .all<StoredManualResolution>();
  const resolutionByPlacement = new Map(
    (stored.results ?? []).map((resolution) => [
      resolution.placement_id,
      resolution,
    ]),
  );
  const stalePlacementIds = new Set<string>();
  const resolvedResults = results.map((result) => {
    const placementId = String(result.placementId ?? "");
    const automatedStatus = String(result.status ?? "");
    const resolution = resolutionByPlacement.get(placementId);
    if (!resolution) return result;

    const target = scanTarget(result);
    const sameTarget =
      target.sourceUrl === resolution.source_url &&
      target.expectedWebsiteUrl === resolution.expected_website_url;
    if (!sameTarget) {
      stalePlacementIds.add(placementId);
      return result;
    }

    if (
      automatedStatus === "Changed" ||
      automatedStatus === "Wrong Destination" ||
      automatedStatus === "Missing" ||
      automatedStatus === "Page Unavailable"
    ) {
      stalePlacementIds.add(placementId);
      return result;
    }

    if (
      automatedStatus !== "Verify Manually" ||
      !manualLinkScanStatuses.has(resolution.resolved_status)
    ) {
      return result;
    }

    return {
      ...result,
      automatedStatus,
      status: resolution.resolved_status,
      manualReview: {
        status: resolution.resolved_status,
        reviewedAt: resolution.reviewed_at,
        reviewedBy: resolution.reviewed_by,
      },
      summary: `Automated access remains inconclusive. Retained the manual ${resolution.resolved_status} confirmation recorded by ${resolution.reviewed_by}.`,
    };
  });

  if (stalePlacementIds.size > 0) {
    await database.batch(
      [...stalePlacementIds].map((placementId) =>
        database
          .prepare("DELETE FROM link_scan_resolutions WHERE placement_id = ?")
          .bind(placementId),
      ),
    );
  }
  return resolvedResults;
}

async function persistLinkScan(
  database: D1Database,
  session: Session,
  results: Array<Record<string, unknown>>,
) {
  await ensureLinkScannerSchema(database);
  const runId = crypto.randomUUID();
  const checkedAt = new Date().toISOString();
  const paidCount = results.filter((result) => result.linkCategory === "Paid").length;
  const freeCount = results.length - paidCount;
  const scopeLabel = [
    paidCount ? `${paidCount} paid` : "",
    freeCount ? `${freeCount} free/exchange` : "",
  ].filter(Boolean).join(" + ") || "No placements";
  await database
    .prepare(
      "INSERT INTO link_scan_runs (run_id, checked_at, scope_label, initiated_by_email, initiated_by_name) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(runId, checkedAt, scopeLabel, session.email, session.name)
    .run();
  if (results.length > 0) {
    await database.batch(
      results.map((result) =>
        database
          .prepare(
            "INSERT INTO link_scan_results (run_id, placement_id, result_json, automated_status, current_status, manual_reviewed_by, manual_reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
          )
          .bind(
            runId,
            result.placementId,
            JSON.stringify(result),
            result.automatedStatus ?? result.status,
            result.status,
            result.manualReview &&
              typeof result.manualReview === "object"
              ? (result.manualReview as Record<string, unknown>).reviewedBy ?? null
              : null,
            result.manualReview &&
              typeof result.manualReview === "object"
              ? (result.manualReview as Record<string, unknown>).reviewedAt ?? null
              : null,
          ),
      ),
    );
  }
  return { runId, checkedAt, scopeLabel };
}

async function latestSharedLinkScan(database: D1Database) {
  await ensureLinkScannerSchema(database);
  const run = await database
    .prepare(
      "SELECT run_id, checked_at, scope_label, initiated_by_name FROM link_scan_runs ORDER BY checked_at DESC LIMIT 1",
    )
    .first<{
      run_id: string;
      checked_at: string;
      scope_label: string;
      initiated_by_name: string;
    }>();
  if (!run) {
    return {
      runId: "",
      checkedAt: "",
      initiatedBy: "",
      scopeLabel: "",
      results: [],
    };
  }
  const rows = await database
    .prepare(
      "SELECT placement_id, result_json, automated_status, current_status, manual_reviewed_by, manual_reviewed_at FROM link_scan_results WHERE run_id = ? ORDER BY rowid",
    )
    .bind(run.run_id)
    .all<{
      placement_id: string;
      result_json: string;
      automated_status: string;
      current_status: string;
      manual_reviewed_by: string | null;
      manual_reviewed_at: string | null;
    }>();
  const results = (rows.results ?? []).flatMap((row) => {
    try {
      const result = JSON.parse(row.result_json) as Record<string, unknown>;
      return [{
        ...result,
        status: row.current_status,
        automatedStatus: row.automated_status,
        ...(row.manual_reviewed_at && row.manual_reviewed_by
          ? {
              manualReview: {
                status: row.current_status,
                reviewedAt: row.manual_reviewed_at,
                reviewedBy: row.manual_reviewed_by,
              },
              summary:
                row.automated_status === "Verify Manually"
                  ? `Automated access remains inconclusive. Retained the manual ${row.current_status} confirmation recorded by ${row.manual_reviewed_by}.`
                  : `Manually confirmed as ${row.current_status} by ${row.manual_reviewed_by}.`,
            }
          : {}),
      }];
    } catch {
      return [];
    }
  });
  return {
    runId: run.run_id,
    checkedAt: run.checked_at,
    initiatedBy: run.initiated_by_name,
    scopeLabel: run.scope_label,
    results,
  };
}

async function handleManualLinkReview(
  request: Request,
  env: Env,
  session: Session,
) {
  if (!canRunLinkScanner(session, env)) {
    return Response.json({ error: "Link Scanner access is restricted." }, { status: 403 });
  }
  const database = env.LINK_SCANNER_DB;
  if (!database) {
    return Response.json({ error: "Shared scan storage is unavailable." }, { status: 503 });
  }
  let body: { runId?: unknown; placementId?: unknown; status?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid manual review request." }, { status: 400 });
  }
  if (
    typeof body.runId !== "string" ||
    typeof body.placementId !== "string" ||
    typeof body.status !== "string" ||
    !manualLinkScanStatuses.has(body.status)
  ) {
    return Response.json({ error: "Select a valid manual scan result." }, { status: 400 });
  }
  await ensureLinkScannerSchema(database);
  const savedResult = await database
    .prepare(
      "SELECT result_json FROM link_scan_results WHERE run_id = ? AND placement_id = ?",
    )
    .bind(body.runId, body.placementId)
    .first<{ result_json: string }>();
  if (!savedResult) {
    return Response.json({ error: "The selected scan result no longer exists." }, { status: 404 });
  }
  let result: Record<string, unknown>;
  try {
    result = JSON.parse(savedResult.result_json) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "The selected scan result is invalid." }, { status: 409 });
  }
  const target = scanTarget(result);
  if (!target.sourceUrl || !target.expectedWebsiteUrl) {
    return Response.json(
      { error: "Record the placement URL and expected supported website before confirming this result." },
      { status: 409 },
    );
  }
  const reviewedAt = new Date().toISOString();
  await database.batch([
    database
      .prepare(
        "UPDATE link_scan_results SET current_status = ?, manual_reviewed_by = ?, manual_reviewed_at = ? WHERE run_id = ? AND placement_id = ?",
      )
      .bind(body.status, session.name, reviewedAt, body.runId, body.placementId),
    database
      .prepare(
        `INSERT INTO link_scan_resolutions (
          placement_id, source_url, expected_website_url, resolved_status, reviewed_by, reviewed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(placement_id) DO UPDATE SET
          source_url = excluded.source_url,
          expected_website_url = excluded.expected_website_url,
          resolved_status = excluded.resolved_status,
          reviewed_by = excluded.reviewed_by,
          reviewed_at = excluded.reviewed_at,
          updated_at = excluded.updated_at`,
      )
      .bind(
        body.placementId,
        target.sourceUrl,
        target.expectedWebsiteUrl,
        body.status,
        session.name,
        reviewedAt,
        reviewedAt,
      ),
  ]);
  return json({
    ok: true,
    status: body.status,
    reviewedAt,
    reviewedBy: session.name,
  });
}

async function handleLatestLinkScan(env: Env, session: Session) {
  if (!canRunLinkScanner(session, env)) {
    return Response.json({ error: "Link Scanner access is restricted." }, { status: 403 });
  }
  const database = env.LINK_SCANNER_DB;
  if (!database) {
    return Response.json({ error: "Shared scan storage is unavailable." }, { status: 503 });
  }
  return json(await latestSharedLinkScan(database));
}

async function handleLinkScan(request: Request, env: Env, session: Session) {
  if (!canRunLinkScanner(session, env)) {
    return Response.json(
      { error: "Link Scanner access is limited to Coordinator, Executive and Admin." },
      { status: 403 },
    );
  }
  let body: { candidates?: unknown; knownSupportedWebsites?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid scan request." }, { status: 400 });
  }
  if (!Array.isArray(body.candidates) || body.candidates.length > 30) {
    return Response.json(
      { error: "Select between 1 and 30 secured placements per scan." },
      { status: 400 },
    );
  }
  const candidates = body.candidates.filter((value): value is LinkScanCandidate => {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Record<string, unknown>;
    return (
      typeof candidate.placementId === "string" &&
      typeof candidate.placementName === "string" &&
      typeof candidate.placementNotionUrl === "string" &&
      typeof candidate.clientName === "string" &&
      typeof candidate.supportedWebsiteName === "string" &&
      (candidate.linkCategory === "Paid" || candidate.linkCategory === "Free") &&
      (candidate.approvedCost === null || typeof candidate.approvedCost === "number") &&
      typeof candidate.sourceUrl === "string" &&
      typeof candidate.expectedWebsiteUrl === "string" &&
      typeof candidate.expectedAnchorText === "string"
    );
  });

  const knownSupportedWebsites = Array.isArray(body.knownSupportedWebsites)
    ? body.knownSupportedWebsites
        .filter((value): value is KnownSupportedWebsite => {
          if (!value || typeof value !== "object") return false;
          const website = value as Record<string, unknown>;
          return (
            typeof website.name === "string" &&
            typeof website.websiteUrl === "string" &&
            Boolean(safePublicUrl(website.websiteUrl))
          );
        })
        .slice(0, 100)
    : [];

  const results = [];
  for (let index = 0; index < candidates.length; index += 5) {
    results.push(
      ...(await Promise.all(
        candidates
          .slice(index, index + 5)
          .map((candidate) => scanCandidate(candidate, knownSupportedWebsites)),
      )),
    );
  }
  const database = env.LINK_SCANNER_DB;
  if (!database) {
    return Response.json({ error: "Shared scan storage is unavailable." }, { status: 503 });
  }
  const resolvedResults = await applyStoredManualResolutions(
    database,
    results as unknown as Array<Record<string, unknown>>,
  );
  const sharedRun = await persistLinkScan(
    database,
    session,
    resolvedResults,
  );
  return json({
    ...sharedRun,
    initiatedBy: session.name,
    results: resolvedResults,
  });
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

async function matchingSecret(left: string, right: string) {
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  return constantTimeEqual(
    new Uint8Array(leftHash),
    new Uint8Array(rightHash),
  );
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
  );
}

async function createSession(user: AuthUser, secret: string) {
  const session: Session = {
    email: user.email,
    name: user.name,
    expiresAt: Math.floor(Date.now() / 1000) + sessionLengthSeconds,
  };
  const payload = base64UrlEncode(
    encoder.encode(JSON.stringify(session)),
  );
  const signature = base64UrlEncode(await sign(payload, secret));
  return `${payload}.${signature}`;
}

function cookieValue(request: Request, name: string) {
  const cookies = request.headers.get("Cookie") ?? "";
  for (const cookie of cookies.split(";")) {
    const [cookieName, ...value] = cookie.trim().split("=");
    if (cookieName === name) return value.join("=");
  }
  return "";
}

async function activeSession(request: Request, env: Env) {
  if (!env.SESSION_SECRET) return null;
  const token = cookieValue(request, sessionCookie);
  const [payload, suppliedSignature] = token.split(".");
  if (!payload || !suppliedSignature) return null;

  try {
    const expectedSignature = await sign(payload, env.SESSION_SECRET);
    const suppliedBytes = base64UrlDecode(suppliedSignature);
    if (!constantTimeEqual(expectedSignature, suppliedBytes)) return null;

    const session = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payload)),
    ) as Session;
    const currentUser = authUsers(env).find(
      (user) => user.email === session.email,
    );
    if (
      !currentUser ||
      session.expiresAt <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { ...session, name: currentUser.name };
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function signInPage(message = "") {
  const notice = message
    ? `<div class="notice" role="alert">${escapeHtml(message)}</div>`
    : "";
  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>Sign in · Outreach Authority</title>
    <style>
      :root { color-scheme: light; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      * { box-sizing: border-box; }
      body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; color: #172032; background: radial-gradient(circle at 20% 0%, rgba(91,91,214,.22), transparent 34%), #172339; }
      main { width: min(100%, 420px); padding: 34px; border-radius: 20px; background: #fff; box-shadow: 0 24px 70px rgba(6,14,30,.34); }
      .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
      .mark { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 13px; color: #fff; background: linear-gradient(135deg, #7f7fe7, #5254ce); font-weight: 800; font-size: 12px; letter-spacing: .08em; }
      .brand strong { display: block; font-size: 15px; }
      .brand span span { display: block; margin-top: 3px; color: #697386; font-size: 11px; }
      h1 { margin: 0 0 8px; font-size: 27px; letter-spacing: -.04em; }
      .intro { margin: 0 0 24px; color: #697386; font-size: 13px; line-height: 1.6; }
      label { display: block; margin: 15px 0 7px; color: #3d4657; font-size: 12px; font-weight: 700; }
      input { width: 100%; min-height: 46px; padding: 0 13px; border: 1px solid #dfe3eb; border-radius: 10px; color: #172032; background: #fff; font: inherit; outline: none; }
      input:focus { border-color: #5b5bd6; box-shadow: 0 0 0 3px rgba(91,91,214,.12); }
      button { width: 100%; min-height: 46px; margin-top: 20px; border: 0; border-radius: 10px; color: #fff; background: #172339; font: inherit; font-weight: 750; cursor: pointer; }
      button:hover, button:focus-visible { background: #243655; outline: none; }
      .notice { margin: 0 0 16px; padding: 11px 12px; border: 1px solid #f1d5a2; border-radius: 9px; color: #85550f; background: #fff6e5; font-size: 12px; line-height: 1.45; }
      .privacy { margin: 18px 0 0; color: #929aac; font-size: 10px; line-height: 1.5; text-align: center; }
    </style>
  </head>
  <body>
    <main>
      <div class="brand">
        <span class="mark" aria-hidden="true">OA</span>
        <span><strong>Outreach Authority</strong><span>Private communication HQ</span></span>
      </div>
      <h1>Authorized access</h1>
      <p class="intro">Sign in with the private credentials assigned to you.</p>
      ${notice}
      <form method="post" action="/signin">
        <label for="email">Email address</label>
        <input id="email" name="email" type="email" autocomplete="username" required />
        <label for="password">Access password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required />
        <button type="submit">Open dashboard</button>
      </form>
      <p class="privacy">Access is limited to approved outreach team members. Sessions expire after 8 hours.</p>
    </main>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    },
  );
}

function redirect(location: string, cookie?: string) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "private, no-store",
  });
  if (cookie) headers.set("Set-Cookie", cookie);
  return new Response(null, { status: 303, headers });
}

function withSecurityHeaders(response: Response) {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  );
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Vary", "Cookie");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function queryNotionPages(
  token: string,
  dataSourceId: string,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | null = null;

  do {
    const response = await fetch(
      `https://api.notion.com/v1/data_sources/${dataSourceId}/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Notion-Version": "2026-03-11",
        },
        body: JSON.stringify({
          page_size: 100,
          ...(cursor ? { start_cursor: cursor } : {}),
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Notion returned ${response.status}`);
    }

    const payload = (await response.json()) as NotionQueryPayload;
    pages.push(...(payload.results ?? []));
    cursor = payload.has_more ? (payload.next_cursor ?? null) : null;
  } while (cursor);

  return pages;
}

async function queryNotionComments(token: string, pageId: string) {
  const comments: NotionComment[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL("https://api.notion.com/v1/comments");
    url.searchParams.set("block_id", pageId);
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2026-03-11",
      },
    });
    if (!response.ok) {
      throw new Error(`Notion comments returned ${response.status}`);
    }
    const payload = (await response.json()) as NotionCommentPayload;
    comments.push(...(payload.results ?? []));
    cursor = payload.has_more ? (payload.next_cursor ?? null) : null;
  } while (cursor);
  return comments;
}

async function queryNotionRelationProperty(
  token: string,
  pageId: string,
  propertyId: string,
) {
  const relationIds: string[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL(
      `https://api.notion.com/v1/pages/${pageId}/properties/${encodeURIComponent(propertyId)}`,
    );
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": "2026-03-11",
      },
    });
    if (!response.ok) return relationIds;
    const payload = (await response.json()) as NotionPropertyItemPayload;
    const singleId = payload.relation?.id;
    if (singleId) relationIds.push(singleId);
    for (const item of payload.results ?? []) {
      const id = item.relation?.id;
      if (id) relationIds.push(id);
    }
    cursor = payload.has_more ? (payload.next_cursor ?? null) : null;
  } while (cursor);
  return relationIds;
}

async function retrieveNotionPage(token: string, pageId: string) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2026-03-11",
    },
  });
  if (!response.ok) return undefined;
  return (await response.json()) as NotionPage;
}

async function hydrateSupportedWebsitePlacementRelations(
  token: string,
  pages: NotionPage[],
) {
  return Promise.all(
    pages.map(async (page) => {
      const property = page.properties?.Placements;
      if ((relationIds(property).length > 0 && !property?.has_more) || !page.id) {
        return page;
      }

      let ids = property?.id
        ? await queryNotionRelationProperty(token, page.id, property.id)
        : [];

      if (ids.length === 0) {
        const completePage = await retrieveNotionPage(token, page.id);
        ids = relationIds(completePage?.properties?.Placements);
      }

      if (ids.length > 0) {
        page.properties = {
          ...(page.properties ?? {}),
          Placements: {
            ...(property ?? {}),
            relation: ids.map((id) => ({ id })),
          },
        };
      }
      return page;
    }),
  );
}

function commentText(comment: NotionComment) {
  return (comment.rich_text ?? [])
    .map((item) => item.plain_text ?? "")
    .join("")
    .trim();
}

function latestExecutiveDecisionComment(comments: NotionComment[]) {
  return comments
    .map((comment) => ({
      text: commentText(comment),
      createdAt: comment.created_time ?? "",
    }))
    .filter(
      (comment) =>
        comment.text.startsWith("Approved in Executive Dashboard by") ||
        comment.text.startsWith("Declined in Executive Dashboard by"),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

function dateInManila(value?: string) {
  const date = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const byType = new Map(parts.map((part) => [part.type, part.value]));
  return `${byType.get("year")}-${byType.get("month")}-${byType.get("day")}`;
}

async function writeNotion(
  token: string,
  url: string,
  method: "POST" | "PATCH",
  body: unknown,
) {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Notion audit update returned ${response.status}`);
  }
}

async function readNotionPage(token: string, pageId: string) {
  const response = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": "2026-03-11",
    },
  });
  if (!response.ok) {
    throw new Error(`Notion placement lookup returned ${response.status}`);
  }
  return (await response.json()) as NotionPage;
}

async function writePlacementStatusEvent(
  token: string,
  statusHistoryDataSourceId: string,
  placementPage: NotionPage,
  previousStatus: string,
  newStatus: PlacementStatus,
  effectiveDate: string,
): Promise<StatusEvent> {
  const properties = placementPage.properties ?? {};
  const placementName = textValue(properties.Placement) || "Placement";
  const eventKey = `${placementPage.id}:${newStatus}:dashboard:${Date.now()}`;

  const response = await fetch("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Notion-Version": "2026-03-11",
    },
    body: JSON.stringify({
    parent: {
      type: "data_source_id",
      data_source_id: statusHistoryDataSourceId,
    },
    properties: {
      "Status Event": {
        title: [
          {
            type: "text",
            text: { content: `${placementName} — ${newStatus}` },
          },
        ],
      },
      Placement: { relation: [{ id: placementPage.id }] },
      ...(previousStatus
        ? { "Previous Status": { select: { name: previousStatus } } }
        : {}),
      "New Status": { select: { name: newStatus } },
      "Status Effective At": { date: { start: effectiveDate } },
      "Event Key": {
        rich_text: [{ type: "text", text: { content: eventKey } }],
      },
    },
    }),
  });
  if (!response.ok) {
    throw new Error(`Notion audit update returned ${response.status}`);
  }
  return mapStatusEvent((await response.json()) as NotionPage);
}

async function appendNotionComment(
  token: string,
  pageId: string,
  content: string,
) {
  await writeNotion(token, "https://api.notion.com/v1/comments", "POST", {
    parent: { page_id: pageId },
    rich_text: (content.match(/[\s\S]{1,2000}/gu) ?? []).map((chunk) => ({
      type: "text", text: { content: chunk },
    })),
  });
}

function validPageId(value: unknown) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{32}$/i.test(value.replaceAll("-", ""))
  );
}

async function handleExecutiveReview(
  request: Request,
  env: Env,
  session: Session,
) {
  const token = env.NOTION_API_TOKEN;
  if (!token) {
    return Response.json(
      { error: "The Notion integration is not available." },
      { status: 503 },
    );
  }

  let body: {
    placementId?: unknown;
    action?: unknown;
    comment?: unknown;
    previewRole?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid review request." }, { status: 400 });
  }
  const action = body.action as ReviewAction;
  const comment = typeof body.comment === "string" ? body.comment.trim() : "";
  const adminTestingAsExecutive =
    isAdmin(session, env) && body.previewRole === "executive";
  if (!isExecutive(session) && !adminTestingAsExecutive) {
    return Response.json(
      { error: "Only Executive or Admin testing as Executive can submit executive decisions." },
      { status: 403 },
    );
  }
  if (
    !validPageId(body.placementId) ||
    (action !== "approve" && action !== "decline") ||
    (action === "decline" && comment.length < 2) ||
    comment.length > 10_000
  ) {
    return Response.json(
      {
        error:
          action === "decline"
            ? "Include a concise reason for declining the placement."
            : "Choose a valid placement decision.",
      },
      { status: 400 },
    );
  }

  const placementId = (body.placementId as string).replaceAll("-", "");
  const placement = await readNotionPage(token, placementId);
  const properties = placement.properties ?? {};
  const previousStatus = selectValue(properties.Status);
  const currentDecision = decisionValue(selectValue(properties.Decision));
  const linkCategory = linkCategoryValue(
    selectValue(properties["Link Category"]),
  );
  const currentInvoiceStatus = invoiceStatusValue(
    selectValue(properties["Invoice Status"]),
  );
  const invoiceLink = properties["Invoice Link"]?.url ?? "";
  const nextStatus: PlacementStatus =
    action === "approve" ? "Approved to Proceed" : "Declined";
  const nextDecision: DecisionOutcome =
    action === "approve"
      ? "Executive-Approved (Escalated)"
      : "Executive-Declined (Escalated)";
  if (previousStatus === nextStatus && currentDecision === nextDecision) {
    return json({
      ok: true,
      alreadyRecorded: true,
      nextStatus,
      nextDecision,
      effectiveDate: dateValue(properties["Status Effective Date"]),
      message: "This executive decision was already recorded in Notion.",
    });
  }
  if (
    previousStatus !== "Pending Internal Review" ||
    currentDecision !== "Pending Executive Review"
  ) {
    return Response.json(
      { error: "This placement is no longer awaiting Executive’s review. Refresh the dashboard and try again." },
      { status: 409 },
    );
  }
  if (currentInvoiceStatus === "Invoice Received — Payment Due") {
    return Response.json(
      {
        error:
          "This placement has returned for payment confirmation. Use Mark Invoice as Paid instead of authorizing the cost again.",
      },
      { status: 409 },
    );
  }

  const effectiveDate = dateInManila();
  const actionLabel = action === "approve" ? "Approved" : "Declined";
  const nextInvoiceStatus: InvoiceStatus =
    action === "approve"
      ? linkCategory === "Free"
        ? "N/A — Free"
        : currentInvoiceStatus === "Paid"
          ? "Paid"
          : invoiceLink
            ? "Invoice Received — Payment Due"
            : "Authorized to Request"
      : currentInvoiceStatus;

  const updatedProperties: Record<string, unknown> = {
    Status: { select: { name: nextStatus } },
    Decision: { select: { name: nextDecision } },
    "Status Effective Date": { date: { start: effectiveDate } },
  };
  if (action === "approve") {
    updatedProperties["Invoice Status"] = {
      select: { name: nextInvoiceStatus },
    };
  }

  const actor = adminTestingAsExecutive
    ? `${session.name}, testing as Executive`
    : "Executive";
  const approvalContext =
    action === "approve" && linkCategory === "Paid"
      ? " Placement and proposed cost authorized; Coordinator may now request the invoice."
      : "";
  const placementComment = comment
    ? `${actionLabel} in Executive Dashboard by ${actor}:${approvalContext} ${comment}`
    : `${actionLabel} in Executive Dashboard by ${actor}.${approvalContext}`;
  // Keep the placement in the action queue unless its decision context is saved.
  // Reuse a matching comment after a partial failure to avoid duplicate posts.
  try {
    const comments = await queryNotionComments(token, placementId);
    if (!comments.some((item) => commentText(item) === placementComment)) {
      await appendNotionComment(token, placementId, placementComment);
    }
  } catch {
    return Response.json(
      { error: "The decision comment could not be saved to Notion. The placement is still awaiting review. Your text is retained; retry after checking the integration’s comment permissions." },
      { status: 502 },
    );
  }

  await writeNotion(token, `https://api.notion.com/v1/pages/${placementId}`, "PATCH", {
    properties: updatedProperties,
  });
  let auditEvent: StatusEvent | undefined;
  let auditWarning = "";
  try {
    auditEvent = await writePlacementStatusEvent(
      token,
      env.NOTION_STATUS_HISTORY_DATA_SOURCE_ID ??
        "00000000-0000-4000-8000-000000000001",
      placement,
      previousStatus,
      nextStatus,
      effectiveDate,
    );
  } catch {
    auditWarning =
      "Decision saved; the Status History entry could not be added. Refresh from Notion to reconcile it.";
  }

  const warning = auditWarning;

  return json({
    ok: true,
    nextStatus,
    nextDecision,
    nextInvoiceStatus,
    effectiveDate,
    auditEvent,
    commentSynced: true,
    decisionComment: placementComment,
    decisionCommentAt: new Date().toISOString(),
    warning,
    message: warning
      ? warning
      : action === "approve" && linkCategory === "Paid"
        ? "Placement and proposed cost authorized. Coordinator may now request the invoice."
        : `Placement ${action === "approve" ? "approved" : "declined"}, audited, and added to the Placement comments in Notion.`,
  });
}

async function handleInvoicePaid(
  request: Request,
  env: Env,
  session: Session,
) {
  const token = env.NOTION_API_TOKEN;
  if (!token) {
    return Response.json(
      { error: "The Notion integration is not available." },
      { status: 503 },
    );
  }

  let body: { placementId?: unknown; previewRole?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: "Invalid payment request." }, { status: 400 });
  }

  const adminTestingAsExecutive =
    isAdmin(session, env) && body.previewRole === "executive";
  if (!isExecutive(session) && !adminTestingAsExecutive) {
    return Response.json(
      { error: "Only Executive or Admin testing as Executive can mark an invoice Paid." },
      { status: 403 },
    );
  }
  if (!validPageId(body.placementId)) {
    return Response.json({ error: "Select a valid placement." }, { status: 400 });
  }

  const placementId = (body.placementId as string).replaceAll("-", "");
  const placement = await readNotionPage(token, placementId);
  const properties = placement.properties ?? {};
  const linkCategory = linkCategoryValue(selectValue(properties["Link Category"]));
  const invoiceLink = properties["Invoice Link"]?.url ?? "";
  const invoiceStatus = invoiceStatusValue(selectValue(properties["Invoice Status"]));
  const decision = decisionValue(selectValue(properties.Decision));
  const previousStatus = placementStatusValue(selectValue(properties.Status));

  if (invoiceStatus === "Paid") {
    return json({
      ok: true,
      alreadyRecorded: true,
      nextInvoiceStatus: "Paid" as InvoiceStatus,
      message: "This invoice is already marked Paid in Notion.",
    });
  }
  if (
    linkCategory !== "Paid" ||
    !invoiceLink ||
    invoiceStatus !== "Invoice Received — Payment Due" ||
    previousStatus !== "Pending Internal Review" ||
    decision !== "Pending Executive Review"
  ) {
    return Response.json(
      {
        error:
          "The invoice must be received after Executive authorizes the placement and cost before it can be marked Paid.",
      },
      { status: 409 },
    );
  }

  const nextStatus: PlacementStatus = "Approved to Proceed";
  const nextDecision: DecisionOutcome = "Executive-Approved (Escalated)";
  const effectiveDate = dateInManila();
  await writeNotion(
    token,
    `https://api.notion.com/v1/pages/${placementId}`,
    "PATCH",
    {
      properties: {
        "Invoice Status": { select: { name: "Paid" } },
        Status: { select: { name: nextStatus } },
        Decision: { select: { name: nextDecision } },
        "Status Effective Date": { date: { start: effectiveDate } },
      },
    },
  );

  let auditEvent: StatusEvent | undefined;
  let auditWarning = "";
  try {
    auditEvent = await writePlacementStatusEvent(
      token,
      env.NOTION_STATUS_HISTORY_DATA_SOURCE_ID ??
        "00000000-0000-4000-8000-000000000001",
      placement,
      previousStatus,
      nextStatus,
      effectiveDate,
    );
  } catch {
    auditWarning =
      "Payment saved; the Status History entry could not be added. Refresh from Notion to reconcile it.";
  }

  const actor = adminTestingAsExecutive
    ? `${session.name}, testing as Executive`
    : "Executive";
  let commentWarning = "";
  try {
    await appendNotionComment(
      token,
      placementId,
      `Invoice marked Paid in the Executive Dashboard by ${actor}.`,
    );
  } catch {
    commentWarning =
      "Invoice marked Paid, but the automatic Placement comment could not be added.";
  }

  const warning = auditWarning;

  return json({
    ok: true,
    nextInvoiceStatus: "Paid" as InvoiceStatus,
    nextStatus,
    nextDecision,
    effectiveDate,
    auditEvent,
    warning,
    message:
      warning ||
      "Invoice marked Paid. The placement is approved to proceed and removed from Executive’s queue.",
  });
}

function latestStatusEventsByPlacement(statusEventPages: NotionPage[]) {
  const latest = new Map<
    string,
    { page: NotionPage; effectiveAt: string; sortKey: string }
  >();

  for (const page of statusEventPages) {
    const properties = page.properties ?? {};
    const placementId = relationId(properties.Placement);
    if (!placementId) continue;
    const effectiveAt = dateValue(properties["Status Effective At"]);
    const sortKey = `${effectiveAt}|${page.created_time ?? ""}`;
    const current = latest.get(placementId);
    if (!current || sortKey > current.sortKey) {
      latest.set(placementId, { page, effectiveAt, sortKey });
    }
  }

  return latest;
}

async function reconcilePlacementStatusAudit(
  token: string,
  statusHistoryDataSourceId: string,
  placementPages: NotionPage[],
  statusEventPages: NotionPage[],
) {
  const latestByPlacement = latestStatusEventsByPlacement(statusEventPages);
  let auditUpdates = 0;

  for (const page of placementPages) {
    if (!page.id) continue;
    const properties = page.properties ?? {};
    const placementName = textValue(properties.Placement);
    const status = selectValue(properties.Status);
    if (!placementName || !status) continue;

    const latest = latestByPlacement.get(page.id);
    const latestStatus = latest
      ? selectValue(latest.page.properties?.["New Status"])
      : "";
    if (latestStatus === status) continue;

    const existingEffectiveDate = dateValue(
      properties["Status Effective Date"],
    );
    const effectiveDate =
      existingEffectiveDate &&
      existingEffectiveDate !== latest?.effectiveAt
        ? existingEffectiveDate
        : dateInManila(page.last_edited_time);
    const eventKey = `${page.id}:${status}:${page.last_edited_time ?? effectiveDate}`;

    await writeNotion(
      token,
      `https://api.notion.com/v1/pages/${page.id}`,
      "PATCH",
      {
        properties: {
          "Status Effective Date": {
            date: { start: effectiveDate },
          },
        },
      },
    );

    await writeNotion(token, "https://api.notion.com/v1/pages", "POST", {
      parent: {
        type: "data_source_id",
        data_source_id: statusHistoryDataSourceId,
      },
      properties: {
        "Status Event": {
          title: [
            {
              type: "text",
              text: { content: `${placementName} — ${status}` },
            },
          ],
        },
        Placement: {
          relation: [{ id: page.id }],
        },
        ...(latestStatus
          ? { "Previous Status": { select: { name: latestStatus } } }
          : {}),
        "New Status": {
          select: { name: status },
        },
        "Status Effective At": {
          date: { start: effectiveDate },
        },
        "Event Key": {
          rich_text: [
            {
              type: "text",
              text: { content: eventKey },
            },
          ],
        },
      },
    });
    auditUpdates += 1;
  }

  return auditUpdates;
}

async function reconcileReceivedInvoices(
  token: string,
  placementPages: NotionPage[],
) {
  let invoiceUpdates = 0;
  for (const page of placementPages) {
    if (!page.id) continue;
    const properties = page.properties ?? {};
    const linkCategory = linkCategoryValue(
      selectValue(properties["Link Category"]),
    );
    const invoiceLink = properties["Invoice Link"]?.url ?? "";
    const invoiceStatus = invoiceStatusValue(
      selectValue(properties["Invoice Status"]),
    );
    const placementStatus = placementStatusValue(
      selectValue(properties.Status),
    );
    const decision = decisionValue(selectValue(properties.Decision));
    if (
      linkCategory !== "Paid" ||
      !invoiceLink ||
      placementStatus !== "Approved to Proceed" ||
      decision !== "Executive-Approved (Escalated)" ||
      !["Not Requested", "Authorized to Request"].includes(invoiceStatus)
    ) {
      continue;
    }
    await writeNotion(
      token,
      `https://api.notion.com/v1/pages/${page.id}`,
      "PATCH",
      {
        properties: {
          "Invoice Status": {
            select: { name: "Invoice Received — Payment Due" },
          },
        },
      },
    );
    invoiceUpdates += 1;
  }
  return invoiceUpdates;
}

async function dashboardData(env: Env, reconcileAudit = false) {
  const token = env.NOTION_API_TOKEN;
  const clientsDataSourceId =
    env.NOTION_DATA_SOURCE_ID ??
    "00000000-0000-4000-8000-000000000002";
  const placementsDataSourceId =
    env.NOTION_PLACEMENTS_DATA_SOURCE_ID ??
    "00000000-0000-4000-8000-000000000003";
  const supportedWebsitesDataSourceId =
    env.NOTION_SUPPORTED_WEBSITES_DATA_SOURCE_ID ??
    "00000000-0000-4000-8000-000000000004";
  const statusHistoryDataSourceId =
    env.NOTION_STATUS_HISTORY_DATA_SOURCE_ID ??
    "00000000-0000-4000-8000-000000000001";

  if (!token) {
    return json({
      source: "snapshot",
      syncedAt: "2026-07-29T00:00:00.000Z",
      clients: fallbackClients,
      placements: fallbackPlacements,
      supportedWebsites: fallbackSupportedWebsites,
      statusEvents: fallbackStatusEvents,
      auditUpdates: 0,
      invoiceUpdates: 0,
    });
  }

  try {
    let placementPages = await queryNotionPages(token, placementsDataSourceId);
    const [clientResult, supportedWebsiteResult, statusEventResult] =
      await Promise.allSettled([
      queryNotionPages(token, clientsDataSourceId),
      queryNotionPages(token, supportedWebsitesDataSourceId).then((pages) =>
        hydrateSupportedWebsitePlacementRelations(token, pages),
      ),
      queryNotionPages(token, statusHistoryDataSourceId),
    ]);
    const clientPages =
      clientResult.status === "fulfilled" ? clientResult.value : [];
    const supportedWebsitePages =
      supportedWebsiteResult.status === "fulfilled"
        ? supportedWebsiteResult.value
        : [];
    let statusEventPages =
      statusEventResult.status === "fulfilled" ? statusEventResult.value : [];
    const auditAvailable = statusEventResult.status === "fulfilled";
    const auditWarning = auditAvailable
      ? undefined
      : "Placement Status History is not connected to the dashboard integration.";
    let auditUpdates = 0;
    let invoiceUpdates = 0;
    if (reconcileAudit && auditAvailable) {
      auditUpdates = await reconcilePlacementStatusAudit(
        token,
        statusHistoryDataSourceId,
        placementPages,
        statusEventPages,
      );
    }
    if (reconcileAudit) {
      invoiceUpdates = await reconcileReceivedInvoices(token, placementPages);
      if (auditUpdates > 0 || invoiceUpdates > 0) {
        [placementPages, statusEventPages] = await Promise.all([
          queryNotionPages(token, placementsDataSourceId),
          queryNotionPages(token, statusHistoryDataSourceId),
        ]);
      }
    }
    const clients = clientPages
      .map(mapClient)
      .filter((client) => client.name !== "Untitled client profile");
    // Decision comments remain stored on the Notion placement. They are not
    // bulk-fetched here because one comments request per placement would make
    // fresh data synchronization exceed Cloudflare's request ceiling.
    const executiveCommentByPlacement = new Map<
      string,
      { text: string; createdAt: string } | undefined
    >();
    const supportedWebsites = supportedWebsitePages
      .map(mapSupportedWebsite)
      .filter((site) => site.name !== "Untitled supported website");
    const mergedSupportedWebsites = Array.from(
      new Map(
        [...fallbackSupportedWebsites, ...supportedWebsites].map((site) => [
          notionIdKey(site.id),
          site,
        ]),
      ).values(),
    );
    const supportedWebsiteIds = new Set(
      mergedSupportedWebsites.map((site) => notionIdKey(site.id)),
    );
    const supportedWebsiteIdByPlacement = new Map<string, string>();

    const websitePlacementRelations = supportedWebsitePages.map(
      (websitePage) =>
        [
          websitePage.id ?? "",
          relationIds(websitePage.properties?.Placements),
        ] as const,
    );
    for (const [websiteId, placementIds] of websitePlacementRelations) {
      if (!websiteId) continue;
      for (const placementId of placementIds) {
        supportedWebsiteIdByPlacement.set(
          notionIdKey(placementId),
          websiteId,
        );
      }
    }
    const placements = placementPages
      .map((page) => {
        const comment = executiveCommentByPlacement.get(page.id ?? "");
        const placement = mapPlacement(
          page,
          comment?.text,
          comment?.createdAt,
        );
        if (
          !supportedWebsiteIds.has(
            notionIdKey(placement.supportedWebsiteId),
          )
        ) {
          const dashboardSupportedWebsite = formulaTextValue(
            page.properties?.["Dashboard Supported Website"],
          );
          const dashboardEntityGroup = formulaTextValue(
            page.properties?.["Dashboard Entity Group"],
          );
          const formulaSite = dashboardSupportedWebsite
            ? mergedSupportedWebsites.find(
                (site) =>
                  site.name.trim().toLocaleLowerCase() ===
                  dashboardSupportedWebsite.toLocaleLowerCase(),
              )
            : undefined;
          const rawEntityGroup = rollupSelectValue(
            page.properties?.["Entity Group"],
          );
          const resolvedEntityGroup = dashboardEntityGroup || rawEntityGroup;
          const groupMatches = resolvedEntityGroup
            ? mergedSupportedWebsites.filter(
                (site) =>
                  site.entityGroup === entityGroupValue(resolvedEntityGroup),
              )
            : [];
          placement.supportedWebsiteId =
            formulaSite?.id ||
            supportedWebsiteIdByPlacement.get(notionIdKey(placement.id)) ||
            (groupMatches.length === 1 ? groupMatches[0].id : "") ||
            placement.supportedWebsiteId;
        }
        return placement;
      })
      .filter((placement) => placement.name !== "Untitled placement");
    const statusEvents = statusEventPages.map(mapStatusEvent);

    return json({
      source: "notion",
      syncedAt: new Date().toISOString(),
      clients: clients.length > 0 ? clients : fallbackClients,
      placements,
      supportedWebsites:
        mergedSupportedWebsites,
      statusEvents:
        statusEvents.length > 0 ? statusEvents : fallbackStatusEvents,
      auditUpdates,
      invoiceUpdates,
      auditWarning,
    });
  } catch (error) {
    console.error("Notion dashboard synchronization failed", error);
    return Response.json({
      source: "snapshot",
      syncedAt: new Date().toISOString(),
      clients: fallbackClients,
      placements: fallbackPlacements,
      supportedWebsites: fallbackSupportedWebsites,
      statusEvents: fallbackStatusEvents,
      auditUpdates: 0,
      error:
        error instanceof Error
          ? error.message
          : "Notion synchronization failed",
    }, {
      status: 502,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const users = authUsers(env);
    const authReady = users.length > 0 && Boolean(env.SESSION_SECRET);

    if (url.pathname === "/signin" && request.method === "GET") {
      const session = await activeSession(request, env);
      return withSecurityHeaders(
        session
          ? redirect("/")
          : signInPage(
              authReady
                ? url.searchParams.has("error")
                  ? "The email or password is incorrect."
                  : ""
                : "Private access is temporarily unavailable.",
            ),
      );
    }

    if (url.pathname === "/signin" && request.method === "POST") {
      if (!authReady) {
        return withSecurityHeaders(
          signInPage("Private access is temporarily unavailable."),
        );
      }

      const body = await request.text();
      if (body.length > 8_192) {
        return withSecurityHeaders(redirect("/signin?error=1"));
      }
      const form = new URLSearchParams(body);
      const email = (form.get("email") ?? "").trim().toLowerCase();
      const password = form.get("password") ?? "";
      const user = users.find((candidate) => candidate.email === email);
      const passwordMatches = user
        ? await matchingSecret(password, user.password)
        : await matchingSecret(password, "invalid-credential-placeholder");

      if (!user || !passwordMatches) {
        return withSecurityHeaders(redirect("/signin?error=1"));
      }

      const token = await createSession(user, env.SESSION_SECRET!);
      return withSecurityHeaders(
        redirect(
          "/",
          `${sessionCookie}=${token}; Path=/; Max-Age=${sessionLengthSeconds}; HttpOnly; Secure; SameSite=Lax`,
        ),
      );
    }

    if (url.pathname === "/signout") {
      return withSecurityHeaders(
        redirect(
          "/signin",
          `${sessionCookie}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`,
        ),
      );
    }

    const session = await activeSession(request, env);
    if (!session) {
      return withSecurityHeaders(
        url.pathname.startsWith("/api/")
          ? Response.json(
              { error: "Authentication required" },
              { status: 401 },
            )
          : redirect("/signin"),
      );
    }

    if (url.pathname === "/api/review" && request.method === "POST") {
      try {
        return withSecurityHeaders(
          await handleExecutiveReview(request, env, session),
        );
      } catch (error) {
        return withSecurityHeaders(
          Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to record the executive decision.",
            },
            { status: 502 },
          ),
        );
      }
    }
    if (
      url.pathname === "/api/opportunities" &&
      (request.method === "GET" || request.method === "POST")
    ) {
      return withSecurityHeaders(
        await dashboardData(env, request.method === "POST"),
      );
    }
    if (url.pathname === "/api/invoice-paid" && request.method === "POST") {
      try {
        return withSecurityHeaders(
          await handleInvoicePaid(request, env, session),
        );
      } catch (error) {
        return withSecurityHeaders(
          Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to mark the invoice Paid.",
            },
            { status: 502 },
          ),
        );
      }
    }
    if (url.pathname === "/api/link-scan" && request.method === "GET") {
      try {
        return withSecurityHeaders(await handleLatestLinkScan(env, session));
      } catch (error) {
        return withSecurityHeaders(
          Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to load the shared secured-link scan.",
            },
            { status: 502 },
          ),
        );
      }
    }
    if (url.pathname === "/api/link-scan" && request.method === "POST") {
      try {
        return withSecurityHeaders(
          await handleLinkScan(request, env, session),
        );
      } catch (error) {
        return withSecurityHeaders(
          Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to complete the secured-link scan.",
            },
            { status: 502 },
          ),
        );
      }
    }
    if (url.pathname === "/api/link-scan" && request.method === "PATCH") {
      try {
        return withSecurityHeaders(
          await handleManualLinkReview(request, env, session),
        );
      } catch (error) {
        return withSecurityHeaders(
          Response.json(
            {
              error:
                error instanceof Error
                  ? error.message
                  : "Unable to save the manual link verification.",
            },
            { status: 502 },
          ),
        );
      }
    }
    if (url.pathname === "/api/session") {
      return withSecurityHeaders(
        json({
          email: session.email,
          name: session.name,
          isExecutive: isExecutive(session),
          isAdmin: isAdmin(session, env),
        }),
      );
    }
    return withSecurityHeaders(await env.ASSETS.fetch(request));
  },
};
