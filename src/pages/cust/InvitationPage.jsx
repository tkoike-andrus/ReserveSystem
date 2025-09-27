// src/pages/cust/InvitationPage.jsx

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import liff from '@line/liff';
import { supabase } from '../../services/supabaseClient';

const InvitationPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('招待情報を確認しています...');
  const [error, setError] = useState('');

  const effectRan = useRef(false);

  useEffect(() => {
    if (effectRan.current === true) return;
    effectRan.current = true;

    const processInvitation = async () => {
      try {
        const liffId = import.meta.env.VITE_LIFF_ID;
        if (!liffId) throw new Error("LIFF IDが設定されていません。");
        
        setStatus('LINEに接続しています...');
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        let invitationId = searchParams.get('invitation_id');
        const salonId = searchParams.get('salon_id');

        if (salonId && !invitationId) {
          setStatus('店舗情報を確認しています...');
          const { data, error } = await supabase.functions.invoke('initiate-store-invitation', {
            body: { salon_id: salonId }
          });
          if (error) {
            const body = await error.context.json();
            throw new Error(body.error || '店舗の招待情報の作成に失敗しました。');
          }
          invitationId = data.invitation_id;
        }
        
        if (!invitationId) throw new Error("有効な招待情報が見つかりません。");

        setStatus('プロフィール情報を取得し、登録しています...');
        const [userProfile, idToken] = await Promise.all([
          liff.getProfile(),
          liff.getIDToken()
        ]);
        if (!idToken) throw new Error("本人確認に失敗しました。");
        
        const profileData = {
          line_user_id: userProfile.userId,
          display_name: userProfile.displayName,
          picture_url: userProfile.pictureUrl,
          status_message: userProfile.statusMessage,
        };

        const { error: invokeError } = await supabase.functions.invoke('create-profile', {
          body: { invitationId, profileData, idToken }
        });
        if (invokeError) {
          const body = await invokeError.context.json();
          throw new Error(body.error || 'プロフィールの登録処理に失敗しました。');
        }

        setStatus('ようこそ！登録が完了しました。');
        // 登録完了後、少し待ってからマイページに遷移
        setTimeout(() => {
          navigate('/');
        }, 1500);

      } catch (err) {
        console.error("招待処理エラー:", err);
        setError(err.message);
        setStatus('エラーが発生しました');
      }
    };

    processInvitation();
  }, [searchParams, navigate]);

  return (
    <div style={{ padding: '2rem', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h1>ご登録ありがとうございます</h1>
      <p style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{status}</p>
      
      {error && (
        <div style={{ color: '#D8000C', backgroundColor: '#FFD2D2', padding: '1rem', marginTop: '1rem', borderRadius: '8px' }}>
          <strong>エラー内容:</strong>
          <p>{error}</p>
        </div>
      )}
    </div>
  );
};

export default InvitationPage;

