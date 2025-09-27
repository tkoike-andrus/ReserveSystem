// supabase/functions/line-login/index.ts (正しいエンドポイントに修正した最終確定版)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as jose from 'https://deno.land/x/jose@v4.14.4/index.ts';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const AUTH0_DOMAIN = Deno.env.get('AUTH0_DOMAIN');
    const AUTH0_CLIENT_ID = Deno.env.get('AUTH0_CLIENT_ID');
    const AUTH0_CLIENT_SECRET = Deno.env.get('AUTH0_CLIENT_SECRET');
    const REDIRECT_URI = 'https://local.craft-system.net/admin/login';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    // 1. Auth0からid_tokenを取得
    const { code, codeVerifier } = await req.json();
    // Auth0のドキュメントに従い、正しいトークンエンドポイントURLを組み立てる
    const tokenUrl = `https://${AUTH0_DOMAIN}/oauth/token`;
    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: AUTH0_CLIENT_ID,
        client_secret: AUTH0_CLIENT_SECRET,
        code: code,
        code_verifier: codeVerifier,
        redirect_uri: REDIRECT_URI
      })
    });
    if (!tokenResponse.ok) {
      // レスポンスボディをテキストとして読み取り、詳細なエラー情報をログに出力
      const errorBody = await tokenResponse.text();
      console.error('Auth0 Error Response:', errorBody);
      throw new Error(`Auth0 token exchange failed with status: ${tokenResponse.status}`);
    }
    const tokens = await tokenResponse.json();
    const { id_token } = tokens;
    const jwksUri = `https://${AUTH0_DOMAIN}/.well-known/jwks.json`;
    const JWKS = jose.createRemoteJWKSet(new URL(jwksUri));
    const { payload } = await jose.jwtVerify(id_token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      audience: AUTH0_CLIENT_ID
    });
    if (!payload || !payload.sub) {
      throw new Error("Invalid ID token from Auth0: 'sub' claim is missing.");
    }
    // 3. RPCでユーザーを検索
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth0Id = payload.sub;
    const { data: users, error: rpcError } = await supabaseAdmin.rpc('get_user_by_provider_id', {
      p_provider_id: auth0Id
    });
    if (rpcError) {
      throw rpcError;
    }
    let user = users && users.length > 0 ? users[0] : null;
    // 4. ユーザーが見つからなければ新規作成
    if (!user) {
      const safeAuth0Id = auth0Id.replace('|', '_');
      const email = payload.email || `${safeAuth0Id}@line.user`;
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: email,
        email_confirm: true,
        phone_confirm: true,
        user_metadata: {
          name: payload.name,
          picture: payload.picture
        },
        app_metadata: {
          provider: 'auth0',
          provider_id: auth0Id
        }
      });
      if (createError) throw createError;
      user = newUser.user;
    }
    if (!user) throw new Error("Failed to find or create Supabase user.");
    // 5. 管理者権限でセッション情報を生成
    const { data: sessionData, error: sessionError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email
    });
    if (sessionError) throw sessionError;
    return new Response(JSON.stringify(sessionData.properties), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Function Error:', error);
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
