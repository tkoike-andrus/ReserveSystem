import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-user-id'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error("Authorization header is missing.");
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: inviter }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`User authentication failed: ${userError.message}`);
    if (!inviter) throw new Error("Inviter not found for the provided token.");
    const { data: operatorData, error: operatorError } = await supabaseAdmin.from('operators').select('salon_id, salons(salon_name)').eq('operator_id', inviter.id).single();
    if (operatorError) throw new Error(`Failed to retrieve operator data: ${operatorError.message}`);
    if (!operatorData) throw new Error(`Operator not found for user ID: ${inviter.id}`);
    const { data: invitationData, error: invitationError } = await supabaseAdmin.from('invitations').insert({
      inviter_id: inviter.id,
      salon_id: operatorData.salon_id,
      status: 'pending',
      inviter_type: 'operator'
    }).select('id').single();
    if (invitationError) throw new Error(`Failed to create invitation record: ${invitationError.message}`);
    return new Response(JSON.stringify({
      invitation_id: invitationData.id,
      salon_name: operatorData.salons.salon_name
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    return new Response(JSON.stringify({
      error: error.message
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 500
    });
  }
});
