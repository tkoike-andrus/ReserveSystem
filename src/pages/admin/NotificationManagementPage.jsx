import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom'; // useNavigateを追加
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import CustomAlert from '../../components/CustomAlert';
import CustomConfirm from '../../components/CustomConfirm';
import './NotificationManagementPage.css';

const ITEMS_PER_PAGE = 10;

const NotificationManagementPage = () => {
  const { profile, loading: userLoading } = useUser();
  const location = useLocation(); // locationフックを使用
  const navigate = useNavigate(); // navigateフックを使用

  const [notifications, setNotifications] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  // Form states
  const [editingNotification, setEditingNotification] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [targetCustomerId, setTargetCustomerId] = useState(''); // '' for all customers

  // Status modal state
  const [statusData, setStatusData] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  
  const [alert, setAlert] = useState({ show: false, message: '', type: '' });

  // ページ読み込み時に、遷移元からのstateを受け取ってモーダルを開く
  useEffect(() => {
    const targetCustomer = location.state?.targetCustomer;
    if (targetCustomer) {
      openEditModal(); // 新規作成モーダルを開く
      setTargetCustomerId(targetCustomer.customer_id);

      // 顧客リストに存在しない場合、一時的に追加して表示する
      if (!customers.some(c => c.customer_id === targetCustomer.customer_id)) {
        setCustomers(prev => [...prev, targetCustomer]);
      }
      
      // 処理後にstateをクリアする
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, customers]);


  const fetchNotifications = useCallback(async () => {
    if (!profile?.salon_id) return;
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('*, operators(operator_name), customer:customer_id(display_name)')
        .eq('salon_id', profile.salon_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setNotifications(data);
    } catch (error) {
      setAlert({ show: true, message: `お知らせの取得に失敗しました: ${error.message}`, type: 'error' });
    } finally {
      setIsLoading(false);
    }
  }, [profile?.salon_id]);

  const fetchCustomers = useCallback(async () => {
    if (!profile?.salon_id) return;
    try {
      const { data, error } = await supabase.rpc('get_salon_customers', { p_salon_id: profile.salon_id });
      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error("顧客リストの取得に失敗", error);
    }
  }, [profile?.salon_id]);

  useEffect(() => {
    fetchNotifications();
    fetchCustomers();
  }, [fetchNotifications, fetchCustomers]);

  const openEditModal = (notification = null) => {
    setEditingNotification(notification);
    setTitle(notification?.title || '');
    setContent(notification?.content || '');
    setTargetCustomerId(notification?.customer_id || '');
    setIsEditModalOpen(true);
  };

  const closeEditModal = () => {
    setIsEditModalOpen(false);
    setEditingNotification(null);
    setTitle('');
    setContent('');
    setTargetCustomerId('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title || !content) {
      setAlert({ show: true, message: 'タイトルと内容を入力してください。', type: 'error' });
      return;
    }
    
    if (title.length > 50) {
      setAlert({ show: true, message: 'タイトルは50文字以内で入力してください。', type: 'error' });
      return;
    }

    if (content.length > 200) {
      setAlert({ show: true, message: '内容は200文字以内で入力してください。', type: 'error' });
      return;
    }

    try {
      const notificationData = {
        salon_id: profile.salon_id,
        operator_id: profile.operator_id,
        title,
        content,
        customer_id: targetCustomerId === '' ? null : targetCustomerId,
      };

      if (editingNotification) {
        const { error } = await supabase.from('notifications').update(notificationData).eq('id', editingNotification.id);
        if (error) throw error;
        setAlert({ show: true, message: 'お知らせを更新しました。', type: 'success' });
      } else {
        const { error } = await supabase.from('notifications').insert([notificationData]);
        if (error) throw error;
        setAlert({ show: true, message: 'お知らせを作成しました。', type: 'success' });
      }
      closeEditModal();
      fetchNotifications();
    } catch (error) {
      setAlert({ show: true, message: `保存に失敗しました: ${error.message}`, type: 'error' });
    }
  };
  
  const confirmDelete = (id) => {
    setDeletingId(id);
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    try {
      const { error } = await supabase.from('notifications').delete().eq('id', deletingId);
      if (error) throw error;
      setAlert({ show: true, message: 'お知らせを削除しました。', type: 'success' });
      fetchNotifications();
    } catch (error) {
      setAlert({ show: true, message: `削除に失敗しました: ${error.message}`, type: 'error' });
    } finally {
      setShowDeleteConfirm(false);
      setDeletingId(null);
    }
  };

  const togglePublish = async (notification) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          is_published: !notification.is_published,
          published_at: !notification.is_published ? new Date().toISOString() : null
        })
        .eq('id', notification.id);
      if (error) throw error;
      setAlert({ show: true, message: `公開状態を更新しました。`, type: 'success' });
      fetchNotifications();
    } catch (error) {
       setAlert({ show: true, message: `公開状態の更新に失敗しました: ${error.message}`, type: 'error' });
    }
  };
  
  const handleViewStatus = async (notificationId) => {
    setIsStatusModalOpen(true);
    setStatusLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_notification_read_status', { p_notification_id: notificationId });
      if (error) throw error;
      setStatusData(data);
    } catch(err) {
      console.error("既読状況の取得エラー", err);
      setStatusData(null);
    } finally {
      setStatusLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleString('ja-JP');
  };

  // Pagination Logic
  const totalPages = Math.ceil(notifications.length / ITEMS_PER_PAGE);
  const paginatedNotifications = notifications.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  if (userLoading || isLoading) return <LoadingSpinner />;

  return (
    <div className="notification-management-container">
      {alert.show && <CustomAlert message={alert.message} type={alert.type} onClose={() => setAlert({ ...alert, show: false })} />}
      {showDeleteConfirm && (
        <CustomConfirm
          message="このお知らせを本当に削除しますか？"
          onConfirm={handleDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
      <div className="page-header">
        <h1>お知らせ管理</h1>
        <button className="add-notification-btn" onClick={() => openEditModal()}>新規作成</button>
      </div>

      <div className="notification-list">
        {paginatedNotifications.length === 0 ? (
          <p>まだお知らせはありません。</p>
        ) : (
          paginatedNotifications.map(n => (
            <div key={n.id} className="notification-card">
              <div className="notification-card-header">
                <h3>{n.title}</h3>
                <div className="header-meta">
                  <div className={`target ${n.customer_id ? 'personal' : 'all'}`}>
                    宛先: {n.customer_id ? n.customer?.display_name || '個人' : '全員'}
                  </div>
                  <div className={`status ${n.is_published ? 'published' : 'draft'}`}>
                    {n.is_published ? '公開中' : '下書き'}
                  </div>
                </div>
              </div>
              <p className="notification-content">{n.content}</p>
              <div className="notification-card-footer">
                <div className="meta">
                  <span>作成者: {n.operators?.operator_name || '不明'}</span>
                  <span>作成日時: {formatDate(n.created_at)}</span>
                  <span>公開日時: {formatDate(n.published_at)}</span>
                </div>
                <div className="actions">
                  <button onClick={() => togglePublish(n)} className="publish-btn">
                    {n.is_published ? '非公開' : '公開'}
                  </button>
                  <button onClick={() => openEditModal(n)} className="edit-btn">編集</button>
                  <button onClick={() => confirmDelete(n.id)} className="delete-btn">削除</button>
                  {n.customer_id && n.is_published && (
                    <button onClick={() => handleViewStatus(n.id)} className="status-btn">既読確認</button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {totalPages > 1 && (
        <div className="pagination-container">
          <button className="pagination-button" onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1}>前へ</button>
          <span className="page-info">{currentPage} / {totalPages}</span>
          <button className="pagination-button" onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages}>次へ</button>
        </div>
      )}

      {isEditModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>{editingNotification ? 'お知らせの編集' : 'お知らせの新規作成'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="targetCustomer">宛先</label>
                <select id="targetCustomer" value={targetCustomerId} onChange={(e) => setTargetCustomerId(e.target.value)}>
                  <option value="">全員</option>
                  {customers.map(c => <option key={c.customer_id} value={c.customer_id}>{c.display_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="title">タイトル</label>
                <input id="title" type="text" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength="50" />
                <div className="char-counter">{title.length} / 50</div>
              </div>
              <div className="form-group">
                <label htmlFor="content">内容</label>
                <textarea
                  id="content"
                  rows="10"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  required
                  maxLength="200"
                ></textarea>
                <div className="char-counter">{content.length} / 200</div>
              </div>
              <div className="modal-actions">
                <button type="button" onClick={closeEditModal} className="cancel-btn">キャンセル</button>
                <button type="submit" className="save-btn">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isStatusModalOpen && (
        <div className="modal-overlay" onClick={() => setIsStatusModalOpen(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>既読状況</h2>
            {statusLoading ? <LoadingSpinner /> : (
              statusData && (
                <div className="status-list">
                  <div className="status-item header">
                    <span>お客様</span>
                    <span>既読日時</span>
                  </div>
                  {statusData.map((s, i) => (
                    <div key={i} className="status-item">
                      <span>{s.customer_name}</span>
                      <span>{s.read_at ? formatDate(s.read_at) : '未読'}</span>
                    </div>
                  ))}
                </div>
              )
            )}
             <div className="modal-actions">
                <button type="button" onClick={() => setIsStatusModalOpen(false)} className="cancel-btn">閉じる</button>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationManagementPage;

