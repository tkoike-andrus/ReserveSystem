// src/pages/auth/EmployeeInviteLandingPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import CustomAlert from '../../components/CustomAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import RenailLogo from '../../assets/ReNail.png';

import './EmployeeInviteLandingPage.css';

const EmployeeInviteLandingPage = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [pageState, setPageState] = useState('loading'); // loading, ready, error
  const [staffName, setStaffName] = useState('');
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '', type: 'info' });
  
  const userId = searchParams.get('userId');

  const fetchStaffName = useCallback(async () => {
    if (!userId) {
      setPageState('error');
      setAlertInfo({ show: true, message: '無効な招待リンクです。URLを確認してください。', type: 'error' });
      return;
    }
    try {
      const { data, error } = await supabase
        .from('operators')
        .select('operator_name')
        .eq('operator_id', userId)
        .single();
      
      if (error || !data) {
        throw new Error('招待されたスタッフが見つかりません。');
      }
      
      setStaffName(data.operator_name);
      setPageState('ready');
    } catch (err) {
      setPageState('error');
      setAlertInfo({ show: true, message: err.message, type: 'error' });
    }
  }, [userId]);

  useEffect(() => {
    document.title = "スタッフ招待";
    fetchStaffName();
  }, [fetchStaffName]);

  const handleProceed = async () => {
    setLoading(true);
    setAlertInfo({ show: false, message: '' });
    try {
      const { data, error } = await supabase.functions.invoke('generate-recovery-link-for-user', {
        body: { userId: userId },
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // 取得した本物の招待リンクにリダイレクト
      window.location.replace(data.recoveryLink);

    } catch (err) {
      setAlertInfo({ show: true, message: `エラーが発生しました: ${err.message}`, type: 'error' });
      setLoading(false);
    }
  };

  return (
    <div className="landing-container">
      {alertInfo.show && <CustomAlert message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ show: false })} />}
      <img src={RenailLogo} alt="Renail Logo" className="landing-logo" />
      
      {pageState === 'loading' && <LoadingSpinner />}

      {pageState === 'ready' && (
        <div className="landing-content">
          <h2 className="landing-title">{staffName}さん</h2>
          <p className="landing-message">NailyBookへようこそ！<br />下のボタンを押してパスワード設定に進んでください。</p>
          <button onClick={handleProceed} disabled={loading} className="landing-button">
            {loading ? '処理中...' : 'パスワード設定に進む'}
          </button>
        </div>
      )}
    </div>
  );
};

export default EmployeeInviteLandingPage;
