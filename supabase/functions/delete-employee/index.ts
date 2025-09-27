// supabase/functions/delete-employee/index.ts
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
    const { operator_id } = await req.json();
    if (!operator_id) {
      throw new Error("削除するスタッフのIDが必要です。");
    }
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // ステップ1: 'operators'テーブルからプロフィール情報を削除
    const { error: operatorError } = await supabaseAdmin.from('operators').delete().eq('operator_id', operator_id);
    // もしここでエラーが出ても、auth.usersに存在しないケースを考慮して処理を続行
    if (operatorError) {
      console.warn(`operatorsテーブルからの削除に失敗しました（既に削除済みの場合もあります）: ${operatorError.message}`);
    }
    // ステップ2: Supabase Authから認証ユーザーを削除
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(operator_id);
    // "User not found"エラーは、既に削除済みの場合なので無視する
    if (deleteError && deleteError.message !== 'User not found') {
      throw deleteError;
    }
    return new Response(JSON.stringify({
      message: "スタッフを正常に削除しました。"
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
