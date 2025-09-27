import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import './LoginPage.css';
import RenailLogo from '../../assets/ReNail.png';

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      
      // ログイン成功後は、UserContextがリダイレクトを処理するため、
      // ここでの明示的なnavigate()呼び出しは不要です。
      // APP.jsx内のCustomerRoutes/AdminRoutesが適切に振り分けます。

    } catch (err) {
      //nsole.error('[デバッグ] ログインエラー:', err);
      if (err.message === 'Invalid login credentials') {
        setError('メールアドレスまたはパスワードが違います。');
      } else {
        setError('ログインに失敗しました。時間をおいて再度お試しください。');
      }
    } finally {
      // 処理が成功してもエラーになっても、必ずローディング状態を解除する
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <img src={RenailLogo} alt="Renail Logo" className="auth-logo" />
      
      <form onSubmit={handleLogin} className="auth-form">
        <input
          type="email"
          placeholder="メールアドレス"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="パスワード"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'ログイン中...' : 'ログイン'}
        </button>
        {error && <p className="auth-error">{error}</p>}
      </form>
      
      <div className="auth-link">
        アカウントをお持ちでないですか？ <br/><Link to="/signup">新規登録はこちら</Link>
      </div>
    </div>
  );
};

export default LoginPage;
