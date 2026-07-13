"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-bg px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-ink-border bg-ink-surface p-8 shadow-sm"
      >
        <h1 className="mb-6 text-lg font-semibold text-ink-text">Sign in</h1>

        <label className="mb-1 block text-sm text-ink-muted">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
        />

        <label className="mb-1 block text-sm text-ink-muted">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-ink-border bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
        />

        {error && <p className="mb-4 text-sm text-status-hold">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-60"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
