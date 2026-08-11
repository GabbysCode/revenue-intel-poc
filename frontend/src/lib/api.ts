const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export function getDashboardKPIs(params?: { region?: string; period_start?: string; period_end?: string }) {
  const sp = new URLSearchParams();
  if (params?.region) sp.set("region", params.region);
  if (params?.period_start) sp.set("period_start", params.period_start);
  if (params?.period_end) sp.set("period_end", params.period_end);
  return fetchAPI<any>(`/api/dashboard/kpis?${sp}`);
}

export function getRevenueTrend(params?: { region?: string }) {
  const sp = new URLSearchParams();
  if (params?.region) sp.set("region", params.region);
  return fetchAPI<any>(`/api/dashboard/revenue-trend?${sp}`);
}

export function getAttribution(params?: { period_start?: string; period_end?: string; region?: string }) {
  const sp = new URLSearchParams();
  if (params?.period_start) sp.set("period_start", params.period_start);
  if (params?.period_end) sp.set("period_end", params.period_end);
  if (params?.region) sp.set("region", params.region);
  return fetchAPI<any>(`/api/dashboard/attribution?${sp}`);
}

export function getForecast(params?: { horizon?: number; model?: string; region?: string }) {
  const sp = new URLSearchParams();
  if (params?.horizon) sp.set("horizon", String(params.horizon));
  if (params?.model) sp.set("model", params.model);
  if (params?.region) sp.set("region", params.region);
  return fetchAPI<any>(`/api/forecasting/predict?${sp}`);
}

export function getForecastAccuracy() {
  return fetchAPI<any>("/api/forecasting/accuracy");
}

export function getForecastHistory(params?: { region?: string }) {
  const sp = new URLSearchParams();
  if (params?.region) sp.set("region", params.region);
  return fetchAPI<any>(`/api/forecasting/history?${sp}`);
}

export function runScenario(body: any) {
  return fetchAPI<any>("/api/scenarios/run", { method: "POST", body: JSON.stringify(body) });
}

export function getTimeTravelVersions() {
  return fetchAPI<any>("/api/time-travel/versions");
}

export function getTimeTravelQuery(version: number, region?: string) {
  const sp = new URLSearchParams({ version: String(version) });
  if (region) sp.set("region", region);
  return fetchAPI<any>(`/api/time-travel/query?${sp}`);
}

export function getTimeTravelDiff(v1: number, v2: number) {
  return fetchAPI<any>(`/api/time-travel/diff?v1=${v1}&v2=${v2}`);
}

export function getDQReport() {
  return fetchAPI<any>("/api/data-quality/report");
}

export function getDQHistory(days?: number) {
  const sp = new URLSearchParams();
  if (days) sp.set("days", String(days));
  return fetchAPI<any>(`/api/data-quality/history?${sp}`);
}

export function getDQAnomalies() {
  return fetchAPI<any>("/api/data-quality/anomalies");
}

export function getCashflowWaterfall(params?: { period_start?: string; period_end?: string; region?: string }) {
  const sp = new URLSearchParams();
  if (params?.period_start) sp.set("period_start", params.period_start);
  if (params?.period_end) sp.set("period_end", params.period_end);
  if (params?.region) sp.set("region", params.region);
  return fetchAPI<any>(`/api/cashflow/waterfall?${sp}`);
}

export function getDSO(params?: { region?: string }) {
  const sp = new URLSearchParams();
  if (params?.region) sp.set("region", params.region);
  return fetchAPI<any>(`/api/cashflow/dso?${sp}`);
}

export function getARAging(params?: { region?: string }) {
  const sp = new URLSearchParams();
  if (params?.region) sp.set("region", params.region);
  return fetchAPI<any>(`/api/cashflow/ar-aging?${sp}`);
}

export function askNLP(question: string) {
  return fetchAPI<any>("/api/nlp/query", { method: "POST", body: JSON.stringify({ question }) });
}

export function getExecSummary(params: { period_start: string; period_end: string; region?: string }) {
  return fetchAPI<any>("/api/nlp/executive-summary", { method: "POST", body: JSON.stringify(params) });
}
