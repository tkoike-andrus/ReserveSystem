// supabase/functions/line-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.0.0';
import * as crypto from "https://deno.land/std@0.168.0/crypto/mod.ts";
serve(async (req)=>{
  const requestUrl = new URL(req.url);
  const salonId = requestUrl.pathname.split('/').pop();
  if (!salonId) {
    return new Response("Salon ID is missing.", {
      status: 400
    });
  }
  try {
    const body = await req.text();
    // LINEからの検証リクエストはbodyが空か、{"events":[]} のため、
    // JSON.parseに失敗するか、eventsが空になる。その場合は即座にOKを返す。
    try {
      const webhookData = JSON.parse(body);
      if (!webhookData.events || webhookData.events.length === 0) {
        return new Response("OK", {
          status: 200
        });
      }
    } catch (e) {
      return new Response("OK", {
        status: 200
      });
    }
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const { data: salon, error: salonError } = await supabaseAdmin.from('salons').select('line_channel_secret, line_channel_access_token').eq('salon_id', salonId).single();
    if (salonError || !salon) throw new Error(`Salon not found or secret is missing for salonId: ${salonId}`);
    // --- 署名検証ロジック ---
    const signature = req.headers.get('x-line-signature');
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
      console.error("Signature mismatch!");
      return new Response("Invalid signature.", {
        status: 401
      });
    }
    // --- イベント処理 ---
    const webhookData = JSON.parse(body);
    for (const event of webhookData.events){
      if (event.type === 'follow') {
        const lineUserId = event.source.userId;
        const profileResponse = await fetch(`https://api.line.me/v2/bot/profile/${lineUserId}`, {
          headers: {
            'Authorization': `Bearer ${salon.line_channel_access_token}`
          }
        });
        if (!profileResponse.ok) {
          throw new Error(`Failed to fetch LINE profile: ${profileResponse.statusText}`);
        }
        const lineProfile = await profileResponse.json();
        const { error: insertError } = await supabaseAdmin.from('profiles').insert({
          line_user_id: lineUserId,
          salon_id: salonId,
          display_name: lineProfile.displayName,
          picture_url: lineProfile.pictureUrl
        });
        if (insertError) console.error("Profile insert error:", insertError);
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
