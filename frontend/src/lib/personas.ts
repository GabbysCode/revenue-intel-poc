export type Persona = {
  id: string;
  name: string;
  title: string;
  email: string;
  initials: string;
  accent: string;
  description: string;
  focus: string;
  /** When set, filters org scope to this `region_id` if the user has not picked a region in the header */
  defaultRegionId?: string;
};

/** Demo personas for RevIntel — scope views and copy; not separate Databricks identities. */
export const PERSONAS: Persona[] = [
  {
    id: "cfo",
    name: "Alex Morgan",
    title: "Chief Financial Officer",
    email: "alex.morgan@kpmg.client",
    initials: "AM",
    accent: "#81d4e2",
    description: "Global revenue, margin, and cash visibility with board-ready rollups.",
    focus: "Executive KPIs, consolidated forecasts, risk to plan",
  },
  {
    id: "regional",
    name: "Priya Sharma",
    title: "Regional Finance Lead — EMEA",
    email: "priya.sharma@kpmg.client",
    initials: "PS",
    accent: "#a78bfa",
    description: "Regional P&L, intercompany, and local compliance views.",
    focus: "EMEA performance, region filters, scenario vs actuals",
    defaultRegionId: "R002",
  },
  {
    id: "fpna",
    name: "James Okonkwo",
    title: "FP&A Director",
    email: "james.okonkwo@kpmg.client",
    initials: "JO",
    accent: "#4ade80",
    description: "Driver-based planning, reforecasting, and variance analysis.",
    focus: "Forecasts, scenarios, time series, what-if",
  },
  {
    id: "data",
    name: "Sarah Chen",
    title: "Data & Analytics Lead",
    email: "sarah.chen@kpmg.client",
    initials: "SC",
    accent: "#fb923c",
    description: "Data quality, lineage, and ad hoc exploration with Genie.",
    focus: "Data quality, time travel, natural language questions",
  },
  {
    id: "executive",
    name: "Maria Santos",
    title: "Exec Sponsor — Service Lines",
    email: "maria.santos@kpmg.client",
    initials: "MS",
    accent: "#f472b6",
    description: "Read-only, high-signal summary for leadership reviews.",
    focus: "Dashboard, cash flow, concise narratives",
  },
];

/**
 * Optional deep link to "your" Genie room — shown on the login page so demo
 * viewers can pop straight into Databricks. Leave the env var unset to hide
 * the link entirely; the rest of the app works unchanged.
 *
 * Set in `frontend/.env.local`:
 *   NEXT_PUBLIC_GENIE_ROOM_URL=https://<workspace>/genie/rooms/<space-id>?o=<org>
 */
export const GENIE_ROOM_URL: string =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_GENIE_ROOM_URL?.trim()) || "";

export function getPersonaById(id: string | undefined | null): Persona | null {
  if (!id) return null;
  return PERSONAS.find((p) => p.id === id) ?? null;
}

export function getDefaultRegionForPersonaId(id: string | null | undefined): string | undefined {
  return getPersonaById(id)?.defaultRegionId;
}
