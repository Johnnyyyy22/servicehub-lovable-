import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  fetchDispatchJobs,
  updateJobStatus,
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

  useEffect(() => {
    const id = localStorage.getItem("EngineerID");
    const name = localStorage.getItem("EngineerName") ?? "";
    if (!id) {
      navigate({ to: "/" });
      return;
    }
    setEngineer({ id, name });
  }, [navigate]);

  const load = useCallback(async (name: string) => {
    setLoading(true);
    setError("");
    try {
      const all = await fetchDispatchJobs();
      const key = name.trim().toLowerCase();
      setJobs(
        all.filter(
          (j) => j.engineer.toLowerCase() === key && (j.account || j.model || j.purpose),
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
    if (engineer) void load(engineer.name);
  }, [engineer, load]);

  async function handleStatus(job: DispatchJob, status: StatusOption) {
    if (!engineer) return;
    setSaving(job.rowId);
    setError("");
    try {
      await updateJobStatus(job.rowId, status);
      await load(engineer.name);
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
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Daily dispatch
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {engineer ? `${engineer.name || "Engineer"} · ID ${engineer.id}` : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => engineer && load(engineer.name)}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    Loading jobs…
                  </td>
                </tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                    No jobs assigned.
                  </td>
                </tr>
              )}
              {!loading &&
                jobs.map((job) => (
                  <tr key={job.rowId} className="align-top">
                    <td className="px-4 py-3 font-medium text-foreground">{job.account}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.model}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.purpose}</td>
                    <td className="max-w-sm px-4 py-3 whitespace-pre-wrap text-muted-foreground">
                      {job.remarks}
                    </td>
                    <td className="px-4 py-3">
                      <Select
                        value={STATUS_OPTIONS.includes(job.status as StatusOption) ? job.status : undefined}
                        disabled={saving === job.rowId}
                        onValueChange={(v) => handleStatus(job, v as StatusOption)}
                      >
                        <SelectTrigger className="w-64" aria-label={`Status for ${job.account}`}>
                          <SelectValue
                            placeholder={saving === job.rowId ? "Saving…" : "Select status"}
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
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
