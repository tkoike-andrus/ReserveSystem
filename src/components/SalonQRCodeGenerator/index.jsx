// src/components/SalonQRCodeGenerator/index.jsx

import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../services/supabaseClient';
import LoadingSpinner from '../LoadingSpinner';
import './SalonQRCodeGenerator.css';

const SalonQRCodeGenerator = () => {
  const [fullUrl, setFullUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const generateUrl = async () => {
      try {
        setLoading(true);
        // 1. 現在ログインしているユーザー情報を取得
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('ユーザー情報が取得できませんでした。');

        // 2. ユーザーIDを元にoperatorsテーブルからsalon_idを取得
        const { data: operator, error: operatorError } = await supabase
          .from('operators')
          .select('salon_id')
          .eq('operator_id', user.id)
          .single();
        
        if (operatorError) throw operatorError;
        if (!operator?.salon_id) throw new Error('サロン情報が紐付いていません。');

        const salonId = operator.salon_id;
        
        // 3. LIFF IDとsalon_idを元に専用URLを生成
        const liffId = import.meta.env.VITE_LIFF_ID;
        if (!liffId) throw new Error('LIFF IDが設定されていません。');

        // ★ お客様が最初にアクセスするページのパスを指定します
        //    今回はメニューページと仮定
        const generatedUrl = `https://liff.line.me/${liffId}/menu?salonId=${salonId}`;
        setFullUrl(generatedUrl);

      } catch (err) {
        console.error('URL生成エラー:', err);
        setError('専用URLの生成に失敗しました。設定を確認してください。');
      } finally {
        setLoading(false);
      }
    };

    generateUrl();
  }, []);

  const handleCopyToClipboard = () => {
    navigator.clipboard.writeText(fullUrl).then(() => {
      alert('URLをクリップボードにコピーしました！');
    }).catch(err => {
      console.error('コピーに失敗しました:', err);
      alert('コピーに失敗しました。');
    });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <p className="error-message">{error}</p>;
  }

  return (
    <div className="qr-code-generator">
      <h3>お客様招待用のQRコードとURL</h3>
      <p>このQRコードをお客様に提示するか、URLを共有して友達登録をしてもらってください。</p>
      
      <div className="qr-code-canvas">
        {fullUrl && (
          <QRCodeSVG 
            value={fullUrl} 
            size={256} 
            bgColor={"#ffffff"}
            fgColor={"#000000"}
            level={"L"}
            includeMargin={true}
          />
        )}
      </div>

      <div className="url-display">
        <input type="text" value={fullUrl} readOnly />
        <button onClick={handleCopyToClipboard}>コピー</button>
      </div>
    </div>
  );
};

export default SalonQRCodeGenerator;
