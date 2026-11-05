"use client";

import { useEffect, useMemo, useState } from "react";
import { SecuredLinkScanner } from "./SecuredLinkScanner";
import {
  fallbackClients,
  fallbackPlacements,
  fallbackStatusEvents,
  fallbackSupportedWebsites,
  notionClientsDatabaseUrl,
  notionPlacementsDatabaseUrl,
  notionStatusHistoryDatabaseUrl,
  notionSupportedWebsitesDatabaseUrl,
  type ClientProfile,
  type DecisionOutcome,
  type EntityGroup,
  type InvoiceStatus,
  type LinkCategory,
  type OutreachDashboardPayload,
  type Placement,
  type PlacementStatus,
  type StatusEvent,
  type SupportedWebsite,
} from "../lib/outreach-data";

type Period = "today" | "week" | "custom" | "all";
type PreviewRole = "admin" | "coordinator" | "executive";
type StatusFilter =
  | "all"
  | "active"
  | "approved"
  | "secured"
  | "decision";

const activeStatuses = new Set<PlacementStatus>([
  "Negotiating",
  "Pending Internal Review",
  "Approved to Proceed",
  "Submitted",
]);

const statusOrder: PlacementStatus[] = [
  "Link Secured",
  "Approved to Proceed",
  "Submitted",
  "Negotiating",
  "Pending Internal Review",
  "Declined",
];

const statusClass: Record<PlacementStatus, string> = {
  "Link Secured": "positive",
  "Approved to Proceed": "info",
  Submitted: "violet",
  Negotiating: "warning",
  "Pending Internal Review": "review",
  Declined: "negative",
};

const statusColor: Record<PlacementStatus, string> = {
  "Link Secured": "#1f9d68",
  "Approved to Proceed": "#2d75cf",
  Submitted: "#7d59c8",
  Negotiating: "#ca7a12",
  "Pending Internal Review": "#8d5a35",
  Declined: "#c84d4d",
};

const decisionColorClass: Record<string, string> = {
  "Pending Executive Review": "yellow",
  "Coordinator-Approved": "blue",
  "Executive-Approved (Escalated)": "green",
  "Executive-Declined (Escalated)": "red",
  Disqualified: "gray",
};

const invoiceStatusClass: Record<InvoiceStatus, string> = {
  "Not Requested": "neutral",
  "N/A — Free": "neutral",
  "Authorized to Request": "info",
  "Invoice Received — Payment Due": "review",
  Paid: "positive",
  "": "neutral",
};

function effectiveInvoiceStatus(placement: Placement): InvoiceStatus {
  if (placement.linkCategory === "Free") return "N/A — Free";
  if (placement.invoiceLink && placement.invoiceStatus !== "Paid")
    return "Invoice Received — Payment Due";
  if (placement.invoiceStatus) return placement.invoiceStatus;
  return "Not Requested";
}

function MetricIcon({ type }: { type: "active" | "attention" | "approved" | "secured" }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (type === "active") {
    return <svg {...common}><path d="M7 17 17 7" /><path d="M9 7h8v8" /></svg>;
  }
  if (type === "attention") {
    return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>;
  }
  if (type === "approved") {
    return <svg {...common}><path d="m6.5 12 3.6 3.6L17.8 8" /></svg>;
  }
  return <svg {...common}><rect x="6" y="10" width="12" height="9" rx="2" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></svg>;
}

function normalizeNotionId(value: string) {
  return value.replaceAll("-", "").toLowerCase();
}

function formatDate(value: string) {
  if (!value) return "No status date";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));
}

function formatDateTime(value: string) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}

function formatCurrency(value: number | null) {
  if (value === null) return "—";
  if (value === 0) return "No cost";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function domainFromUrl(value: string) {
  try {
    return new URL(
      value.startsWith("http") ? value : `https://${value}`,
    ).hostname.replace(/^www\./, "");
  } catch {
    return value || "No website recorded";
  }
}

function todayInManila() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Manila",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function isDateInPeriod(
  value: string,
  period: Period,
  today: string,
  customStart: string,
  customEnd: string,
) {
  if (period === "all") return true;
  const date = value.slice(0, 10);
  if (!date) return false;
  if (period === "custom") {
    return (
      (!customStart || date >= customStart) &&
      (!customEnd || date <= customEnd)
    );
  }
  const days = period === "today" ? 0 : 6;
  const end = new Date(`${today}T12:00:00Z`).getTime();
  const start = new Date(`${date}T12:00:00Z`).getTime();
  const difference = Math.floor((end - start) / 86_400_000);
  return difference >= 0 && difference <= days;
}

function categoryClass(value: LinkCategory) {
  return value.toLowerCase();
}

