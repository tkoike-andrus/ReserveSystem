// supabase/functions/create-invitation/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
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
    // 1. 環境変数と認証ヘッダーの存在を確認
    const authHeader = req.headers.get('Authorization');
    const service_role_key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!authHeader) throw new Error("Authorization header is missing.");
    if (!service_role_key) throw new Error("Service role key is not configured.");
    // 2. 管理者権限でSupabaseクライアントを初期化
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', service_role_key, {
      auth: {
        persistSession: false
      }
    });
    // 3. トークンを検証してユーザー情報（招待者情報）を取得
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: inviter }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError) throw new Error(`User authentication failed: ${userError.message}`);
    if (!inviter) throw new Error("User not found for the provided token.");
    // 4. operatorsテーブルからsalon_idを取得
    const { data: operatorData, error: operatorError } = await supabaseAdmin.from('operators').select('salon_id').eq('operator_id', inviter.id).single();
    if (operatorError) throw new Error(`Failed to retrieve operator data: ${operatorError.message}`);
    if (!operatorData) throw new Error(`Operator not found for user ID: ${inviter.id}`);
    // 5. invitationsテーブルに「保留中(pending)」の招待レコードを作成
    const { data: invitationData, error: invitationError } = await supabaseAdmin.from('invitations').insert({
      inviter_id: inviter.id,
      salon_id: operatorData.salon_id,
      status: 'pending',
      inviter_type: 'operator'
    }).select('id') // 作成されたレコードのIDを取得
    .single();
    if (invitationError) {
      throw new Error(`Failed to create invitation record: ${invitationError.message}`);
    }
    // 6. 成功レスポンスとして「招待ID」を返す
    return new Response(JSON.stringify({
      invitation_id: invitationData.id
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    // 7. エラーレスポンス
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
