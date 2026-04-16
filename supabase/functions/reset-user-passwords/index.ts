import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const NIKHIL_OLD_ID = "95b25c98-6f7f-488a-8194-733bc3230a7c";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const results = [];

    // Recreate Nikhil: delete old broken record, create fresh one, relink profile
    const { error: delErr } = await adminClient.auth.admin.deleteUser(NIKHIL_OLD_ID);
    results.push({ step: "delete_nikhil", error: delErr?.message ?? null });

    const { data: newUser, error: createErr } = await adminClient.auth.admin.createUser({
      email: "nikhil@prachifulagar.app",
      password: "Nikhil@2024",
      email_confirm: true,
      user_metadata: { display_name: "Nikhil", role: "staff" },
      app_metadata: { provider: "email", providers: ["email"] },
    });
    results.push({ step: "create_nikhil", newId: newUser?.user?.id ?? null, error: createErr?.message ?? null });

    if (newUser?.user?.id && newUser.user.id !== NIKHIL_OLD_ID) {
      // Update user_profiles to point to new ID
      const { error: profileErr } = await adminClient
        .from("user_profiles")
        .update({ id: newUser.user.id })
        .eq("id", NIKHIL_OLD_ID);
      results.push({ step: "relink_profile", error: profileErr?.message ?? null });
    }

    // Verify Prachi still works
    const { error: prachiErr } = await adminClient.auth.admin.updateUserById(
      "235b2935-7580-4298-8633-ba19dedfef66",
      { password: "Prachi@2024" }
    );
    results.push({ step: "prachi_password", error: prachiErr?.message ?? null });

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
