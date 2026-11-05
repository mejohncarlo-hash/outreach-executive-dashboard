export type DecisionOutcome =
  | "Pending Executive Review"
  | "Coordinator-Approved"
  | "Executive-Approved (Escalated)"
  | "Executive-Declined (Escalated)"
  | "Disqualified"
  | "";

export type LinkCategory = "Free" | "Paid";

export type InvoiceStatus =
  | "Not Requested"
  | "N/A — Free"
  | "Authorized to Request"
  | "Invoice Received — Payment Due"
  | "Paid"
  | "";

export type PlacementType =
  | "Link Insert"
  | "Guest Post"
  | "Social Media"
  | "Link Exchange";

export type PlacementStatus =
  | "Negotiating"
  | "Pending Internal Review"
  | "Approved to Proceed"
  | "Submitted"
  | "Link Secured"
  | "Declined";

export type EntityGroup =
  | "Example Services Group"
  | "Example Property Group"
  | "Example Realty Group";

export type ClientProfile = {
  id: string;
  name: string;
  websiteUrl: string;
  notionUrl: string;
  domainRating: number | null;
  estimatedTraffic: number | null;
  organicKeywords: number | null;
  commercialModels: LinkCategory[];
  availablePlacementTypes: PlacementType[];
  offerTerms: string;
  pricingNotes: string;
  relationshipOwner: string;
  primaryContact: string;
  contactEmail: string;
  costLinkInsert: number | null;
  costGuestPost: number | null;
  costSocialMedia: number | null;
  costLinkExchange: number | null;
  dateAdded: string;
  lastUpdated: string;
};

export type SupportedWebsite = {
  id: string;
  name: string;
  websiteUrl: string;
  notionUrl: string;
  entityGroup: EntityGroup;
  entityCode: string;
  active: boolean;
};

export type Placement = {
  id: string;
  name: string;
  notionUrl: string;
  clientId: string;
  supportedWebsiteId: string;
  type: PlacementType;
  linkCategory: LinkCategory;
  status: PlacementStatus;
  decision: DecisionOutcome;
  approvedCost: number | null;
  invoiceStatus: InvoiceStatus;
  invoiceLink: string;
  submissionRound: number | null;
  nextAction: string;
  resultUrl: string;
  owner: string;
  outcomeNotes: string;
  proposedAnchorText: string;
  decisionPrecedent: boolean;
  precedentNotes: string;
  statusEffectiveDate: string;
  dateAdded: string;
  lastUpdated: string;
  executiveDecisionComment?: string;
  executiveDecisionCommentAt?: string;
};

export type StatusEvent = {
  id: string;
  notionUrl: string;
  name: string;
  placementId: string;
  previousStatus: PlacementStatus | "";
  newStatus: PlacementStatus;
  statusEffectiveAt: string;
  loggedAt?: string;
  changedBy: string;
  eventKey: string;
};

export type OutreachDashboardPayload = {
  source: "notion" | "snapshot";
  syncedAt: string;
  clients: ClientProfile[];
  placements: Placement[];
  supportedWebsites: SupportedWebsite[];
  statusEvents: StatusEvent[];
  auditUpdates?: number;
  invoiceUpdates?: number;
  auditWarning?: string;
  error?: string;
};

export type LinkScanStatus =
  | "Active"
  | "Changed"
  | "Wrong Destination"
  | "Missing"
  | "Page Unavailable"
  | "Verify Manually";

export type AffectedLink = {
  sourceUrl: string;
  expectedWebsiteUrl: string;
  foundUrl: string;
  anchorText: string;
  rel: string;
  note: string;
};

export type LinkScanResult = {
  placementId: string;
  placementName: string;
  placementNotionUrl: string;
  clientName: string;
  supportedWebsiteName: string;
  linkCategory: LinkCategory;
  approvedCost: number | null;
  sourceUrl: string;
  expectedWebsiteUrl?: string;
  status: LinkScanStatus;
  affectedLinks: AffectedLink[];
  httpStatus: number | null;
  checkedAt: string;
  summary: string;
  automatedStatus?: LinkScanStatus;
  manualReview?: {
    status: LinkScanStatus;
    reviewedAt: string;
    reviewedBy: string;
  };
};

export type LinkScanPayload = {
  checkedAt: string;
  results: LinkScanResult[];
  runId?: string;
  initiatedBy?: string;
  scopeLabel?: string;
  error?: string;
};


export const notionClientsDatabaseUrl = "";

export const notionPlacementsDatabaseUrl = "";

