import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '/src/contexts/UserContext.jsx';
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import CustomAlert from '../../components/CustomAlert';
import CustomConfirm from '../../components/CustomConfirm';
import LoadingSpinner from '../../components/LoadingSpinner';
import './StaffManagementPage.css';

const StaffManagementPage = () => {
  const { profile } = useUser();
  const [staff, setStaff] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '', type: 'info' });
  const [confirmInfo, setConfirmInfo] = useState({ show: false, message: '', onConfirm: () => {} });
  const [currentUserId, setCurrentUserId] = useState(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newlyCreatedAccount, setNewlyCreatedAccount] = useState(null);
  
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [inviteInfo, setInviteInfo] = useState({ accountId: '', link: '' });

  const [salonName, setSalonName] = useState('');
  const [operatorName, setOperatorName] = useState('');

  const fetchStaff = useCallback(async (userId) => {
    if (!profile || !userId) {
      setPageLoading(false);
      return;
    }

    try {
      setPageLoading(true);
      setCurrentUserId(userId);
      setOperatorName(profile.operator_name);

      const salonId = profile.salon_id;
      
      if (salonId) {
        setSalonName(profile.salons?.salon_name || '');

        const { data, error } = await supabase
          .from('operators')
          .select('operator_id, operator_name, account_id, role, password_change_required')
          .eq('salon_id', salonId);
        
        if (error) throw error;
        
        let staffList = data || [];
        const currentUserRole = profile.role;

        if (currentUserRole === 'admin') {
           staffList = staffList.filter(member => member.operator_id !== userId);
        } else if (currentUserRole === 'manager') {
          staffList = staffList.filter(member => member.role === 'staff' && member.operator_id !== userId);
        }
        
        setStaff(staffList);
      }
    } catch (err) {
      console.error("スタッフ情報の取得エラー:", err);
      setAlertInfo({ show: true, message: "スタッフ情報の取得に失敗しました。", type: 'error' });
    } finally {
      setPageLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.operator_id) {
      fetchStaff(profile.operator_id);
    } else if (!profile && !useUser.loading) {
       setPageLoading(false);
    }
  }, [profile, fetchStaff, useUser.loading]);

  const handleCreateForLink = async (e) => {
    e.preventDefault();
    if (!newStaffName) {
      setAlertInfo({ show: true, message: 'スタッフ名を入力してください。', type: 'error' });
      return;
    }
    setActionLoading(true);
    setNewlyCreatedAccount(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('認証セッションが見つかりません。');
      
      const { data, error } = await supabase.functions.invoke('create-employee-for-link', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { operator_name: newStaffName },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      setNewlyCreatedAccount(data);
      setAlertInfo({ show: true, message: "新しいスタッフアカウントを発行しました。", type: 'success' });
      setIsAddModalOpen(false);
      setNewStaffName('');
      if (session.user) {
        fetchStaff(session.user.id);
      }
    } catch (err) {
      console.error("アカウント作成エラー:", err);
      const errorMessage = err.message || '不明なエラーが発生しました。';
      setAlertInfo({ show: true, message: `作成に失敗しました: ${errorMessage}`, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleInvite = (staffMember) => {
    const inviteLink = `${window.location.origin}/employee-invite-landing?userId=${staffMember.operator_id}`;
    setInviteInfo({
      accountId: staffMember.account_id,
      link: inviteLink,
    });
    setIsQrModalOpen(true);
  };
  
  const handleRoleChange = async (operatorId, newRole) => {
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('operators')
        .update({ role: newRole })
        .eq('operator_id', operatorId);
      if (error) throw error;
      
      setStaff(currentStaff =>
        currentStaff.map(member =>
          member.operator_id === operatorId ? { ...member, role: newRole } : member
        )
      );
      
      setAlertInfo({ show: true, message: "役割を更新しました。", type: 'success' });
    } catch (err) {
      console.error("役割の更新エラー:", err);
      setAlertInfo({ show: true, message: "役割の更新に失敗しました。", type: 'error' });
      if (profile?.operator_id) fetchStaff(profile.operator_id);
    } finally {
        setActionLoading(false);
    }
  };
  
  const handleShare = async () => {
    const shareData = {
      title: `${salonName} スタッフ招待`,
      text: `${salonName}の${operatorName}から招待が届きました。\n以下のリンクからパスワード設定に進んでください。`,
      url: inviteInfo.link,
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        setAlertInfo({ show: true, message: '招待を共有しました。', type: 'success' });
      } catch (error) {
        console.log('共有がキャンセルされました:', error);
      }
    } else {
      setAlertInfo({ show: true, message: 'このブラウザは共有機能をサポートしていません。', type: 'info' });
    }
    setIsQrModalOpen(false);
  };

  const handleDelete = async (staffMember) => {
    setConfirmInfo({ show: false });
    setActionLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('認証セッションが見つかりません。');

      const { error } = await supabase.functions.invoke('delete-employee', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: { operator_id: staffMember.operator_id }
      });

      if (error) {
        const functionError = await error.context.json();
        throw new Error(functionError.error || '削除に失敗しました。');
      }
      setAlertInfo({ show: true, message: `${staffMember.operator_name}さんを削除しました。`, type: 'success' });
      if (session.user) fetchStaff(session.user.id);
    } catch (err) {
      setAlertInfo({ show: true, message: `削除に失敗しました: ${err.message}`, type: 'error' });
    } finally {
      setActionLoading(false);
    }
  };

  const promptDelete = (staffMember) => {
    setConfirmInfo({
      show: true,
      message: `${staffMember.operator_name}さんを本当に削除しますか？\nこの操作は元に戻せません。`,
      onConfirm: () => handleDelete(staffMember),
    });
  };

  if (pageLoading) return <div className="loading-overlay"><LoadingSpinner /></div>;

  return (
    <div className="staff-management-page">
      {actionLoading && (
        <div className="loading-overlay">
          <LoadingSpinner />
        </div>
      )}

      {alertInfo.show && ( <CustomAlert message={alertInfo.message} type={alertInfo.type} onClose={() => setAlertInfo({ show: false, message: '' })} /> )}
      
      {confirmInfo.show && (
        <CustomConfirm
          message={confirmInfo.message}
          onConfirm={confirmInfo.onConfirm}
          onCancel={() => setConfirmInfo({ show: false })}
        />
      )}

      {isAddModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>新しいスタッフを追加</h3>
            <form onSubmit={handleCreateForLink}>
              <input
                type="text"
                placeholder="スタッフ名"
                value={newStaffName}
                onChange={(e) => setNewStaffName(e.target.value)}
                required
              />
              <div className="modal-actions">
                <button type="button" onClick={() => setIsAddModalOpen(false)} className="cancel-btn">キャンセル</button>
                <button type="submit" className="confirm-btn" disabled={actionLoading}>{actionLoading ? '作成中...' : '作成'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isQrModalOpen && (
        <div className="modal-overlay" onClick={() => setIsQrModalOpen(false)}>
            <div className="modal-content qr-modal" onClick={(e) => e.stopPropagation()}>
                <h3>スタッフを招待</h3>
                <p>このQRコードを読み取るか、下のボタンから招待リンクを共有してください。</p>
                <div className="qr-code-container">
                    <QRCode value={inviteInfo.link} size={256} />
                </div>
                <div className="account-info-display">
                    <p>アカウントID: <strong>{inviteInfo.accountId}</strong></p>
                </div>
                <div className="qr-modal-actions">
                  {navigator.share ? (
                     <button onClick={handleShare} className="share-btn">招待リンクを送る</button>
                  ) : (
                    <a href={`mailto:?subject=${encodeURIComponent(`${salonName} スタッフ招待`)}&body=${encodeURIComponent(`${salonName}の${operatorName}から招待が届きました。\n以下のリンクからパスワード設定に進んでください。\n\n${inviteInfo.link}`)}`} className="share-btn mail-btn">メールで招待</a>
                  )}
                  <button onClick={() => setIsQrModalOpen(false)} className="close-btn">閉じる</button>
                </div>
            </div>
        </div>
      )}

      <div className="invite-section">
        <h3>スタッフアカウントの発行</h3>
        <p>下のボタンから、新しいスタッフの名前を登録してください。アカウントが発行され、招待の準備ができます。</p>
        <button onClick={() => { setIsAddModalOpen(true); setNewlyCreatedAccount(null); }} className="invite-button">
          + 新しいスタッフを追加
        </button>
        {newlyCreatedAccount && (
          <div className="new-account-info">
            <h4>アカウントが発行されました</h4>
            <p>スタッフ一覧から「招待する」ボタンを押して、QRコードまたは招待リンクを共有してください。</p>
            <div><strong>アカウントID:</strong> {newlyCreatedAccount.accountId}</div>
          </div>
        )}
      </div>

      <div className="staff-list-section">
        <h3>スタッフ一覧</h3>
        <div className="staff-list">
          <div className="staff-list-header">
            <div className="header-item staff-name">名前 / 役割</div>
            <div className="header-item staff-account-id">アカウントID</div>
            <div className="header-item staff-status-col">登録状態</div>
            <div className="header-item staff-actions">アクション</div>
          </div>

          {staff.map(member => (
            <div key={member.operator_id} className="staff-card">
              <div className="staff-info-item staff-name">
                <span className="mobile-label">名前 / 役割</span>
                <div className="staff-name-role-wrapper">
                  <span className="staff-name-text">{member.operator_name}</span>
                  {profile?.role === 'admin' && member.operator_id !== currentUserId && (
                    <div className="role-toggle-container">
                      <button
                        className={`role-toggle-btn ${member.role === 'staff' ? 'active' : ''}`}
                        onClick={() => handleRoleChange(member.operator_id, 'staff')}
                        disabled={actionLoading}
                      >スタッフ</button>
                      <button
                        className={`role-toggle-btn ${member.role === 'manager' ? 'active' : ''}`}
                        onClick={() => handleRoleChange(member.operator_id, 'manager')}
                        disabled={actionLoading}
                      >マネージャー</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="staff-details-group">
                <div className="staff-info-item staff-account-id">
                  <span className="mobile-label">アカウントID</span>
                  <span>{member.account_id}</span>
                </div>
                <div className="staff-info-item staff-status-col">
                  <span className="mobile-label">登録状態</span>
                  <div className="staff-status">
                    {member.password_change_required ? (
                      <span className="status-badge pending">招待中</span>
                    ) : (
                      <span className="status-badge registered">登録済み</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="staff-info-item staff-actions">
                <div className="action-buttons-wrapper">
                  {member.password_change_required && member.role !== 'admin' && (
                    <button 
                      onClick={() => handleInvite(member)} 
                      className="staff-action-btn invite-btn" 
                      disabled={actionLoading}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                      <span>招待</span>
                    </button>
                  )}
                  {(member.operator_id !== currentUserId && member.role !== 'admin') && (
                     <button 
                       onClick={() => promptDelete(member)} 
                       className="staff-action-btn delete-btn" 
                       disabled={actionLoading}
                     >
                       <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                       <span>削除</span>
                     </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StaffManagementPage;

