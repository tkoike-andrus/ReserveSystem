// supabase/functions/create-friend-invitation/index.ts
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
    // 1. リクエストボディからIDトークンを取得
    const { idToken } = await req.json();
    if (!idToken) throw new Error("ID token is required.");
    // 2. LINE APIでIDトークンを検証し、招待者のLINEユーザーIDを取得
    const liffChannelId = Deno.env.get('VITE_LIFF_CHANNEL_ID');
    if (!liffChannelId) throw new Error("LIFF Channel ID is not configured.");
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
    if (!response.ok) throw new Error("ID token verification failed.");
    const verificationResult = await response.json();
    const inviterLineId = verificationResult.sub;
    // 3. 管理者権限でSupabaseクライアントを初期化
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // 4. 招待者のline_user_idから、所属するsalon_idを特定する
    //    (完了済みの招待レコードからsalon_idを探す)
    const { data: lastInvitation, error: findError } = await supabaseAdmin.from('invitations').select('salon_id').eq('invitee_id', inviterLineId).eq('status', 'completed').limit(1).single();
    if (findError || !lastInvitation) {
      throw new Error("Could not determine the salon for the inviting user.");
    }
    const salonId = lastInvitation.salon_id;
    // 5. invitationsテーブルに「保留中」の招待レコードを作成
    const { data: newInvitation, error: insertError } = await supabaseAdmin.from('invitations').insert({
      inviter_id: inviterLineId,
      salon_id: salonId,
      status: 'pending',
      inviter_type: 'customer'
    }).select('id').single();
    if (insertError) throw insertError;
    // 6. 成功レスポンスとして「招待ID」を返す
    return new Response(JSON.stringify({
      invitation_id: newInvitation.id
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