export const notionSupportedWebsitesDatabaseUrl = "";

export const notionStatusHistoryDatabaseUrl = "";

export const fallbackClients: ClientProfile[] = [
  {
    "id": "publisher-1",
    "name": "Example Publisher 1",
    "websiteUrl": "https://publisher-1.example.com",
    "notionUrl": "",
    "domainRating": 20,
    "estimatedTraffic": 1000,
    "organicKeywords": null,
    "commercialModels": [
      "Paid"
    ],
    "availablePlacementTypes": [
      "Guest Post",
      "Link Exchange"
    ],
    "offerTerms": "Fictional sample terms for demonstration only.",
    "pricingNotes": "Synthetic data; no commercial agreement.",
    "relationshipOwner": "Coordinator",
    "primaryContact": "Example Contact",
    "contactEmail": "contact-1@example.com",
    "costLinkInsert": 25,
    "costGuestPost": 50,
    "costSocialMedia": null,
    "costLinkExchange": 0,
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  },
  {
    "id": "publisher-2",
    "name": "Example Publisher 2",
    "websiteUrl": "https://publisher-2.example.com",
    "notionUrl": "",
    "domainRating": 30,
    "estimatedTraffic": 2000,
    "organicKeywords": null,
    "commercialModels": [
      "Free"
    ],
    "availablePlacementTypes": [
      "Guest Post",
      "Link Exchange"
    ],
    "offerTerms": "Fictional sample terms for demonstration only.",
    "pricingNotes": "Synthetic data; no commercial agreement.",
    "relationshipOwner": "Coordinator",
    "primaryContact": "Example Contact",
    "contactEmail": "contact-2@example.com",
    "costLinkInsert": 0,
    "costGuestPost": 0,
    "costSocialMedia": null,
    "costLinkExchange": 0,
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  },
  {
    "id": "publisher-3",
    "name": "Example Publisher 3",
    "websiteUrl": "https://publisher-3.example.com",
    "notionUrl": "",
    "domainRating": 40,
    "estimatedTraffic": 3000,
    "organicKeywords": null,
    "commercialModels": [
      "Free"
    ],
    "availablePlacementTypes": [
      "Guest Post",
      "Link Exchange"
    ],
    "offerTerms": "Fictional sample terms for demonstration only.",
    "pricingNotes": "Synthetic data; no commercial agreement.",
    "relationshipOwner": "Coordinator",
    "primaryContact": "Example Contact",
    "contactEmail": "contact-3@example.com",
    "costLinkInsert": 0,
    "costGuestPost": 0,
    "costSocialMedia": null,
    "costLinkExchange": 0,
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  },
  {
    "id": "publisher-4",
    "name": "Example Publisher 4",
    "websiteUrl": "https://publisher-4.example.com",
    "notionUrl": "",
    "domainRating": 50,
    "estimatedTraffic": 4000,
    "organicKeywords": null,
    "commercialModels": [
      "Free"
    ],
    "availablePlacementTypes": [
      "Guest Post",
      "Link Exchange"
    ],
    "offerTerms": "Fictional sample terms for demonstration only.",
    "pricingNotes": "Synthetic data; no commercial agreement.",
    "relationshipOwner": "Coordinator",
    "primaryContact": "Example Contact",
    "contactEmail": "contact-4@example.com",
    "costLinkInsert": 0,
    "costGuestPost": 0,
    "costSocialMedia": null,
    "costLinkExchange": 0,
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  }
];

export const fallbackSupportedWebsites: SupportedWebsite[] = [
  {
    "id": "website-1",
    "name": "Example Website 1",
    "websiteUrl": "https://website-1.example.com",
    "notionUrl": "",
    "entityGroup": "Example Property Group",
    "entityCode": "DEMO1",
    "active": true
  },
  {
    "id": "website-2",
    "name": "Example Website 2",
    "websiteUrl": "https://website-2.example.com",
    "notionUrl": "",
    "entityGroup": "Example Services Group",
    "entityCode": "DEMO2",
    "active": true
  },
  {
    "id": "website-3",
    "name": "Example Website 3",
    "websiteUrl": "https://website-3.example.com",
    "notionUrl": "",
    "entityGroup": "Example Realty Group",
    "entityCode": "DEMO3",
    "active": true
  }
];

