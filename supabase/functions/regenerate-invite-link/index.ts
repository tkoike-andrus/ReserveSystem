// supabase/functions/regenerate-invite-link/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { account_id } = await req.json();
    if (!account_id) throw new Error("アカウントIDが必要です。");
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: operatorData, error: operatorError } = await supabaseAdmin.from('operators').select('email').eq('account_id', account_id).single();
    if (operatorError || !operatorData) throw new Error("指定されたアカウントIDのスタッフが見つかりません。");
    const redirectToUrl = 'https://local.craft-system.net/invite';
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: operatorData.email,
      options: {
        redirectTo: redirectToUrl,
        expiresIn: 86400
      }
    });
    if (linkError) throw linkError;
    return new Response(JSON.stringify({
      inviteLink: linkData.properties.action_link
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
      status: 400
    });
  }
});
