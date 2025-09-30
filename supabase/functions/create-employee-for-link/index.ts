// supabase/functions/create-employee-for-link/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-user-id'
};
serve(async (req)=>{
  console.log("[DEBUG] Function create-employee-for-link started.");
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    // 1. Initialize a single Admin client for all operations
    const supabaseAdmin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: {
        persistSession: false
      }
    } // Avoid storing sessions on the server
    );
    console.log("[DEBUG] Supabase Admin client initialized.");
    // 2. Extract JWT from the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Authorization header is required.");
    }
    const jwt = authHeader.replace("Bearer ", "");
    console.log("[DEBUG] JWT extracted from header.");
    // 3. Verify the JWT to get the inviter's user data
    const { data: { user: inviter }, error: userError } = await supabaseAdmin.auth.getUser(jwt);
    if (userError) {
      // Forward the actual auth error for better debugging
      throw new Error(`Authentication failed: ${userError.message}`);
    }
    if (!inviter) {
      throw new Error("Authentication failed: Invalid token or user not found.");
    }
    console.log("[DEBUG] Inviter user validated successfully. ID:", inviter.id);
    // 4. Get request body
    const { operator_name } = await req.json();
    if (!operator_name) throw new Error("Staff name is required.");
    console.log(`[DEBUG] Request body parsed. operator_name: ${operator_name}`);
    // 5. Get the inviter's salon_id using their validated ID
    const { data: adminData, error: adminError } = await supabaseAdmin.from("operators").select("salon_id").eq("operator_id", inviter.id).single();
    if (adminError || !adminData) throw new Error("Inviter's salon info could not be found.");
    console.log("[DEBUG] Inviter's salon ID found:", adminData.salon_id);
    // 6. Generate new staff credentials
    const accountId = `user_${Math.random().toString(36).substring(2, 9)}`;
    const email = `${accountId}@employee.nailybook.app`;
    console.log(`[DEBUG] Generated new account info. accountId: ${accountId}, email: ${email}`);
    // 7. Create new user in Auth
    const { data: { user: newUser }, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      email_confirm: true
    });
    if (authError) throw authError;
    if (!newUser) throw new Error("Failed to create user in Auth.");
    console.log("[DEBUG] New user created in Auth. ID:", newUser.id);
    // 8. Generate the invitation link (password recovery)
    const siteUrl = Deno.env.get("SITE_URL");
    if (!siteUrl) throw new Error("SITE_URL environment variable is not set in Supabase.");
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: `${siteUrl}/employee-signup`
      }
    });
    if (linkError) throw linkError;
    console.log("[DEBUG] Password recovery link generated successfully.");
    // 9. Create the operator profile in the database
    const { error: operatorError } = await supabaseAdmin.from("operators").insert({
      operator_id: newUser.id,
      operator_name: operator_name,
      account_id: accountId,
      email: email,
      salon_id: adminData.salon_id,
      role: 'staff',
      password_change_required: true
    });
    if (operatorError) {
      console.error("[DEBUG] Failed to insert new operator. Rolling back Auth user...", operatorError);
      await supabaseAdmin.auth.admin.deleteUser(newUser.id);
      throw operatorError;
    }
    console.log("[DEBUG] New operator record inserted into DB.");
    // 10. Return success response
    return new Response(JSON.stringify({
      accountId: accountId,
      inviteLink: linkData.properties.action_link
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    console.error("[DEBUG] Critical error in function:", error.message);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
});
