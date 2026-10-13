"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({
        type: "success",
        text: "Check your email for the login link!",
      });
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ground px-4">
      <div className="w-full max-w-md">
        <div className="bg-white border border-border rounded-xl p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8">
            <svg
              width="40"
              height="40"
              viewBox="0 0 32 32"
              aria-hidden="true"
            >
              <path
                d="M3 17 L16 6 L29 17"
                fill="none"
                stroke="#F08A4B"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 15 V26 H24 V15"
                fill="none"
                stroke="#1A1D21"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
            </svg>
            <div>
              <h1 className="font-archivo font-extrabold text-2xl">
                Ace Roofing NJ
              </h1>
              <p className="text-xs text-muted uppercase tracking-wider">
                Marketing Dashboard
              </p>
            </div>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-semibold mb-2"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full px-4 py-3 border border-border-dark rounded-lg bg-white text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent text-white font-semibold py-3 px-4 rounded-lg hover:bg-accent/90 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Sending link..." : "Send magic link"}
            </button>
          </form>

          {message && (
            <div
              className={`mt-4 p-3 rounded-lg text-sm ${
                message.type === "success"
                  ? "bg-on-target-bg text-on-target"
                  : "bg-below-target-bg text-below-target"
              }`}
            >
              {message.text}
            </div>
          )}

          <p className="mt-6 text-center text-sm text-muted">
            We&apos;ll send you a magic link to sign in.
          </p>
        </div>
      </div>
    </div>
  );
}
