// supabase/functions/cleanup-pending-invitations/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (_req)=>{
  try {
    // 管理者権限でSupabaseクライアントを初期化
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // 24時間以上前の日時を計算
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    // 'pending'ステータスで、かつ作成から24時間以上経過したレコードを削除
    const { error } = await supabaseAdmin.from('invitations').delete().eq('status', 'pending').lt('created_at', twentyFourHoursAgo);
    if (error) {
      throw error;
    }
    return new Response(JSON.stringify({
      message: "Expired pending invitations have been cleaned up."
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
