import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-user-id'
};
serve(async (req)=>{
  // This function is intended to be called by a database trigger,
  // so it doesn't need complex CORS or Auth handling.
  // However, basic OPTIONS handling is good practice.
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { record: newProfile } = await req.json();
    if (!newProfile || !newProfile.id) {
      console.warn("[DEBUG] complete-invitation: Received invalid payload from trigger.");
      // Don't throw an error, just exit gracefully as it might be a normal profile creation.
      return new Response("Payload missing profile record.", {
        status: 400
      });
    }
    const inviteeId = newProfile.id;
    const pendingInvitationId = newProfile.raw_user_meta_data?.pending_invitation_id;
    if (!pendingInvitationId) {
      console.log(`[DEBUG] complete-invitation: No pending_invitation_id found for new user ${inviteeId}. This is a normal signup.`);
      return new Response("No pending invitation ID.", {
        status: 200
      });
    }
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // 1. Get invitation details
    const { data: invitation, error: fetchError } = await supabaseAdmin.from('invitations').select('id, salon_id, status').eq('id', pendingInvitationId).single();
    if (fetchError || !invitation) {
      console.error(`[ERROR] complete-invitation: Could not find invitation with ID ${pendingInvitationId} for user ${inviteeId}.`);
      throw new Error("Invitation not found.");
    }
    if (invitation.status !== 'pending') {
      console.warn(`[WARN] complete-invitation: Invitation ${pendingInvitationId} already processed. Status: ${invitation.status}.`);
      return new Response("Invitation already processed.", {
        status: 200
      });
    }
    // 2. Link customer to salon in salon_customers
    const { error: salonCustomerError } = await supabaseAdmin.from('salon_customers').insert({
      customer_id: inviteeId,
      salon_id: invitation.salon_id
    });
    if (salonCustomerError) {
      console.error(`[ERROR] complete-invitation: Failed to insert into salon_customers for user ${inviteeId}.`, salonCustomerError);
      throw new Error("Failed to link customer to salon.");
    }
    // 3. Update invitation status
    const { error: updateError } = await supabaseAdmin.from('invitations').update({
      status: 'completed',
      invitee_id: inviteeId,
      completed_at: new Date().toISOString()
    }).eq('id', pendingInvitationId);
    if (updateError) {
      console.error(`[ERROR] complete-invitation: Failed to update invitation status for ID ${pendingInvitationId}.`, updateError);
    // This is not a critical failure, so we don't throw, just log it.
    }
    console.log(`[SUCCESS] complete-invitation: User ${inviteeId} successfully linked to salon ${invitation.salon_id} via invitation ${pendingInvitationId}.`);
    return new Response(JSON.stringify({
      success: true
    }), {
      headers: {
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error("[CRITICAL] complete-invitation:", error.message);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
