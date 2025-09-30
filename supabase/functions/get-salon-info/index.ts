// supabase/functions/get-salon-info/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const corsHeaders = {
  'Access-control-Allow-Origin': '*',
  'Access-control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  // CORSプリフライトリクエストに対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { user } = await req.json();
    if (!user) {
      throw new Error("ユーザー情報が提供されませんでした。");
    }
    // 管理者権限でSupabaseクライアントを初期化
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // operatorsテーブルからsalon_idを取得
    const { data: operatorData, error: operatorError } = await supabaseAdmin.from('operators').select('salon_id').eq('operator_id', user.id).single(); // 運営者は必ず1つのサロンに所属している想定
    if (operatorError) {
      // PGRST116はレコードが見つからないエラー。運営者ではない可能性。
      if (operatorError.code === 'PGRST116') {
        return new Response(JSON.stringify({
          error: "運営者情報が見つかりません。"
        }), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          },
          status: 404
        });
      }
      throw operatorError;
    }
    // 取得したsalon_idを返す
    return new Response(JSON.stringify({
      salon_id: operatorData.salon_id
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 200
    });
  } catch (error) {
    console.error('get-salon-info function error:', error.message);
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
