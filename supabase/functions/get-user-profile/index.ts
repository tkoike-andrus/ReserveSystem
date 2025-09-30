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
    const { user } = await req.json();
    if (!user || !user.id) {
      throw new Error("User information is missing.");
    }
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // 1. まず、operatorsテーブルにユーザーが存在するか確認
    const { data: operator, error: operatorError } = await supabaseClient.from('operators').select('*').eq('operator_id', user.id).single();
    // 運営者が見つかった場合
    if (operator) {
      return new Response(JSON.stringify({
        ...operator,
        userType: 'operator'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    // 運営者テーブルでエラーが発生したが、それが「行が見つからない」エラーでない場合は、そのエラーを投げる
    if (operatorError && operatorError.code !== 'PGRST116') {
      throw operatorError;
    }
    // 2. 運営者でなければ、profilesテーブル（お客様）に存在するか確認
    const { data: customerProfile, error: customerError } = await supabaseClient.from('profiles').select(`
        *,
        salon_customers!inner (
          salon_id,
          salons (
            salon_name
          )
        )
      `).eq('id', user.id).single();
    // お客様が見つかった場合
    if (customerProfile) {
      return new Response(JSON.stringify({
        ...customerProfile,
        userType: 'customer'
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        },
        status: 200
      });
    }
    // お客様テーブルの検索でエラーが発生した場合
    if (customerError) {
      throw customerError;
    }
    // 3. どちらのテーブルにも存在しない場合
    throw new Error("Profile not found in any table.");
  } catch (error) {
    // ★ デバッグ用にエラーの詳細をレスポンスに含める
    const detailedError = {
      message: error.message,
      code: error.code || 'N/A',
      details: error.details || 'N/A',
      stack: error.stack
    };
    console.error("Error in get-user-profile:", detailedError); // Denoのログにも出力
    return new Response(JSON.stringify({
      error: detailedError
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      },
      status: 400
    });
  }
});