export const fallbackPlacements: Placement[] = [
  {
    "id": "placement-1",
    "name": "Example Placement 1",
    "notionUrl": "",
    "clientId": "publisher-1",
    "supportedWebsiteId": "website-1",
    "type": "Guest Post",
    "linkCategory": "Free",
    "status": "Pending Internal Review",
    "decision": "Pending Executive Review",
    "approvedCost": 0,
    "invoiceStatus": "N/A — Free",
    "invoiceLink": "",
    "submissionRound": null,
    "nextAction": "Review this fictional sample placement.",
    "resultUrl": "",
    "owner": "Coordinator",
    "outcomeNotes": "Synthetic portfolio example.",
    "proposedAnchorText": "Example website",
    "decisionPrecedent": false,
    "precedentNotes": "",
    "statusEffectiveDate": "2026-10-01",
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  },
  {
    "id": "placement-2",
    "name": "Example Placement 2",
    "notionUrl": "",
    "clientId": "publisher-2",
    "supportedWebsiteId": "website-2",
    "type": "Link Exchange",
    "linkCategory": "Free",
    "status": "Negotiating",
    "decision": "Coordinator-Approved",
    "approvedCost": 0,
    "invoiceStatus": "N/A — Free",
    "invoiceLink": "",
    "submissionRound": null,
    "nextAction": "Review this fictional sample placement.",
    "resultUrl": "",
    "owner": "Coordinator",
    "outcomeNotes": "Synthetic portfolio example.",
    "proposedAnchorText": "Example website",
    "decisionPrecedent": true,
    "precedentNotes": "",
    "statusEffectiveDate": "2026-10-01",
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  },
  {
    "id": "placement-3",
    "name": "Example Placement 3",
    "notionUrl": "",
    "clientId": "publisher-3",
    "supportedWebsiteId": "website-3",
    "type": "Guest Post",
    "linkCategory": "Paid",
    "status": "Approved to Proceed",
    "decision": "Executive-Approved (Escalated)",
    "approvedCost": 50,
    "invoiceStatus": "Authorized to Request",
    "invoiceLink": "",
    "submissionRound": null,
    "nextAction": "Review this fictional sample placement.",
    "resultUrl": "",
    "owner": "Coordinator",
    "outcomeNotes": "Synthetic portfolio example.",
    "proposedAnchorText": "Example website",
    "decisionPrecedent": false,
    "precedentNotes": "",
    "statusEffectiveDate": "2026-10-01",
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  },
  {
    "id": "placement-4",
    "name": "Example Placement 4",
    "notionUrl": "",
    "clientId": "publisher-4",
    "supportedWebsiteId": "website-1",
    "type": "Guest Post",
    "linkCategory": "Paid",
    "status": "Link Secured",
    "decision": "Executive-Approved (Escalated)",
    "approvedCost": 50,
    "invoiceStatus": "Paid",
    "invoiceLink": "",
    "submissionRound": 1,
    "nextAction": "Review this fictional sample placement.",
    "resultUrl": "https://publisher-4.example.com/sample-article",
    "owner": "Coordinator",
    "outcomeNotes": "Synthetic portfolio example.",
    "proposedAnchorText": "Example website",
    "decisionPrecedent": false,
    "precedentNotes": "",
    "statusEffectiveDate": "2026-10-01",
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  },
  {
    "id": "placement-5",
    "name": "Example Placement 5",
    "notionUrl": "",
    "clientId": "publisher-1",
    "supportedWebsiteId": "website-2",
    "type": "Link Exchange",
    "linkCategory": "Free",
    "status": "Submitted",
    "decision": "Executive-Approved (Escalated)",
    "approvedCost": 0,
    "invoiceStatus": "N/A — Free",
    "invoiceLink": "",
    "submissionRound": 1,
    "nextAction": "Review this fictional sample placement.",
    "resultUrl": "https://publisher-1.example.com/sample-article",
    "owner": "Coordinator",
    "outcomeNotes": "Synthetic portfolio example.",
    "proposedAnchorText": "Example website",
    "decisionPrecedent": false,
    "precedentNotes": "",
    "statusEffectiveDate": "2026-10-01",
    "dateAdded": "2026-10-01",
    "lastUpdated": "2026-10-01T09:00:00Z"
  }
];
export const fallbackStatusEvents: StatusEvent[] = fallbackPlacements.map(
  (placement) => ({
    id: `initial-${placement.id}`,
    notionUrl: notionStatusHistoryDatabaseUrl,
    name: `${placement.name} — ${placement.status}`,
    placementId: placement.id,
    previousStatus: "",
    newStatus: placement.status,
    statusEffectiveAt: placement.statusEffectiveDate,
    changedBy: "",
    eventKey: `initial:${placement.id}:${placement.statusEffectiveDate}:${placement.status}`,
  }),
);
