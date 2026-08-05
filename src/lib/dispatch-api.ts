export const SHEET_URL =
  "https://script.google.com/macros/s/AKfycby4eQ0CcOE__mTwL6OUT4hzgcCeQRASagSLiEiptxVOzsFllSlQGvyIbgsdU6umKLox/exec";

export type Row = unknown[];

function toRows(data: unknown): Row[] {
  if (!Array.isArray(data)) {
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;
      for (const key of ["data", "rows", "records", "result"]) {
        if (Array.isArray(obj[key])) return toRows(obj[key]);
      }
    }
    return [];
  }
  return data.map((r) =>
    Array.isArray(r) ? (r as Row) : Object.values(r as Record<string, unknown>),
  );
}

export async function fetchRows(): Promise<Row[]> {
  const res = await fetch(`${SHEET_URL}?t=${Date.now()}`);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The data source did not return JSON.");
  }
  const rows = toRows(parsed);
  // Drop a header row if present
  if (rows.length && String(rows[0]?.[0] ?? "").toLowerCase().includes("engineer")) {
    return rows.slice(1);
  }
  return rows;
}

export async function updateStatus(row: string, status: string) {
  const body = new URLSearchParams({ row, status });
  await fetch(SHEET_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
}