import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { fetchRows, updateStatus, type Row } from "@/lib/dispatch-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/dispatch")({
  head: () => ({
    meta: [
      { title: "Dispatch Board — Field Engineer Jobs" },
      {
        name: "description",
        content:
          "View assigned jobs, track descriptions and statuses, and update job progress in real time.",
      },
      { property: "og:title", content: "Dispatch Board — Field Engineer Jobs" },
      {
        property: "og:description",
        content: "View assigned jobs and update their status in real time.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DispatchPage,
});

type Job = { id: string; description: string; status: string };

function rowToJob(row: Row): Job {
  const base = row.length >= 7 ? 4 : Math.max(row.length - 3, 1);
  return {
    id: String(row[base] ?? ""),
    description: String(row[base + 1] ?? ""),
    status: String(row[base + 2] ?? ""),
  };
}

function DispatchPage() {
  const navigate = useNavigate();
  const [engineer, setEngineer] = useState<{ id: string; name: string } | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
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

  const load = useCallback(async (engineerId: string) => {
    setLoading(true);
    setError("");
    try {
      const rows = await fetchRows();
      const mine = rows
        .filter((r) => String(r[0]).trim() === engineerId.trim())
        .map(rowToJob)
        .filter((j) => j.id !== "");
      setJobs(mine);
      setDrafts(Object.fromEntries(mine.map((j) => [j.id, j.status])));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load jobs.");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (engineer) void load(engineer.id);
  }, [engineer, load]);

  async function handleUpdate(job: Job) {
    if (!engineer) return;
    setSaving(job.id);
    try {
      await updateStatus(job.id, drafts[job.id] ?? job.status);
      await load(engineer.id);
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
      <div className="mx-auto w-full max-w-4xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">
              Dispatch board
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {engineer ? `${engineer.name || "Engineer"} · ID ${engineer.id}` : "Loading…"}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => engineer && load(engineer.id)}
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

        <div className="mt-6 overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Job ID</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    Loading jobs…
                  </td>
                </tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    No jobs assigned.
                  </td>
                </tr>
              )}
              {!loading &&
                jobs.map((job) => (
                  <tr key={job.id} className="align-middle">
                    <td className="px-4 py-3 font-medium text-foreground">{job.id}</td>
                    <td className="px-4 py-3 text-muted-foreground">{job.description}</td>
                    <td className="px-4 py-3">
                      <Input
                        value={drafts[job.id] ?? ""}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [job.id]: e.target.value }))
                        }
                        className="h-9 w-40"
                        aria-label={`Status for job ${job.id}`}
                      />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        size="sm"
                        onClick={() => handleUpdate(job)}
                        disabled={saving === job.id}
                      >
                        {saving === job.id ? "Saving…" : "Update"}
                      </Button>
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