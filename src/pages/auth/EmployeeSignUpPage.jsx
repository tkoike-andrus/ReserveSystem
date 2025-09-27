// src/pages/auth/EmployeeSignUpPage.jsx

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import CustomAlert from '../../components/CustomAlert';
import './EmployeeSignUpPage.css';
import RenailLogo from '../../assets/ReNail.png';
import LoadingSpinner from '../../components/LoadingSpinner';

const EmployeeSignUpPage = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '', type: 'error' });
  const [loading, setLoading] = useState(false);
  
  const [pageState, setPageState] = useState('verifying'); // 'verifying', 'ready', 'error'
  const [operatorInfo, setOperatorInfo] = useState({ name: '', accountId: '' });

  const authHandledRef = useRef(false);

  useEffect(() => {
    document.title = "パスワード設定";
    
    // onAuthStateChangeは認証イベントをリッスンする
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // 処理が重複しないように一度だけ実行
      if (authHandledRef.current) return;

      // パスワード回復イベントを検知したら、ユーザー情報を取得
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        authHandledRef.current = true;
        subscription.unsubscribe(); // リスナーを解除
        
        try {
          const { data, error } = await supabase
            .from('operators')
            .select('account_id, operator_name')
            .eq('operator_id', session.user.id)
            .single();

          if (error || !data) {
            throw new Error('招待されたアカウント情報が見つかりませんでした。');
          }
          
          setOperatorInfo({ name: data.operator_name, accountId: data.account_id });
          setPageState('ready'); // 準備完了状態に更新
        } catch (error) {
          setAlertInfo({ show: true, message: `エラーが発生しました: ${error.message}`, type: 'error' });
          setPageState('error');
        }
      }
    });

    // 5秒経ってもイベントが発生しない場合はタイムアウトとみなす
    const fallbackTimeout = setTimeout(() => {
      if (!authHandledRef.current) {
        authHandledRef.current = true;
        subscription.unsubscribe();
        setAlertInfo({ show: true, message: '招待リンクが無効か、有効期限が切れています。お手数ですが、再度招待リンクを発行してもらってください。', type: 'error' });
        setPageState('error');
      }
    }, 5000);

    return () => {
      subscription?.unsubscribe();
      clearTimeout(fallbackTimeout);
    };
  }, []);

  const handlePasswordSetup = async (e) => {
    e.preventDefault();
    if (pageState !== 'ready') return;

    if (newPassword.length < 6) {
      setAlertInfo({ show: true, message: 'パスワードは6文字以上で設定してください。', type: 'error' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setAlertInfo({ show: true, message: 'パスワードが一致しません。', type: 'error' });
      return;
    }

    setLoading(true);
    try {
      const { data: { user }, error: updateUserError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateUserError) throw updateUserError;

      // パスワード変更フラグを更新
      await supabase.from('operators').update({ password_change_required: false }).eq('operator_id', user.id);
      
      setAlertInfo({ show: true, message: '登録が完了しました。管理画面に移動します。', type: 'success' });
      setTimeout(() => navigate('/admin'), 2000); // 2秒後にリダイレクト
    } catch (error) {
      setAlertInfo({ show: true, message: error.message || '登録中にエラーが発生しました。', type: 'error' });
    } finally {
      setLoading(false);
    }
  };
  
  // pageStateに応じて表示を切り替える
  const renderContent = () => {
    switch (pageState) {
      case 'verifying':
        return <LoadingSpinner />;
      case 'ready':
        return (
          <>
            <h2 className="welcome-message">{operatorInfo.name}さん、ようこそ</h2>
            <p className="auth-subtitle">パスワードを設定してください</p>
            <div className="account-id-display-box">
              <label>あなたのアカウントID</label>
              <div className="account-id-value">{operatorInfo.accountId}</div>
              <p className="account-id-note">このIDはログイン時に必要です。<br />スクリーンショットなどで必ず控えてください。</p>
            </div>
            <form onSubmit={handlePasswordSetup} className="auth-form">
              <div className="input-group">
                <label htmlFor="newPassword">新しいパスワード</label>
                <input id="newPassword" type="password" placeholder="6文字以上で入力" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div className="input-group">
                <label htmlFor="confirmPassword">新しいパスワード（確認）</label>
                <input id="confirmPassword" type="password" placeholder="もう一度入力" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <button type="submit" disabled={loading}>
                {loading ? '処理中...' : 'パスワードを設定して登録'}
              </button>
            </form>
          </>
        );
      case 'error':
        // エラーメッセージはCustomAlertで表示される
        return null;
      default:
        return null;
    }
  };

  return (
    <div className="auth-container">
      {alertInfo.show && <CustomAlert message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ show: false })} />}
      <img src={RenailLogo} alt="Renail Logo" className="auth-logo" />
      {renderContent()}
    </div>
  );
};

export default EmployeeSignUpPage;