function donutGradient(
  items: Array<{ color: string; count: number }>,
) {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  if (total === 0) return "conic-gradient(#e7eaf0 0 100%)";
  let cursor = 0;
  const segments = items.map((item) => {
    const start = cursor;
    cursor += (item.count / total) * 100;
    return `${item.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${segments.join(", ")})`;
}

function eventDescription(event: StatusEvent) {
  if (event.previousStatus) {
    return `${event.previousStatus} → ${event.newStatus}`;
  }
  return `Initial status recorded as ${event.newStatus}`;
}

export function Dashboard() {
  const [currentPage] = useState<"dashboard" | "scanner">(() =>
    typeof window !== "undefined" && window.location.pathname === "/link-scanner"
      ? "scanner"
      : "dashboard",
  );
  const [period, setPeriod] = useState<Period>("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<"all" | LinkCategory>(
    "all",
  );
  const [entityFilter, setEntityFilter] = useState<"all" | EntityGroup>("all");
  const [websiteFilter, setWebsiteFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [clients, setClients] = useState<ClientProfile[]>(fallbackClients);
  const [placements, setPlacements] =
    useState<Placement[]>(fallbackPlacements);
  const [supportedWebsites, setSupportedWebsites] = useState<
    SupportedWebsite[]
  >(fallbackSupportedWebsites);
  const [statusEvents, setStatusEvents] =
    useState<StatusEvent[]>(fallbackStatusEvents);
  const [selectedId, setSelectedId] = useState(fallbackPlacements[0]?.id ?? "");
  const [source, setSource] = useState<"notion" | "snapshot">("snapshot");
  const [syncedAt, setSyncedAt] = useState("2026-10-01T09:00:00.000Z");
  const [auditWarning, setAuditWarning] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [isExecutive, setIsExecutive] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sessionName, setSessionName] = useState("");
  const [previewRole, setPreviewRole] = useState<PreviewRole>("admin");
  const [reviewComment, setReviewComment] = useState("");
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");
  const [isMarkingPaid, setIsMarkingPaid] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  async function loadSession() {
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        isExecutive?: boolean;
        isAdmin?: boolean;
        name?: string;
      };
      setIsExecutive(payload.isExecutive === true);
      setIsAdmin(payload.isAdmin === true);
      setSessionName(payload.name ?? "");
    } catch {
      setIsExecutive(false);
      setIsAdmin(false);
    }
  }

  async function loadDashboard(manual = false) {
    if (manual) {
      setIsRefreshing(true);
      setRefreshMessage("");
    }
    try {
      const response = await fetch("/api/opportunities", {
        method: manual ? "POST" : "GET",
        cache: "no-store",
      });
      const payload = (await response.json()) as OutreachDashboardPayload;
      if (!response.ok) {
        throw new Error(payload.error || "Notion refresh failed.");
      }
      setClients(payload.clients ?? []);
      setPlacements(payload.placements ?? []);
      setSupportedWebsites(payload.supportedWebsites ?? []);
      setStatusEvents(payload.statusEvents ?? []);
      setSource(payload.source);
      setSyncedAt(payload.syncedAt);
      setAuditWarning(payload.auditWarning ?? "");
      setSelectedId((current) =>
        payload.placements?.some((item) => item.id === current)
          ? current
          : (payload.placements?.[0]?.id ?? ""),
      );
      if (manual) {
        const auditUpdates = payload.auditUpdates ?? 0;
        const invoiceUpdates = payload.invoiceUpdates ?? 0;
        const updateParts = [
          auditUpdates > 0
            ? `${auditUpdates} new status ${auditUpdates === 1 ? "change" : "changes"} logged`
            : "No new status changes",
          invoiceUpdates > 0
            ? `${invoiceUpdates} received ${invoiceUpdates === 1 ? "invoice" : "invoices"} recognized`
            : "",
        ].filter(Boolean);
        setRefreshMessage(
          payload.auditWarning
            ? `${payload.placements?.length ?? 0} placements refreshed. ${payload.auditWarning}`
            : `${payload.placements?.length ?? 0} placements refreshed. ${updateParts.join("; ")}.`,
        );
        window.setTimeout(() => setRefreshMessage(""), 3800);
      }
    } catch (error) {
      if (manual) {
        setRefreshMessage(
          error instanceof Error ? error.message : "Refresh failed.",
        );
      }
    } finally {
      if (manual) setIsRefreshing(false);
    }
  }

  async function submitExecutiveReview(action: "approve" | "decline") {
    if (!selectedId || (action === "decline" && !reviewComment.trim())) return;
    setIsSubmittingReview(true);
    setReviewMessage("");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placementId: selectedId,
          action,
          comment: reviewComment.trim(),
          previewRole: isAdmin ? previewRole : undefined,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        warning?: string;
        nextStatus?: PlacementStatus;
        nextDecision?: DecisionOutcome;
        nextInvoiceStatus?: InvoiceStatus;
        effectiveDate?: string;
        auditEvent?: StatusEvent;
        decisionComment?: string;
        decisionCommentAt?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to record the decision.");
      }
      if (payload.nextStatus && payload.nextDecision) {
        setPlacements((current) =>
          current.map((placement) =>
            placement.id === selectedId
              ? {
                  ...placement,
                  status: payload.nextStatus as PlacementStatus,
                  decision: payload.nextDecision as DecisionOutcome,
                  invoiceStatus:
                    payload.nextInvoiceStatus || placement.invoiceStatus,
                  statusEffectiveDate:
                    payload.effectiveDate || placement.statusEffectiveDate,
                  executiveDecisionComment:
                    payload.decisionComment ||
                    placement.executiveDecisionComment,
                  executiveDecisionCommentAt:
                    payload.decisionCommentAt ||
                    placement.executiveDecisionCommentAt,
                }
              : placement,
          ),
        );
      }
      if (payload.auditEvent) {
        setStatusEvents((current) => [payload.auditEvent as StatusEvent, ...current]);
      } else if (payload.nextStatus) {
        setStatusEvents((current) => [
          {
            id: `decision-${selectedId}-${Date.now()}`,
            notionUrl: "",
            name: `${selected?.name ?? "Placement"} — ${payload.nextStatus}`,
            placementId: selectedId,
            previousStatus: selected?.status ?? "",
            newStatus: payload.nextStatus as PlacementStatus,
            statusEffectiveAt: payload.effectiveDate || todayInManila(),
            loggedAt: new Date().toISOString(),
            changedBy: sessionName,
            eventKey: "dashboard-pending-refresh",
          },
          ...current,
        ]);
      }
      setReviewComment("");
      setReviewMessage(payload.message || "Decision recorded in Notion.");
      await loadDashboard();
    } catch (error) {
      setReviewMessage(
        error instanceof Error ? error.message : "Unable to record the decision.",
      );
    } finally {
      setIsSubmittingReview(false);
    }
  }

  async function markInvoicePaid() {
    if (!selectedId) return;
    setIsMarkingPaid(true);
    setPaymentMessage("");
    try {
      const response = await fetch("/api/invoice-paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placementId: selectedId,
          previewRole: isAdmin ? previewRole : undefined,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        nextInvoiceStatus?: InvoiceStatus;
        nextStatus?: PlacementStatus;
        nextDecision?: DecisionOutcome;
        effectiveDate?: string;
        auditEvent?: StatusEvent;
      };
      if (!response.ok) {
        throw new Error(payload.error || "Unable to mark the invoice Paid.");
      }
      setPlacements((current) =>
        current.map((placement) =>
          placement.id === selectedId
            ? {
                ...placement,
                invoiceStatus: "Paid",
                status: payload.nextStatus || "Approved to Proceed",
                decision:
                  payload.nextDecision || "Executive-Approved (Escalated)",
                statusEffectiveDate:
                  payload.effectiveDate || placement.statusEffectiveDate,
              }
            : placement,
        ),
      );
      if (payload.auditEvent) {
        setStatusEvents((current) => [payload.auditEvent as StatusEvent, ...current]);
      }
      setPaymentMessage(payload.message || "Invoice marked Paid in Notion.");
      await loadDashboard();
    } catch (error) {
      setPaymentMessage(
        error instanceof Error
          ? error.message
          : "Unable to mark the invoice Paid.",
      );
    } finally {
      setIsMarkingPaid(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    void loadSession();
  }, []);

  useEffect(() => {
    setReviewComment("");
    setReviewMessage("");
    setPaymentMessage("");
  }, [previewRole, selectedId]);

  const today = todayInManila();
  const canActAsExecutive =
    isExecutive || (isAdmin && previewRole === "executive");

  const clientById = useMemo(
    () =>
      new Map(
        clients.map((client) => [normalizeNotionId(client.id), client]),
      ),
    [clients],
  );

  const websiteById = useMemo(
    () =>
      new Map(
        supportedWebsites.map((site) => [
          normalizeNotionId(site.id),
          site,
        ]),
      ),
    [supportedWebsites],
  );

  const placementById = useMemo(
    () =>
      new Map(
        placements.map((placement) => [
          normalizeNotionId(placement.id),
          placement,
        ]),
      ),
    [placements],
  );

  const entityOptions = useMemo(
    () =>
      [...new Set(supportedWebsites.map((site) => site.entityGroup))].sort(),
    [supportedWebsites],
  );

  const websiteOptions = useMemo(
    () =>
      supportedWebsites
        .filter(
          (site) =>
            entityFilter === "all" || site.entityGroup === entityFilter,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [entityFilter, supportedWebsites],
  );

  useEffect(() => {
    if (
      websiteFilter !== "all" &&
      !websiteOptions.some((site) => site.id === websiteFilter)
    ) {
      setWebsiteFilter("all");
    }
  }, [websiteFilter, websiteOptions]);

  const structurallyFilteredPlacements = useMemo(
    () =>
      placements.filter((placement) => {
        const site = websiteById.get(
          normalizeNotionId(placement.supportedWebsiteId),
        );
        return (
          (categoryFilter === "all" ||
            placement.linkCategory === categoryFilter) &&
          (entityFilter === "all" || site?.entityGroup === entityFilter) &&
          (websiteFilter === "all" ||
            normalizeNotionId(placement.supportedWebsiteId) ===
              normalizeNotionId(websiteFilter))
        );
      }),
    [
      categoryFilter,
      entityFilter,
      placements,
      websiteById,
      websiteFilter,
    ],
  );

  const timeFilteredPlacements = useMemo(
    () =>
      structurallyFilteredPlacements.filter((placement) =>
        isDateInPeriod(
          placement.statusEffectiveDate,
          period,
          today,
          customStart,
          customEnd,
        ),
      ),
    [
      customEnd,
      customStart,
      period,
      structurallyFilteredPlacements,
      today,
    ],
  );

  const needsExecutive = useMemo(
    () =>
      structurallyFilteredPlacements.filter(
        (placement) =>
          placement.status === "Pending Internal Review" &&
          placement.decision === "Pending Executive Review",
      ),
    [structurallyFilteredPlacements],
  );

  const periodStatusEvents = useMemo(
    () =>
      statusEvents
        .filter((event) => {
          const placement = placementById.get(
            normalizeNotionId(event.placementId),
          );
          return (
            Boolean(placement) &&
            timeFilteredPlacements.some(
              (candidate) =>
                normalizeNotionId(candidate.id) ===
                normalizeNotionId(event.placementId),
            ) &&
            isDateInPeriod(
              event.statusEffectiveAt,
              period,
              today,
              customStart,
              customEnd,
            )
          );
        })
        .sort((a, b) =>
          b.statusEffectiveAt.localeCompare(a.statusEffectiveAt),
        ),
    [
      customEnd,
      customStart,
      period,
      placementById,
      statusEvents,
      timeFilteredPlacements,
      today,
    ],
  );

  const metrics = useMemo(
    () => ({
      active: timeFilteredPlacements.filter((placement) =>
        activeStatuses.has(placement.status),
      ).length,
      decisions: needsExecutive.length,
      approved: timeFilteredPlacements.filter(
        (placement) => placement.status === "Approved to Proceed",
      ).length,
      secured: timeFilteredPlacements.filter(
        (placement) => placement.status === "Link Secured",
      ).length,
    }),
    [needsExecutive.length, timeFilteredPlacements],
  );

  const distributionPanel = useMemo(() => {
    if (statusFilter === "active") {
      const items = statusOrder
        .filter((name) => activeStatuses.has(name))
        .map((name) => ({
          name,
          count: timeFilteredPlacements.filter(
            (placement) => placement.status === name,
          ).length,
          color: statusColor[name],
          className: statusClass[name],
        }))
        .filter((item) => item.count > 0);
      return {
        eyebrow: "Placement pipeline distribution",
        title: "Current active placement status mix",
        unit: "Active placements",
        items,
      };
    }

    if (statusFilter === "decision") {
      const categories: LinkCategory[] = ["Paid", "Free"];
      const colors: Record<LinkCategory, string> = {
        Paid: "#ca7a12",
        Free: "#1f9d68",
      };
      return {
        eyebrow: "Executive decision distribution",
        title: "Decision-ready placements by commercial exposure",
        unit: "Pending decisions",
        items: categories
          .map((name) => ({
            name,
            count: needsExecutive.filter(
              (placement) => placement.linkCategory === name,
            ).length,
            color: colors[name],
            className: name === "Paid" ? "warning" : "positive",
          }))
          .filter((item) => item.count > 0),
      };
    }

    if (statusFilter === "approved") {
      const palette = ["#2d75cf", "#7d59c8", "#1f9d68", "#ca7a12"];
      const approved = timeFilteredPlacements.filter(
        (placement) => placement.status === "Approved to Proceed",
      );
      const names = [...new Set(approved.map((placement) => placement.type))];
      return {
        eyebrow: "Authorized work distribution",
        title: "Approved placements by execution type",
        unit: "Approved placements",
        items: names.map((name, index) => ({
          name,
          count: approved.filter((placement) => placement.type === name).length,
          color: palette[index % palette.length],
          className: ["info", "violet", "positive", "warning"][index % 4],
        })),
      };
    }

    if (statusFilter === "secured") {
      const palette = ["#1f9d68", "#2d75cf", "#7d59c8", "#ca7a12", "#8d5a35"];
      const secured = timeFilteredPlacements.filter(
        (placement) => placement.status === "Link Secured",
      );
      const names = [
        ...new Set(
          secured.map(
            (placement) =>
              websiteById.get(normalizeNotionId(placement.supportedWebsiteId))
                ?.name ?? "Unassigned website",
          ),
        ),
      ];
      return {
        eyebrow: "Secured authority distribution",
        title: "Acquired links by supported website",
        unit: "Secured links",
        items: names.map((name, index) => ({
          name,
          count: secured.filter((placement) => {
            const siteName =
              websiteById.get(normalizeNotionId(placement.supportedWebsiteId))
                ?.name ?? "Unassigned website";
            return siteName === name;
          }).length,
          color: palette[index % palette.length],
          className: ["positive", "info", "violet", "warning", "review"][index % 5],
        })),
      };
    }

    return null;
  }, [needsExecutive, statusFilter, timeFilteredPlacements, websiteById]);

  const visiblePlacements = useMemo(() => {
    const query = search.trim().toLowerCase();
    return (statusFilter === "decision" ? needsExecutive : timeFilteredPlacements).filter((placement) => {
      const client = clientById.get(normalizeNotionId(placement.clientId));
      const site = websiteById.get(
        normalizeNotionId(placement.supportedWebsiteId),
      );
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && activeStatuses.has(placement.status)) ||
        (statusFilter === "approved" &&
          placement.status === "Approved to Proceed") ||
        (statusFilter === "secured" &&
          placement.status === "Link Secured") ||
        (statusFilter === "decision" &&
          placement.status === "Pending Internal Review" &&
          placement.decision === "Pending Executive Review");
      const matchesSearch =
        !query ||
        [
          placement.name,
          placement.status,
          placement.decision,
          placement.type,
          placement.linkCategory,
          placement.owner,
          client?.name ?? "",
          site?.name ?? "",
          site?.entityGroup ?? "",
        ].some((value) => value.toLowerCase().includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [
    clientById,
    needsExecutive,
    search,
    statusFilter,
    timeFilteredPlacements,
    websiteById,
  ]);

  const selected =
    visiblePlacements.find((placement) => placement.id === selectedId) ??
    visiblePlacements[0] ??
    timeFilteredPlacements.find((placement) => placement.id === selectedId) ??
    timeFilteredPlacements[0];

  const selectedClient = selected
    ? clientById.get(normalizeNotionId(selected.clientId))
    : undefined;
  const selectedWebsite = selected
    ? websiteById.get(normalizeNotionId(selected.supportedWebsiteId))
    : undefined;
  const isInvoicePaymentReview =
    selected?.linkCategory === "Paid" &&
    selected.status === "Pending Internal Review" &&
    selected.decision === "Pending Executive Review" &&
    effectiveInvoiceStatus(selected) === "Invoice Received — Payment Due" &&
    Boolean(selected.invoiceLink);

  const selectedDecisionEvent = useMemo(() => {
    if (!selected) return undefined;
    const decisionStatus =
      selected.decision === "Executive-Approved (Escalated)"
        ? "Approved to Proceed"
        : selected.decision === "Executive-Declined (Escalated)"
          ? "Declined"
          : undefined;
    if (!decisionStatus) return undefined;
    return statusEvents
      .filter(
        (event) =>
          normalizeNotionId(event.placementId) ===
            normalizeNotionId(selected.id) &&
          event.newStatus === decisionStatus,
      )
      .sort((a, b) =>
        `${b.loggedAt ?? b.statusEffectiveAt}|${b.id}`.localeCompare(
          `${a.loggedAt ?? a.statusEffectiveAt}|${a.id}`,
        ),
      )[0];
  }, [selected, statusEvents]);

  const relatedPlacements = useMemo(
    () =>
      selected
        ? placements
            .filter(
              (placement) =>
                normalizeNotionId(placement.clientId) ===
                  normalizeNotionId(selected.clientId) &&
                placement.id !== selected.id,
            )
            .sort((a, b) =>
              b.statusEffectiveDate.localeCompare(a.statusEffectiveDate),
            )
        : [],
    [placements, selected],
  );

  const periodLabel =
    period === "today"
      ? `Today · ${formatDate(today)}`
      : period === "week"
        ? "Past 7 days"
        : period === "all"
          ? "All time"
          : customStart || customEnd
            ? `${customStart ? formatDate(customStart) : "Beginning"} – ${
                customEnd ? formatDate(customEnd) : "Today"
              }`
            : "Custom dates";

  if (currentPage === "scanner") {
    return (
      <SecuredLinkScanner
        placements={placements}
        clients={clients}
        supportedWebsites={supportedWebsites}
        sessionName={sessionName}
        source={source}
        syncedAt={syncedAt}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            OA
          </span>
          <span>
            <strong>Outreach Authority</strong>
            <small>Communication HQ</small>
          </span>
        </div>

        <nav className="nav" aria-label="Dashboard navigation">
          <a className="nav-link is-active" href="#overview">
            <span aria-hidden="true">◫</span> Overview
          </a>
          <a
            className="nav-link"
            href="#decisions"
            onClick={(event) => {
              event.preventDefault();
              setStatusFilter("decision");
              window.setTimeout(
                () =>
                  window.document
                    .getElementById("decisions")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                0,
              );
            }}
          >
            <span aria-hidden="true">◇</span> Decisions
            {metrics.decisions > 0 && (
              <span className="nav-count">{metrics.decisions}</span>
            )}
          </a>
          <a className="nav-link" href="#pipeline">
            <span aria-hidden="true">↗</span> Placement Pipeline
          </a>
          <a className="nav-link" href="#websites">
            <span aria-hidden="true">◎</span> Supported Websites
          </a>
          <a className="nav-link" href="/link-scanner">
            <span aria-hidden="true">⌁</span> Link Scanner
          </a>
          <a className="nav-link" href="#activity">
            <span aria-hidden="true">≋</span> Activity
          </a>
        </nav>

        {isAdmin && (
          <section className="admin-test-card" aria-label="Admin Test Mode">
            <div>
              <span>Admin Test Mode</span>
              <strong>View dashboard as</strong>
            </div>
            <select
              value={previewRole}
              onChange={(event) =>
                setPreviewRole(event.target.value as PreviewRole)
              }
              aria-label="Preview dashboard as"
            >
              <option value="admin">Admin — Administrator</option>
              <option value="coordinator">Preview as Coordinator</option>
              <option value="executive">Preview as Executive</option>
            </select>
          </section>
        )}

        <div className="sidebar-spacer" />

        <div className="source-card">
          <div className="source-heading">
            <span
              className={`sync-dot ${source === "notion" ? "is-live" : ""}`}
              aria-hidden="true"
            />
            <strong>
              {source === "notion"
                ? auditWarning
                  ? "Notion live · audit pending"
                  : "Notion live"
                : "Fictional sample records"}
            </strong>
          </div>
          <p>
            {source === "notion" && auditWarning
              ? "Placement data is live. Status-history access is pending."
              : "Reading client directory, placement opportunities, supported sites and status history."}
          </p>
          <a
            href={notionPlacementsDatabaseUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open working database ↗
          </a>
        </div>

        <div className="profile">
          <span className="avatar" aria-hidden="true">
            ✓
          </span>
          <span>
            <strong>{sessionName || "Portfolio snapshot"}</strong>
            <small>
              {isAdmin
                ? previewRole === "admin"
                  ? "Administrator"
                  : `Testing as ${previewRole === "coordinator" ? "Coordinator" : "Executive"}`
                : "Fictional data"}
            </small>
          </span>
          <a className="sign-out" href="/signout">
            Sign out
          </a>
        </div>
      </aside>

      <section className="workspace">
        {isAdmin && previewRole !== "admin" && (
          <div className="admin-preview-banner" role="status">
            <span>Admin Test Mode</span>
            <strong>
              Viewing as {previewRole === "coordinator" ? "Coordinator" : "Executive"}
            </strong>
            <button type="button" onClick={() => setPreviewRole("admin")}>
              Return to Admin
            </button>
          </div>
        )}
        <header className="topbar">
          <div>
            <p className="eyebrow">Executive visibility</p>
            <h1>Outreach Authority Dashboard</h1>
            <p className="subtitle">
              Placement view of client outreach, decisions and secured
              authority.
            </p>
          </div>
          <div className="topbar-actions">
            <div className="sync-label">
              <span>Last refresh</span>
              <strong>{formatDateTime(syncedAt)}</strong>
            </div>
            <button
              className="button button-refresh"
              type="button"
              disabled={isRefreshing}
              onClick={() => void loadDashboard(true)}
            >
              {isRefreshing ? "Refreshing…" : "Refresh from Notion"}
            </button>
            <a
              className="button button-dark"
              href={notionPlacementsDatabaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              Update in Notion ↗
            </a>
          </div>
        </header>

        {refreshMessage && (
          <div className="refresh-toast" role="status">
            <span aria-hidden="true">✓</span>
            {refreshMessage}
          </div>
        )}

        <section className="period-bar executive-filter-bar">
          <div className="period-tabs" aria-label="Status effective date range">
            {(
              [
                ["today", "Today"],
                ["week", "7 days"],
                ["all", "All Time"],
                ["custom", "Custom"],
              ] as Array<[Period, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                className={period === value ? "is-selected" : ""}
                type="button"
                onClick={() => setPeriod(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {period === "custom" && (
            <div className="custom-date-range">
              <label>
                From
                <input
                  type="date"
                  value={customStart}
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </label>
              <label>
                To
                <input
                  type="date"
                  value={customEnd}
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </label>
            </div>
          )}

          <div className="executive-filters">
            <label className="filter-control">
              <span>Link Category</span>
              <select
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(
                    event.target.value as "all" | LinkCategory,
                  )
                }
              >
                <option value="all">All</option>
                <option value="Free">Free</option>
                <option value="Paid">Paid</option>
              </select>
            </label>
            <label className="filter-control">
              <span>Entity Group</span>
              <select
                value={entityFilter}
                onChange={(event) =>
                  setEntityFilter(
                    event.target.value as "all" | EntityGroup,
                  )
                }
              >
                <option value="all">All</option>
                {entityOptions.map((entity) => (
                  <option key={entity} value={entity}>
                    {entity}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-control filter-control-wide">
              <span>Supported Website</span>
              <select
                value={websiteFilter}
                onChange={(event) => setWebsiteFilter(event.target.value)}
              >
                <option value="all">All</option>
                {websiteOptions.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        <div className="period-context">
          <span className="pulse" aria-hidden="true" />
          <strong>Activity range: {periodLabel}</strong>
          <span>Current KPIs and pipeline remain cumulative.</span>
        </div>

        <section className="metrics" id="overview" aria-label="Key metrics">
          <button
            className={`metric-card metric-indigo ${
              statusFilter === "active" ? "is-selected" : ""
            }`}
            type="button"
            aria-pressed={statusFilter === "active"}
            onClick={() => setStatusFilter("active")}
          >
            <span className="metric-icon" aria-hidden="true">
              <MetricIcon type="active" />
            </span>
            <div className="metric-copy">
              <span>Active Placements</span>
              <strong>{metrics.active}</strong>
              <small>
                {period === "all"
                  ? "All current active placement records"
                  : "Active status effective in selected range"}
              </small>
            </div>
          </button>

          <button
            className={`metric-card metric-attention ${
              statusFilter === "decision" ? "is-selected" : ""
            }`}
            type="button"
            aria-pressed={statusFilter === "decision"}
            onClick={() => setStatusFilter("decision")}
          >
            <span className="attention-badge">Action required</span>
            <span className="metric-icon" aria-hidden="true">
              <MetricIcon type="attention" />
            </span>
            <div className="metric-copy">
              <span>Needs Executive</span>
              <strong>{metrics.decisions}</strong>
              <small>
                All current pending executive decisions
              </small>
            </div>
          </button>

          <button
            className={`metric-card metric-blue ${
              statusFilter === "approved" ? "is-selected" : ""
            }`}
            type="button"
            aria-pressed={statusFilter === "approved"}
            onClick={() => setStatusFilter("approved")}
          >
            <span className="metric-icon" aria-hidden="true">
              <MetricIcon type="approved" />
            </span>
            <div className="metric-copy">
              <span>Approved to Proceed</span>
              <strong>{metrics.approved}</strong>
              <small>
                {period === "all"
                  ? "All current authorized placement work"
                  : "Approval status effective in selected range"}
              </small>
            </div>
          </button>

          <button
            className={`metric-card metric-goal ${
              statusFilter === "secured" ? "is-selected" : ""
            }`}
            type="button"
            aria-pressed={statusFilter === "secured"}
            onClick={() => setStatusFilter("secured")}
          >
            <span className="goal-badge">Goal</span>
            <span className="metric-icon" aria-hidden="true">
              <MetricIcon type="secured" />
            </span>
            <div className="metric-copy">
              <span>Secured Placements</span>
              <strong>{metrics.secured}</strong>
              <small>
                {period === "all"
                  ? "All current secured placements"
                  : "Secured status effective in selected range"}
              </small>
            </div>
          </button>
        </section>

        {distributionPanel && (
        <section
          className={`content-grid ${
            statusFilter === "decision" ? "" : "is-single-panel"
          }`}
        >
          {statusFilter === "decision" && (
            <section className="panel" id="decisions">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Needs Executive action queue</p>
                  <h2>Current decision-ready placements</h2>
                </div>
                <span className="count-badge">{needsExecutive.length}</span>
              </div>
              {needsExecutive.length === 0 ? (
                <div className="clear-state">
                  <span aria-hidden="true">✓</span>
                  <div>
                    <strong>No decisions waiting</strong>
                    <p>Coordinator can continue within approved guardrails.</p>
                  </div>
                </div>
              ) : (
                <div className="decision-queue">
                  <div className="decision-queue-head" aria-hidden="true">
                    <span>Placement</span>
                    <span>Client</span>
                    <span>Placement type</span>
                    <span>Supported website</span>
                    <span>Est. cost</span>
                    <span />
                  </div>
                  {needsExecutive.map((placement) => {
                    const client = clientById.get(
                      normalizeNotionId(placement.clientId),
                    );
                    const site = websiteById.get(
                      normalizeNotionId(placement.supportedWebsiteId),
                    );
                    return (
                      <article key={placement.id}>
                        <div>
                          <span className="timeline-dot negative" />
                          <strong>{placement.name}</strong>
                        </div>
                        <span>{client?.name ?? "No client"}</span>
                        <span>{placement.type}</span>
                        <span>{site?.name ?? "No supported website"}</span>
                        <strong>{formatCurrency(placement.approvedCost)}</strong>
                        <button
                          className="button button-light"
                          type="button"
                          onClick={() => {
                            setSelectedId(placement.id);
                            setReviewMessage("");
                            window.document
                              .getElementById("pipeline")
                              ?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                              });
                          }}
                        >
                          Review
                        </button>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          <section className="panel distribution-panel">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">{distributionPanel.eyebrow}</p>
                <h2>{distributionPanel.title}</h2>
              </div>
            </div>
            <div className="donut-wrap">
              <div
                className="donut"
                style={{ background: donutGradient(distributionPanel.items) }}
                aria-label={`${distributionPanel.items.reduce((sum, item) => sum + item.count, 0)} ${distributionPanel.unit.toLowerCase()} represented in the selected range`}
              >
                <span>
                  <strong>
                    {distributionPanel.items.reduce(
                      (sum, item) => sum + item.count,
                      0,
                    )}
                  </strong>
                  <small>{distributionPanel.unit}</small>
                </span>
              </div>
              <div className="legend">
                {distributionPanel.items.map((item) => (
                  <div key={item.name}>
                    <span
                      className={`legend-dot ${item.className}`}
                      style={{ backgroundColor: item.color }}
                      aria-hidden="true"
                    />
                    <span>{item.name}</span>
                    <strong>{item.count}</strong>
                  </div>
                ))}
                {distributionPanel.items.length === 0 && (
                  <div>
                    <span className="legend-dot neutral" />
                    <span>No records in this view</span>
                    <strong>0</strong>
                  </div>
                )}
              </div>
            </div>
          </section>
        </section>
        )}

        <section className="panel pipeline-panel" id="pipeline">
          <div className="panel-heading pipeline-heading">
            <div>
              <p className="eyebrow">Single source of truth</p>
              <h2>Placement pipeline</h2>
            </div>
            <div className="table-controls">
              <label className="search-field">
                <span aria-hidden="true">⌕</span>
                <span className="sr-only">Search placements</span>
                <input
                  type="search"
                  placeholder="Search placements"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <select
                aria-label="Filter placement status"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
              >
                <option value="all">All statuses</option>
                <option value="active">Active placements</option>
                <option value="approved">Approved to Proceed</option>
                <option value="secured">Link Secured</option>
                <option value="decision">Needs Executive</option>
              </select>
            </div>
          </div>

          <div className="pipeline-layout">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Placement</th>
                    <th>Client</th>
                    <th>Supported Website</th>
                    <th>Entity Group</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Decision</th>
                    <th>Approved Cost</th>
                    <th>Status Date</th>
                    <th>Result</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePlacements.map((placement) => {
                    const client = clientById.get(
                      normalizeNotionId(placement.clientId),
                    );
                    const site = websiteById.get(
                      normalizeNotionId(placement.supportedWebsiteId),
                    );
                    return (
                      <tr
                        key={placement.id}
                        className={
                          selected?.id === placement.id ? "is-active" : ""
                        }
                        onClick={() => setSelectedId(placement.id)}
                      >
                        <td>
                          <button
                            className="opportunity-name"
                            type="button"
                            onClick={() => setSelectedId(placement.id)}
                          >
                            {placement.name}
                          </button>
                          <span>{placement.type}</span>
                        </td>
                        <td>{client?.name ?? "—"}</td>
                        <td>{site?.name ?? "—"}</td>
                        <td>{site?.entityGroup ?? "—"}</td>
                        <td>
                          <span
                            className={`category-pill ${categoryClass(
                              placement.linkCategory,
                            )}`}
                          >
                            {placement.linkCategory}
                          </span>
                        </td>
                        <td>
                          <span
                            className={`status-pill ${
                              statusClass[placement.status]
                            }`}
                          >
                            {placement.status}
                          </span>
                        </td>
                        <td>{placement.decision || "—"}</td>
                        <td>{formatCurrency(placement.approvedCost)}</td>
                        <td>{formatDate(placement.statusEffectiveDate)}</td>
                        <td>
                          {placement.resultUrl ? (
                            <a
                              className="result-link"
                              href={placement.resultUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open result ↗
                            </a>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {visiblePlacements.length === 0 && (
                <div className="empty-state">
                  No placements match the selected status date and filters.
                </div>
              )}
            </div>

            {selected ? (
              <aside className="detail-panel">
                <div className="detail-header">
                  <span
                    className={`level-dot ${
                      decisionColorClass[selected.decision] ?? "gray"
                    }`}
                  />
                  {selected.decision || "No decision recorded"}
                </div>
                <h3>{selected.name}</h3>
                <a
                  className="detail-domain"
                  href={selectedClient?.websiteUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {domainFromUrl(selectedClient?.websiteUrl ?? "")} ↗
                </a>

                <div className="commercial-summary">
                  <span
                    className={`category-pill ${categoryClass(
                      selected.linkCategory,
                    )}`}
                  >
                    {selected.linkCategory}
                  </span>
                  <strong>{formatCurrency(selected.approvedCost)}</strong>
                  <small>{selected.status}</small>
                </div>

                <section
                  className={`invoice-protocol ${
                    selected.linkCategory === "Free" ? "is-free" : "is-paid"
                  }`}
                  aria-label="Invoice protocol"
                >
                  <div className="invoice-protocol-heading">
                    <div>
                      <span>Invoice protocol</span>
                      <strong>
                        {selected.linkCategory === "Free"
                          ? "No invoice required"
                          : "Payment visibility"}
                      </strong>
                    </div>
                    <span
                      className={`status-pill invoice-status ${
                        invoiceStatusClass[effectiveInvoiceStatus(selected)]
                      }`}
                    >
                      {effectiveInvoiceStatus(selected)}
                    </span>
                  </div>
                  <div className="invoice-protocol-facts">
                    <div>
                      <small>Placement</small>
                      <strong>{selected.type}</strong>
                    </div>
                    <div>
                      <small>Supported website</small>
                      <strong>
                        {selectedWebsite?.name ?? "Not linked in Notion"}
                      </strong>
                    </div>
                    <div>
                      <small>Approved cost</small>
                      <strong>{formatCurrency(selected.approvedCost)}</strong>
                    </div>
                  </div>
                  {selected.linkCategory === "Paid" ? (
                    selected.invoiceLink ? (
                      <div className="invoice-actions">
                        <a
                          className="invoice-link"
                          href={selected.invoiceLink}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View invoice ↗
                        </a>
                        {selected.decision !==
                          "Executive-Approved (Escalated)" &&
                          !isInvoicePaymentReview && (
                          <p className="invoice-warning">
                            The invoice should not be requested before Executive
                            authorizes the placement and proposed cost.
                          </p>
                        )}
                        {isInvoicePaymentReview && (
                          <p className="invoice-note">
                            Invoice received and returned to Executive for payment
                            confirmation.
                          </p>
                        )}
                        {selected.decision ===
                          "Executive-Approved (Escalated)" &&
                          effectiveInvoiceStatus(selected) !== "Paid" && (
                            <p className="invoice-note">
                              Invoice received. Payment is due under the
                              previously authorized cost commitment.
                            </p>
                          )}
                        {effectiveInvoiceStatus(selected) === "Paid" && (
                          <p className="invoice-paid-note">
                            Payment recorded in Notion.
                          </p>
                        )}
                        {paymentMessage && (
                          <p className="invoice-payment-message" role="status">
                            {paymentMessage}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="invoice-warning">
                        {selected.decision ===
                        "Executive-Approved (Escalated)"
                          ? "Placement and cost authorized. Coordinator may now request and record the invoice."
                          : "Invoice not requested. Authorize the placement and proposed cost first."}
                      </p>
                    )
                  ) : (
                    <p className="invoice-note">
                      Free placement — invoice status is N/A.
                    </p>
                  )}
                </section>

                {(selected.status === "Link Secured" || selected.resultUrl) && (
                  <section
                    className={`placement-result ${
                      selected.status === "Link Secured" ? "is-secured" : ""
                    }`}
                    aria-label="Placement result"
                  >
                    <span>
                      {selected.status === "Link Secured"
                        ? "Secured result"
                        : "Placement result"}
                    </span>
                    {selected.resultUrl ? (
                      <>
                        <strong>{domainFromUrl(selected.resultUrl)}</strong>
                        <a
                          href={selected.resultUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open live backlink ↗
                        </a>
                      </>
                    ) : (
                      <strong>Result URL not recorded</strong>
                    )}
                  </section>
                )}

                {selected.status === "Pending Internal Review" &&
                  selected.decision === "Pending Executive Review" && (
                    <section className="executive-review" aria-label="Executive review">
                      <div className="executive-review-heading">
                        <div>
                          <span>Decision required</span>
                          <strong>
                            {isInvoicePaymentReview
                              ? "Invoice payment confirmation"
                              : "Executive review"}
                          </strong>
                        </div>
                        <span className="review-status">Pending</span>
                      </div>
                      <div className="review-facts">
                        {isInvoicePaymentReview ? (
                          <>
                            <div>
                              <span>Approved cost</span>
                              <p>{formatCurrency(selected.approvedCost)}</p>
                            </div>
                            <div>
                              <span>Invoice</span>
                              <p>Received — payment due</p>
                            </div>
                          </>
                        ) : (
                          <>
                            <div>
                              <span>Offer terms</span>
                              <p>
                                {selectedClient?.offerTerms ||
                                  "No client terms recorded."}
                              </p>
                            </div>
                            <div>
                              <span>Next action</span>
                              <p>
                                {selected.nextAction ||
                                  "No next action recorded."}
                              </p>
                            </div>
                          </>
                        )}
                      </div>
                      {canActAsExecutive && (
                        <div className="review-controls">
                          {isInvoicePaymentReview ? (
                            <div className="review-actions payment-review-actions">
                              <button
                                className="button button-mark-paid"
                                type="button"
                                disabled={isMarkingPaid}
                                onClick={() => void markInvoicePaid()}
                              >
                                {isMarkingPaid
                                  ? "Saving…"
                                  : "Mark Invoice as Paid"}
                              </button>
                            </div>
                          ) : (
                            <>
                              <label>
                                <span>Decision comment</span>
                                <textarea
                                  value={reviewComment}
                                  onChange={(event) =>
                                    setReviewComment(event.target.value)
                                  }
                                  placeholder="Record the decision, condition, or reason. This will be added to Notion."
                                  maxLength={10000}
                                  disabled={isSubmittingReview}
                                />
                                <small>
                                  Optional when authorizing the placement and
                                  cost; required when declining the placement.
                                </small>
                              </label>
                              <div className="review-actions">
                                <button
                                  className="button button-approve"
                                  type="button"
                                  disabled={isSubmittingReview}
                                  onClick={() =>
                                    void submitExecutiveReview("approve")
                                  }
                                >
                                  {isSubmittingReview
                                    ? "Saving…"
                                    : selected.linkCategory === "Paid"
                                      ? "Authorize Cost"
                                      : "Approve Placement"}
                                </button>
                                <button
                                  className="button button-decline"
                                  type="button"
                                  disabled={
                                    isSubmittingReview || !reviewComment.trim()
                                  }
                                  onClick={() =>
                                    void submitExecutiveReview("decline")
                                  }
                                >
                                  Decline Placement
                                </button>
                              </div>
                            </>
                          )}
                          {reviewMessage && (
                            <p className="review-message" role="status">
                              {reviewMessage}
                            </p>
                          )}
                          {paymentMessage && (
                            <p className="review-message" role="status">
                              {paymentMessage}
                            </p>
                          )}
                        </div>
                      )}
                    </section>
                  )}

                {(selected.decision === "Executive-Approved (Escalated)" ||
                  selected.decision === "Executive-Declined (Escalated)") && (
                  <section
                    className={`decision-complete ${
                      selected.decision === "Executive-Approved (Escalated)"
                        ? "is-approved"
                        : "is-declined"
                    }`}
                    aria-label="Completed executive decision"
                  >
                    <div className="decision-complete-heading">
                      <div>
                        <span>Decision completed</span>
                        <strong>
                          {selected.decision === "Executive-Approved (Escalated)"
                            ? "Approved to Proceed"
                            : "Declined"}
                        </strong>
                      </div>
                      <span className="decision-complete-badge">
                        {selected.decision === "Executive-Approved (Escalated)"
                          ? "Approved"
                          : "Declined"}
                      </span>
                    </div>
                    <dl>
                      <div>
                        <dt>Decision</dt>
                        <dd>{selected.decision}</dd>
                      </div>
                      <div>
                        <dt>Decision date</dt>
                        <dd>
                          {formatDate(
                            selected.executiveDecisionCommentAt ||
                              selectedDecisionEvent?.statusEffectiveAt ||
                              selected.statusEffectiveDate,
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>Decision record</dt>
                        <dd>
                          {selected.executiveDecisionComment ||
                            "The executive decision is recorded in Notion. No Placement comment was available for this historical decision."}
                        </dd>
                      </div>
                    </dl>
                    {reviewMessage && (
                      <p className="decision-sync-message" role="status">
                        {reviewMessage}
                      </p>
                    )}
                  </section>
                )}

                <dl className="detail-list">
                  <div>
                    <dt>Client profile</dt>
                    <dd>
                      <strong>{selectedClient?.name ?? "Not linked"}</strong>
                      <span>
                        DR {selectedClient?.domainRating ?? "—"} · Traffic{" "}
                        {selectedClient?.estimatedTraffic?.toLocaleString() ??
                          "—"}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Placement type</dt>
                    <dd>
                      <strong>{selected.type}</strong>
                    </dd>
                  </div>
                  <div>
                    <dt>Supported website</dt>
                    <dd>
                      <strong>
                        {selectedWebsite?.name ?? "Not linked in Notion"}
                      </strong>
                      {selectedWebsite && (
                        <span>{selectedWebsite.entityGroup}</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Status accounting</dt>
                    <dd>
                      <strong>{selected.status}</strong>
                      <span>
                        Effective {formatDate(selected.statusEffectiveDate)}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt>Next action</dt>
                    <dd>{selected.nextAction || "No next action recorded."}</dd>
                  </div>
                </dl>

                <div className="placement-summary">
                  <div className="placement-summary-heading">
                    <div>
                      <span>Related placements</span>
                      <strong>{relatedPlacements.length}</strong>
                    </div>
                    {selectedClient && (
                      <a
                        href={selectedClient.notionUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open client ↗
                      </a>
                    )}
                  </div>
                  <div className="placement-list">
                    {relatedPlacements.slice(0, 3).map((placement) => (
                      <article key={placement.id}>
                        <div>
                          <strong>{placement.name}</strong>
                          <span
                            className={`status-pill ${
                              statusClass[placement.status]
                            }`}
                          >
                            {placement.status}
                          </span>
                        </div>
                        <p>
                          {placement.type} ·{" "}
                          {formatDate(placement.statusEffectiveDate)}
                        </p>
                      </article>
                    ))}
                    {relatedPlacements.length === 0 && (
                      <p className="placement-missing">
                        No other placements are linked to this client.
                      </p>
                    )}
                  </div>
                </div>

                <div className="detail-actions">
                  <a
                    className="button button-dark"
                    href={selected.notionUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open in Notion ↗
                  </a>
                </div>
              </aside>
            ) : (
              <aside className="detail-panel">
                <p className="empty-state">
                  Select a placement to review its details.
                </p>
              </aside>
            )}
          </div>
        </section>

        <section className="panel supported-summary" id="websites">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Supported websites</p>
              <h2>Placement coverage by destination</h2>
            </div>
            <a
              className="text-link"
              href={notionSupportedWebsitesDatabaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open directory ↗
            </a>
          </div>
          <div className="website-summary-grid">
            {websiteOptions
              .filter((site) =>
                timeFilteredPlacements.some(
                  (placement) =>
                    normalizeNotionId(placement.supportedWebsiteId) ===
                    normalizeNotionId(site.id),
                ),
              )
              .map((site) => {
                const sitePlacements = timeFilteredPlacements.filter(
                  (placement) =>
                    normalizeNotionId(placement.supportedWebsiteId) ===
                    normalizeNotionId(site.id),
                );
                return (
                  <article key={site.id}>
                    <span>{site.entityCode}</span>
                    <div>
                      <strong>{site.name}</strong>
                      <small>{site.entityGroup}</small>
                    </div>
                    <strong>{sitePlacements.length}</strong>
                  </article>
                );
              })}
          </div>
        </section>

        <section className="panel activity-panel" id="activity">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Status audit trail</p>
              <h2>Placement status activity</h2>
            </div>
            <a
              className="text-link"
              href={notionStatusHistoryDatabaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open history ↗
            </a>
          </div>
          <div className="activity-list">
            {periodStatusEvents.map((event) => {
              const placement = placementById.get(
                normalizeNotionId(event.placementId),
              );
              return (
                <article key={event.id}>
                  <span
                    className={`timeline-dot ${statusClass[event.newStatus]}`}
                    aria-hidden="true"
                  />
                  <div>
                    <p>
                      <strong>{placement?.name ?? event.name}</strong>
                      <span>{event.newStatus}</span>
                    </p>
                    <p>{eventDescription(event)}</p>
                  </div>
                  <time dateTime={event.statusEffectiveAt}>
                    {formatDate(event.statusEffectiveAt)}
                  </time>
                </article>
              );
            })}
            {periodStatusEvents.length === 0 && (
              <div className="empty-state">
                No status events were recorded in the selected period.
              </div>
            )}
          </div>
        </section>

        <footer>
          <p>
            Notion holds the working record. The dashboard reports placement
            status by effective date.
          </p>
          <p>
            <a
              href={notionClientsDatabaseUrl}
              target="_blank"
              rel="noreferrer"
            >
              Client Directory
            </a>{" "}
            · Authority &gt; relevance &gt; activity.
          </p>
        </footer>
      </section>
    </main>
  );
}
