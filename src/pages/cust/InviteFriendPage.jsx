// src/pages/cust/InviteFriendPage.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabaseClient';
//import liff from '@line/liff';
import { QRCodeSVG } from 'qrcode.react';
import LoadingSpinner from '../../components/LoadingSpinner';
import CustomAlert from '../../components/CustomAlert';
import './InviteFriendPage.css';

const InviteFriendPage = () => {
  const [userProfile, setUserProfile] = useState(null);
  const [salonId, setSalonId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '', type: 'info' });

  // 招待URLを生成
  const inviteUrl = useMemo(() => {
    const liffId = import.meta.env.VITE_LIFF_ID;
    if (liffId && salonId && userProfile?.userId) {
      return `https://liff.line.me/${liffId}?salonId=${salonId}&inviterId=${userProfile.userId}`;
    }
    return null;
  }, [salonId, userProfile]);

  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        await liff.init({ liffId: import.meta.env.VITE_LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
          return;
        }

        const profile = await liff.getProfile();
        setUserProfile(profile);

        // 自身のプロフィール情報から所属サロンIDを取得
        const { data, error: fetchError } = await supabase
          .from('profiles')
          .select('salon_id')
          .eq('picture_url', profile.userId)
          .single();
        
        if (fetchError || !data) {
          throw new Error('お客様の情報が見つかりませんでした。');
        }
        setSalonId(data.salon_id);

      } catch (err) {
        setError(err.message || 'ページの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, []);
  
  const handleCopyToClipboard = (textToCopy) => {
    navigator.clipboard.writeText(textToCopy).then(() => {
      setAlertInfo({ show: true, message: 'コピーしました！', type: 'success' });
    });
  };

  const handleShare = async () => {
    if (!liff.isApiAvailable('shareTargetPicker')) {
      alert('この機能はお使いのLINEバージョンでは利用できません。');
      return;
    }
    if (!inviteUrl) {
      alert('招待URLの生成に失敗しました。');
      return;
    }
    try {
      await liff.shareTargetPicker([
        {
          type: 'text',
          text: `お友達にサロンが紹介されました！\nこちらのリンクから登録してくださいね。\n${inviteUrl}`,
        },
      ]);
    } catch (err) {
      console.error('Share failed', err);
      // CanceledByUser はエラーとして扱わない
      if (err.code !== 'CanceledByUser') {
        alert('送信に失敗しました。');
      }
    }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="invite-friend-container error-message">{error}</div>;

  return (
    <div className="invite-friend-container">
      {alertInfo.show && <CustomAlert {...alertInfo} onClose={() => setAlertInfo({ ...alertInfo, show: false })} />}
      <div className="invite-card">
        <div className="invite-card-header">
          <h3>お友達を招待</h3>
        </div>
        <p className="invite-description">
          このQRコードまたはURLをお友達にシェアして、お店に招待しましょう！
        </p>
        
        {inviteUrl ? (
          <>
            <div className="qr-code-canvas">
              <QRCodeSVG value={inviteUrl} size={220} />
            </div>
            <div className="url-display">
              <input type="text" value={inviteUrl} readOnly />
              <button onClick={() => handleCopyToClipboard(inviteUrl)}>コピー</button>
            </div>
            <button className="share-on-line-button" onClick={handleShare}>
              LINEで送信する
            </button>
          </>
        ) : (
          <p>招待URLの生成に失敗しました。</p>
        )}
      </div>
    </div>
  );
};

export default InviteFriendPage;
