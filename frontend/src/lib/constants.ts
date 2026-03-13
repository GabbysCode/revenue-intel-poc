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
  { group: "Revenue Intelligence", items: [
    { label: "Dashboard", href: "/", icon: "LayoutDashboard" },
    { label: "Live Feed", href: "/live", icon: "Radio" },
    { label: "Cash Flow", href: "/cashflow", icon: "DollarSign" },
  ]},
  { group: "AI & Analytics", items: [
    { label: "Forecasting", href: "/forecasting", icon: "TrendingUp" },
    { label: "Scenarios", href: "/scenarios", icon: "GitBranch" },
  ]},
  { group: "Data Platform", items: [
    { label: "Time Travel", href: "/time-travel", icon: "Clock" },
    { label: "Data Quality", href: "/data-quality", icon: "ShieldCheck" },
  ]},
];
