export const REGIONS = [
  { id: "R001", name: "Americas" },
  { id: "R002", name: "EMEA" },
  { id: "R003", name: "APAC" },
  { id: "R004", name: "UK" },
];

export const SERVICE_LINES = [
  { id: "SL01", name: "Audit & Assurance", color: "#60a5fa" },
  { id: "SL02", name: "Tax & Legal", color: "#a78bfa" },
  { id: "SL03", name: "Advisory", color: "#fb923c" },
  { id: "SL04", name: "Consulting", color: "#38bdf8" },
  { id: "SL05", name: "Risk & Compliance", color: "#f87171" },
  { id: "SL06", name: "Technology", color: "#2dd4bf" },
];

export const CHART_COLORS = ["#4ade80", "#60a5fa", "#a78bfa", "#fb923c", "#f87171", "#38bdf8", "#facc15"];

export const NAV_ITEMS = [
  {
    group: "Executive KPIs",
    items: [
      { label: "Overview", href: "/", icon: "LayoutDashboard" },
      { label: "Chargeable Hours", href: "/chargeable-hours", icon: "Clock" },
      { label: "Rate Per Hour", href: "/rate-per-hour", icon: "PoundSterling" },
      { label: "Gross Fee Days", href: "/gross-fee-days", icon: "CalendarDays" },
      { label: "Unbilled Days", href: "/unbilled-days", icon: "AlertCircle" },
      { label: "Sales Forecast", href: "/sales-forecast", icon: "TrendingUp" },
      { label: "Chargeability", href: "/chargeability", icon: "Percent" },
      { label: "Delivery Financials", href: "/delivery-financials", icon: "Briefcase" },
      { label: "Staff Attrition", href: "/staff-attrition", icon: "Users" },
    ],
  },
];
