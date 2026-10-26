import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { isEmailAllowed } from "@/lib/auth";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/overview";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Double-check: verify email is allowed (server-side security)
      const { data: { user } } = await supabase.auth.getUser();

      if (user?.email && isEmailAllowed(user.email)) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // Email not allowed - sign them out and reject
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=Unauthorized email`);
    }
  }

  // Return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/login?error=Could not authenticate`);
}
