// supabase/functions/create-profile/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // CORSプリフライトリクエストに対応
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // フロントエンドから必要な情報を取得
    const { invitationId, profileData, idToken } = await req.json();
    if (!invitationId || !profileData || !idToken) {
      throw new Error("招待ID、プロフィールデータ、IDトークンは必須です。");
    }
    // --- IDトークンをLINEの公式APIで検証 ---
    const liffChannelId = Deno.env.get('VITE_LIFF_CHANNEL_ID');
    if (!liffChannelId) {
      throw new Error("VITE_LIFF_CHANNEL_IDがSupabaseのSecretsに設定されていません。");
    }
    const params = new URLSearchParams({
      id_token: idToken,
      client_id: liffChannelId
    });
    const response = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    });
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(`IDトークンの検証に失敗しました: ${errorBody.error_description || response.statusText}`);
    }
    const verificationResult = await response.json();
    // トークン内のユーザーIDと送信されたユーザーIDが一致するか確認
    if (verificationResult.sub !== profileData.line_user_id) {
      throw new Error("トークンとプロフィールデータのユーザーIDが一致しません。");
    }
    // --- データベース関数を呼び出す ---
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // RPC (Remote Procedure Call) を使って、作成したDB関数を実行
    const { error: rpcError } = await supabaseAdmin.rpc('process_new_user_invitation', {
      p_invitation_id: invitationId,
      p_line_user_id: profileData.line_user_id,
      p_display_name: profileData.display_name,
      p_picture_url: profileData.picture_url,
      p_status_message: profileData.status_message
    });
    if (rpcError) {
      // DB関数内でエラーが発生した場合は、その内容を返す
      throw rpcError;
    }
    // --- 成功レスポンスを返す ---
    return new Response(JSON.stringify({
      message: "プロフィールが正常に作成され、サロンに紐付けられました。"
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error("create-profile関数でのエラー:", error);
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
