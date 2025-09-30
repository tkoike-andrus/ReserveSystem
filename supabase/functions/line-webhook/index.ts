// supabase/functions/line-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import * as crypto from "https://deno.land/std@0.168.0/crypto/mod.ts";
serve(async (req)=>{
  try {
    const body = await req.text();
    const webhookData = JSON.parse(body || "{}");
    console.log("--- Webhook Data Received ---");
    console.log(JSON.stringify(webhookData, null, 2));
    if (!webhookData.events || webhookData.events.length === 0) {
      return new Response("OK", {
        status: 200
      });
    }
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    // ★★★ ロジックの主要な変更点 ★★★
    // イベントごとに処理をループし、refからsalonIdを特定してから署名検証を行う
    for (const event of webhookData.events){
      if (event.type === 'follow' && event.source.type === 'user') {
        // 1. refパラメータからsalonIdとoperatorIdを抽出
        if (!event.referral || !event.referral.ref) {
          console.warn("Follow event without referral parameter. Skipping.");
          continue; // 紹介経由でない場合はスキップ
        }
        const refParams = new URLSearchParams(decodeURIComponent(event.referral.ref));
        const salonId = refParams.get('salonId');
        const operatorId = refParams.get('operatorId');
        if (!salonId) {
          throw new Error("salonId not found in referral parameter.");
        }
        // 2. 抽出したsalonIdを使って、サロン固有の情報を取得
        const { data: salon, error: salonError } = await supabaseAdmin.from('salons').select('line_channel_secret, line_channel_access_token').eq('salon_id', salonId).single();
        if (salonError || !salon) {
          throw new Error(`Salon config not found for salonId: ${salonId}`);
        }
        // 3. 取得したチャンネルシークレットで署名検証
        const signature = req.headers.get('x-line-signature');
        if (!signature) throw new Error("Signature not found.");
        const channelSecret = salon.line_channel_secret;
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey("raw", encoder.encode(channelSecret), {
          name: "HMAC",
          hash: "SHA-256"
        }, false, [
          "sign"
        ]);
        const hash = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
        const calculatedSignature = btoa(String.fromCharCode(...new Uint8Array(hash)));
        if (signature !== calculatedSignature) {
          throw new Error("Invalid signature.");
        }
        // 4. プロフィールを作成
        const lineUserId = event.source.userId;
        const profileResponse = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
          headers: {
            'Authorization': `Bearer ${salon.line_channel_access_token}`
          }
        });
        if (!profileResponse.ok) {
          throw new Error(`Failed to fetch LINE profile: ${await profileResponse.text()}`);
        }
        const lineProfile = await profileResponse.json();
        const { error: insertError } = await supabaseAdmin.from('profiles').insert({
          line_user_id: lineUserId,
          salon_id: salonId,
          operator_id: operatorId,
          display_name: lineProfile.displayName,
          picture_url: lineProfile.pictureUrl,
          status_message: lineProfile.statusMessage
        });
        if (insertError) {
          console.error("Profile insert error:", insertError);
        }
      }
    }
    return new Response("OK", {
      status: 200
    });
  } catch (error) {
    console.error(error.message);
    return new Response("Internal Server Error", {
      status: 500
    });
  }
});
