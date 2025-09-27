// supabase/functions/create-employee/index.ts
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
    const { operator_name } = await req.json();
    if (!operator_name) throw new Error("スタッフ名が必要です。");
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const adminUserId = req.headers.get('x-admin-user-id');
    if (!adminUserId) throw new Error("管理者情報が見つかりません。");
    const accountId = `user_${Math.random().toString(36).substring(2, 9)}`;
    const email = `${accountId}@employee.nailybook.app`;
    const { data: { user }, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      email_confirm: true
    });
    if (authError) throw authError;
    if (!user) throw new Error("ユーザーの作成に失敗しました。");
    const redirectToUrl = 'https://local.craft-system.net/invite';
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectToUrl,
        expiresIn: 86400
      }
    });
    if (linkError) throw linkError;
    const { data: adminData, error: adminError } = await supabaseAdmin.from('operators').select('salon_id').eq('operator_id', adminUserId).single();
    if (adminError || !adminData) throw new Error("管理者情報が見つかりません。");
    const { error: operatorError } = await supabaseAdmin.from('operators').insert({
      operator_id: user.id,
      operator_name: operator_name,
      account_id: accountId,
      email: email,
      salon_id: adminData.salon_id,
      role: 'staff',
      password_change_required: true
    });
    if (operatorError) throw operatorError;
    return new Response(JSON.stringify({
      accountId: accountId,
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
