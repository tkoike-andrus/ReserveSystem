// src/pages/admin/InviteCustomerPage.jsx

import React, { useState, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import CustomAlert from '../../components/CustomAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import './InviteCustomerPage.css';

const InviteCustomerPage = () => {
  const { profile } = useUser();
  const [loading, setLoading] = useState(false);
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '', type: 'info' });
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [salonName, setSalonName] = useState('');

  const generateInvitation = useCallback(async () => {
    //console.log('[デバッグ] 招待生成プロセスを開始します。');
    if (!profile) {
      console.warn('[デバッグ] プロフィールが見つからないため、処理を中断しました。');
      setAlertInfo({ show: true, message: '招待情報の生成にはログインが必要です。', type: 'error' });
      return;
    }

    setLoading(true);
    setQrCodeUrl('');
    try {
      // Step 1: Edge Functionを呼び出して招待レコードを作成
      //console.log('[デバッグ] セッション情報を取得します...');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("セッションが見つかりません。");

      //console.log('[デバッグ] Edge Function "create-customer-invitation" を呼び出します...');
      
      // --- ▼▼▼ ここから修正 ▼▼▼ ---
      // タイムアウト処理を追加
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('サーバーの応答がタイムアウトしました。')), 15000) // 15秒でタイムアウト
      );

      const invokePromise = supabase.functions.invoke('create-customer-invitation', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      // Promise.raceでタイムアウトと実行を競わせる
      const { data: invitationData, error: functionError } = await Promise.race([invokePromise, timeoutPromise]);
      // --- ▲▲▲ 修正ここまで ▲▲▲ ---

      if (functionError) throw functionError;
      if (invitationData.error) throw new Error(invitationData.error);
      
      //console.log('[デバッグ] Edge Functionからデータを受け取りました:', invitationData);
      const { invitation_id, salon_name } = invitationData;
      if (!invitation_id) throw new Error('招待IDの取得に失敗しました。');

      // Step 2: 受け取ったIDでQRコード用のURLを生成
      const url = `${window.location.origin}/signup?invitation_id=${invitation_id}`;
      //console.log(`[デバッグ] QRコードURLを生成しました: ${url}`);
      setQrCodeUrl(url);
      setSalonName(salon_name);
      setAlertInfo({ show: true, message: '招待QRコードを生成しました。', type: 'success' });

    } catch (err) {
      console.error("招待生成エラー:", err);
      setAlertInfo({ show: true, message: `エラーが発生しました: ${err.message}`, type: 'error' });
    } finally {
      //console.log('[デバッグ] 招待生成プロセスを終了します。');
      setLoading(false);
    }
  }, [profile]);

  return (
    <div className="invite-customer-page">
      {loading && <div className="loading-overlay"><LoadingSpinner /></div>}
      {alertInfo.show && <CustomAlert message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ show: false, message: '' })} />}

      <div className="invite-container">
        <h3>お客様を招待</h3>
        <p>
          下のボタンをクリックすると、お客様が新規登録するための専用QRコードが生成されます。<br />
          お客様にこのQRコードを読み取ってもらうことで、あなたのサロンに自動的に紐付けられます。
        </p>
        
        <div className="invite-actions">
          <button onClick={generateInvitation} disabled={loading} className="generate-qr-button">
            {loading ? '生成中...' : '招待用QRコードを生成'}
          </button>
        </div>

        {qrCodeUrl && (
          <div className="qr-code-display">
            <h4>{salonName} お客様招待用</h4>
            <div className="qr-code-wrapper">
              <QRCode value={qrCodeUrl} size={256} />
            </div>
            <p className="qr-instructions">お客様にこのQRコードを読み取ってもらってください。</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default InviteCustomerPage;
