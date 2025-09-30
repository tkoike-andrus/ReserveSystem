import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import './SignUpPage.css';
import RenailLogo from '../../assets/ReNail.png';

const SignUpPage = () => {
  // --- State definitions ---
  const [userType, setUserType] = useState('operator');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [salonName, setSalonName] = useState('');
  const [isEmailSent, setIsEmailSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [invitationId, setInvitationId] = useState(null);
  const location = useLocation();
  const isInviteFlow = !!invitationId;

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const id = queryParams.get('invitation_id');

    setInvitationId(id);
    setUserType('customer'); // 招待フローの場合はcustomerに固定

  }, [location.search]);

  const handleSignUp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // 送信するメタデータを準備
    const metadata = {
      user_type: userType,
      ...(userType === 'operator' ? 
        { operator_name: name, salon_name: salonName } : 
        { display_name: name }
      )
    };

    // 招待IDがあればメタデータに追加
    if (invitationId) {
      metadata.pending_invitation_id = invitationId;
    }

    //console.log('[デバッグ] supabase.auth.signUpに渡すデータ:', { email, metadata });

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata,
        },
      });

      if (signUpError) throw signUpError;
      setIsEmailSent(true);

    } catch (error) {
      console.error('登録エラー:', error);
      setError(error.message.includes('User already registered') ? 'このメールアドレスは既に使用されています。' : '登録中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  if (isEmailSent) {
    return (
      <div className="auth-container">
        <h2>メールをご確認ください</h2>
        <div className="success-message">
          <p><strong>ご登録ありがとうございます！</strong></p>
          <div className="success-message-detail">
            <p>アカウントを有効化するための確認メールを送信しました。メールをご確認いただき、認証を完了してください。</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <img src={RenailLogo} alt="Renail Logo" className="auth-logo" />
      
      <h2>{isInviteFlow ? 'お客様情報の登録' : '新規アカウント登録'}</h2>
      
      {/* 招待フローでない場合のみ、ユーザー種別の切り替えを表示 */}
      {!isInviteFlow && (
        <div className="user-type-toggle">
          <button 
            className={userType === 'operator' ? 'active' : ''} 
            onClick={() => setUserType('operator')}
          >
            サロン運営者
          </button>
          <button 
            className={userType === 'customer' ? 'active' : ''} 
            onClick={() => setUserType('customer')}
          >
            お客様
          </button>
        </div>
      )}

      <form onSubmit={handleSignUp} className="auth-form">
        {userType === 'operator' && (
          <input 
            type="text" 
            placeholder="サロン名" 
            value={salonName} 
            onChange={(e) => setSalonName(e.target.value)} 
            required 
          />
        )}
        <input 
          type="text" 
          placeholder={userType === 'operator' ? 'お名前（管理者名）' : 'お名前'}
          value={name} 
          onChange={(e) => setName(e.target.value)} 
          required 
        />
        <input 
          type="email" 
          placeholder="メールアドレス" 
          value={email} 
          onChange={(e) => setEmail(e.target.value)} 
          required 
        />
        <input 
          type="password" 
          placeholder="パスワード（6文字以上）" 
          value={password} 
          minLength="6"
          required 
          onChange={(e) => setPassword(e.target.value)} 
        />
        <button type="submit" disabled={loading}>
          {loading ? '処理中...' : '登録する'}
        </button>
        {error && <p className="auth-error">{error}</p>}
      </form>

      {!isInviteFlow && (
        <div className="auth-link">
          アカウントをお持ちですか？ <Link to="/login">ログインはこちら</Link>
        </div>
      )}
    </div>
  );
};

export default SignUpPage;

