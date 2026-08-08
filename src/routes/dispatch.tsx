import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  fetchDispatchJobs,
  updateJobStatus,
  logJobTime,
  STATUS_OPTIONS,
  type DispatchJob,
  type StatusOption,
} from "@/lib/dispatch-api";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/dispatch")({
  head: () => ({
    meta: [
      { title: "Daily Dispatch — Field Engineer Jobs" },
      {
        name: "description",
        content:
          "View your assigned service jobs by account, machine model and purpose, then update machine status after service.",
      },
      { property: "og:title", content: "Daily Dispatch — Field Engineer Jobs" },
      {
        property: "og:description",
        content: "View assigned service jobs and update machine status after service.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DispatchPage,
});

function DispatchPage() {
  const navigate = useNavigate();
  const [engineer, setEngineer] = useState<{ id: string; name: string } | null>(null);
  const [jobs, setJobs] = useState<DispatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [loginTimes, setLoginTimes] = useState<Record<string, string>>({});
  const [logoutTimes, setLogoutTimes] = useState<Record<string, string>>({});
  const [startedAt, setStartedAt] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<Record<string, StatusOption>>({});
  const [spent, setSpent] = useState<Record<string, string>>({});
  const activeJob = Object.keys(loginTimes).find((r) => !logoutTimes[r]) ?? null;

  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const id = localStorage.getItem("EngineerID");
    const name = localStorage.getItem("EngineerName") ?? "";
    if (!id) {
      navigate({ to: "/" });
      return;
    }
    setEngineer({ id, name });
  }, [navigate]);

  const load = useCallback(async (id: string, name: string) => {
    setLoading(true);
    setError("");
    try {
      const all = await fetchDispatchJobs();
      const idKey = id.trim().toLowerCase();
      const nameKey = name.trim().toLowerCase();
      setJobs(
        all.filter(
          (j) =>
            (j.engineerId.trim().toLowerCase() === idKey ||
              j.engineer.trim().toLowerCase() === nameKey) &&
            (j.account || j.model || j.purpose),
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (engineer) void load(engineer.id, engineer.name);
  }, [engineer, load]);

  async function handleStatus(job: DispatchJob, status: StatusOption) {
    if (!engineer) return;
    setSaving(job.rowId);
    setError("");
    try {
      await updateJobStatus(job.rowId, status);
      setPicked((p) => ({ ...p, [job.rowId]: status }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setSaving(null);
    }
  }

  async function handleLog(job: DispatchJob, action: "login" | "logout") {
    if (!engineer) return;
    const status = picked[job.rowId];
    if (action === "logout" && !status) {
      setError("Select a status before logging out.");
      return;
    }
    setSaving(job.rowId);
    setError("");
    try {
      const at = new Date();
      const stamp = at.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      });
      await logJobTime(job.rowId, action, action === "logout" ? status : undefined);
      if (action === "login") {
        setLoginTimes((t) => ({ ...t, [job.rowId]: stamp }));
        setStartedAt((t) => ({ ...t, [job.rowId]: at.getTime() }));
      } else {
        setLogoutTimes((t) => ({ ...t, [job.rowId]: stamp }));
        const start = startedAt[job.rowId];
        if (start) {
          const mins = Math.max(0, Math.round((at.getTime() - start) / 60000));
          setSpent((s) => ({
            ...s,
            [job.rowId]: `${Math.floor(mins / 60)} hr ${mins % 60} mins`,
          }));
        }
        await load(engineer.id, engineer.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setSaving(null);
    }
  }

  function signOut() {
    localStorage.removeItem("EngineerID");
    localStorage.removeItem("EngineerName");
    navigate({ to: "/" });
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="text-3xl font-semibold tracking-tight text-foreground">
                Daily dispatch
              </h1>
              <span className="text-sm font-medium text-muted-foreground">
                {now
                  ? `Today is, ${now.toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}, ${now
                      .toLocaleTimeString("en-US", {
                        hour: "numeric",
                        minute: "2-digit",
                        second: "2-digit",
                        hour12: true,
                      })
                      .toLowerCase()}`
                  : ""}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {engineer ? `${engineer.name || "Engineer"} · ID ${engineer.id}` : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => engineer && load(engineer.id, engineer.name)}
              disabled={loading}
            >
              Refresh
            </Button>
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </header>

        {error && (
          <p className="mt-6 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Machine model</th>
                <th className="px-4 py-3 font-medium">Purpose</th>
                <th className="px-4 py-3 font-medium">
                  Remarks / Contact person / Contact no / Address
                </th>
                <th className="px-4 py-3 font-medium">Status after service</th>
                <th className="px-4 py-3 font-medium">Log in</th>
                <th className="px-4 py-3 font-medium">Log out</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    Loading jobs…
                  </td>
                </tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    No jobs assigned.
                  </td>
                </tr>
              )}
              {!loading &&
                jobs.map((job) => {
                  const loggedIn = Boolean(loginTimes[job.rowId]);
                  const loggedOut = Boolean(logoutTimes[job.rowId]);
                  return (
                  <tr key={job.rowId} className="align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{job.account}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.model}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.purpose}</td>
                    <td className="max-w-sm px-4 py-3 whitespace-pre-wrap text-muted-foreground">
                      {job.remarks}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={
                          picked[job.rowId] ??
                          (STATUS_OPTIONS.includes(job.status as StatusOption) ? job.status : "")
                        }
                        disabled={!loggedIn || loggedOut || saving === job.rowId}
                        onValueChange={(v) => handleStatus(job, v as StatusOption)}
                      >
                        <SelectTrigger className="w-64" aria-label={`Status for ${job.account}`}>
                          <SelectValue
                            placeholder={
                              !loggedIn
                                ? "Log in first"
                                : saving === job.rowId
                                  ? "Saving…"
                                  : "Select status"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_OPTIONS.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      {loggedIn ? (
                        <span className="text-xs text-muted-foreground">
                          {loginTimes[job.rowId]}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={saving === job.rowId}
                          onClick={() => handleLog(job, "login")}
                        >
                          Log in
                        </Button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {loggedOut ? (
                        <span className="text-xs text-muted-foreground">
                          {logoutTimes[job.rowId]}
                        </span>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!loggedIn || !picked[job.rowId] || saving === job.rowId}
                          onClick={() => handleLog(job, "logout")}
                        >
                          Log out
                        </Button>
                      )}
                    </td>
                  </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
