"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isEmailAllowed } from "@/lib/auth";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const handleCallback = async () => {
      const supabase = createClient();

      // Check if there's a hash fragment with tokens (implicit flow)
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        // Set the session from hash tokens
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!error) {
          const { data: { user } } = await supabase.auth.getUser();

          if (user?.email && isEmailAllowed(user.email)) {
            router.push("/overview");
            return;
          }

          // Email not allowed
          await supabase.auth.signOut();
          router.push("/login?error=Unauthorized email");
          return;
        }
      }

      // Check if we have a code in the URL (PKCE flow)
      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get("code");

      if (code) {
        // The route.ts handler should have processed this
        // If we're still on this page, something went wrong
        // Try exchanging the code client-side as fallback
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
          const { data: { user } } = await supabase.auth.getUser();

          if (user?.email && isEmailAllowed(user.email)) {
            router.push("/overview");
            return;
          }

          await supabase.auth.signOut();
          router.push("/login?error=Unauthorized email");
          return;
        }
      }

      // Check if already authenticated
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.email && isEmailAllowed(user.email)) {
        router.push("/overview");
        return;
      }

      // No valid auth found
      router.push("/login?error=Could not authenticate");
    };

    handleCallback();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ground">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-accent border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-muted">Signing you in...</p>
      </div>
    </div>
  );
}
