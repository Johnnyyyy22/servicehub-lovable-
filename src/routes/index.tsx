import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { fetchRows } from "@/lib/dispatch-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Engineer Login — Dispatch Portal" },
      {
        name: "description",
        content:
          "Sign in with your engineer credentials to view and update your assigned dispatch jobs.",
      },
      { property: "og:title", content: "Engineer Login — Dispatch Portal" },
      {
        property: "og:description",
        content: "Sign in to view and update your assigned dispatch jobs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const rows = await fetchRows();
      const u = username.trim().toLowerCase();
      const p = password.trim().toLowerCase();
      const match = rows.find(
        (r) =>
          String(r[2]).trim().toLowerCase() === u &&
          String(r[3]).trim().toLowerCase() === p,
      );
      if (!match) {
        setError("Invalid login");
        return;
      }
      localStorage.setItem("EngineerID", String(match[0]));
      localStorage.setItem("EngineerName", String(match[1] ?? ""));
      navigate({ to: "/dispatch" });
    } catch {
      setError("Invalid login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Engineer login</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sign in to see the jobs dispatched to you.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Checking…" : "Log in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
