export const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbyW4tvXHQYZ3MqlQXmqxm2WMjY1ohf2eoiY2-ZwPDYhBCx9wD15RUuW7uCmf8ALQnGE/exec";

export type Row = unknown[];

export const STATUS_OPTIONS = [
  "Running Good",
  "Unresponded / Backlog",
  "Not Running / Running with Parts for Replacement",
] as const;
export type StatusOption = (typeof STATUS_OPTIONS)[number];

function toRows(data: unknown): Row[] {
  if (!Array.isArray(data)) {
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      for (const key of ["data", "rows", "records", "result", "values"]) {
        if (Array.isArray(obj[key])) return toRows(obj[key]);
      }
    }
    return [];
  }
  return data.map((r) =>
    Array.isArray(r) ? (r as Row) : Object.values(r as Record<string, unknown>),
  );
}

function isBlank(row: Row) {
  return row.every((c) => String(c ?? "").trim() === "");
}

async function getRows(params: Record<string, string> = {}): Promise<Row[]> {
  const qs = new URLSearchParams({ ...params, t: String(Date.now()) });
  const res = await fetch(`${SHEET_URL}?${qs}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The data source did not return JSON.");
  }
  return toRows(parsed).filter((r) => !isBlank(r));
}

/** Users tab: [EngineerID, EngineerName, Username, Password] */
export async function fetchLoginRows(): Promise<Row[]> {
  let rows = await getRows({ sheet: "Users tab" });
  if (!rows.length) rows = await getRows();
  if (rows.length && String(rows[0]?.[0] ?? "").toLowerCase().includes("engineer")) {
    return rows.slice(1);
  }
  return rows;
}

export type DispatchJob = {
  rowId: string;
  engineerId: string;
  engineer: string;
  account: string;
  model: string;
  purpose: string;
  remarks: string;
  status: string;
};

const HEADER_HINTS: Record<keyof Omit<DispatchJob, "rowId">, string[]> = {
  engineerId: ["engineer id", "engineerid", "eng id", "id"],
  engineer: ["engineer", "technician", "assigned"],
  account: ["account", "customer", "client"],
  model: ["model", "machine"],
  purpose: ["purpose", "service", "job type"],
  remarks: ["remark", "contact", "address"],
  status: ["status"],
};

function looksLikeHeader(row: Row) {
  const joined = row.map((c) => String(c ?? "").toLowerCase()).join(" ");
  return joined.includes("account") || joined.includes("machine") || joined.includes("purpose");
}

function mapByHeader(header: Row) {
  const cells = header.map((c) => String(c ?? "").toLowerCase());
  const idx = {} as Record<keyof typeof HEADER_HINTS, number>;
  (Object.keys(HEADER_HINTS) as (keyof typeof HEADER_HINTS)[]).forEach((key) => {
    idx[key] = cells.findIndex((c) => HEADER_HINTS[key].some((h) => c.includes(h)));
  });
  return idx;
}

/** Daily Dispatch tab */
export async function fetchDispatchJobs(): Promise<DispatchJob[]> {
  const rows = await getRows({ sheet: "Daily Dispatch" });
  if (!rows.length) return [];

  const first = rows[0] as Row;
  const hasHeader = looksLikeHeader(first);
  const idx = hasHeader
    ? mapByHeader(first)
    : { engineerId: 1, engineer: 0, account: 2, model: 3, purpose: 4, remarks: 5, status: 6 };
  if (hasHeader && idx.engineerId < 0) idx.engineerId = 1;
  const body = hasHeader ? rows.slice(1) : rows;

  const pick = (row: Row, i: number) => (i >= 0 ? String(row[i] ?? "").trim() : "");

  return body.map((row, i) => ({
    rowId: String(hasHeader ? i + 2 : i + 1),
    engineerId: pick(row, idx.engineerId),
    engineer: pick(row, idx.engineer),
    account: pick(row, idx.account),
    model: pick(row, idx.model),
    purpose: pick(row, idx.purpose),
    remarks: pick(row, idx.remarks),
    status: pick(row, idx.status),
  }));
}

export async function updateJobStatus(rowId: string, status: StatusOption) {
  const body = new URLSearchParams({ row: rowId, status });
  await fetch(SHEET_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}

export async function logJobTime(rowId: string, action: "login" | "logout") {
  const body = new URLSearchParams({
    row: rowId,
    action,
    time: new Date().toLocaleString(),
  });
  await fetch(SHEET_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}
