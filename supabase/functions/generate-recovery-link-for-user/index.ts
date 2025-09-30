import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-user-id'
};
serve(async (req)=>{
  // OPTIONSメソッド（preflightリクエスト）への対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log("[DEBUG] generate-recovery-link-for-user: Function started.");
    // リクエストボディからuserIdを取得
    const { userId } = await req.json();
    console.log(`[DEBUG] generate-recovery-link-for-user: Received userId: ${userId}`);
    if (!userId) {
      throw new Error("User ID is required in the request body.");
    }
    // 環境変数の存在チェック
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const siteUrl = Deno.env.get('SITE_URL');
    if (!supabaseUrl || !serviceRoleKey || !siteUrl) {
      console.error("[ERROR] Missing required environment variables.");
      throw new Error("Missing required environment variables (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SITE_URL).");
    }
    console.log("[DEBUG] generate-recovery-link-for-user: Environment variables loaded.");
    // 管理者権限でSupabaseクライアントを初期化
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    console.log("[DEBUG] generate-recovery-link-for-user: Supabase admin client created.");
    // operatorsテーブルからユーザー情報を取得
    const { data: operator, error: operatorError } = await supabaseAdmin.from('operators').select('email, password_change_required').eq('operator_id', userId).single();
    if (operatorError) throw operatorError;
    if (!operator) throw new Error("Operator not found for the given user ID.");
    console.log("[DEBUG] generate-recovery-link-for-user: Operator found:", operator);
    // 既にパスワード設定済みかチェック
    if (!operator.password_change_required) {
      return new Response(JSON.stringify({
        error: "This user has already completed registration."
      }), {
        status: 409,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const email = operator.email;
    const redirectTo = `${siteUrl}/employee-signup`;
    console.log(`[DEBUG] generate-recovery-link-for-user: Generating recovery link for email: ${email} with redirect to: ${redirectTo}`);
    // パスワードリセット（回復）リンクを生成
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectTo
      }
    });
    if (linkError) throw linkError;
    console.log("[DEBUG] generate-recovery-link-for-user: Recovery link generated successfully.");
    // 生成した本物の招待リンクを返す
    return new Response(JSON.stringify({
      recoveryLink: linkData.properties.action_link
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("[ERROR] Critical error in generate-recovery-link-for-user:", error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
