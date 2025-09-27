import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import { Link } from 'react-router-dom';
import './NotificationsPage.css';

const NotificationIcon = ({ is_read }) => (
    <div className={`notification-icon-container ${is_read ? 'read' : 'unread'}`}>
      {is_read ? (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 0 1-5.714 0" />
        </svg>
      )}
    </div>
  );
const ChevronRightIcon = () => (
    <div className="chevron-icon-container">
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
      </svg>
    </div>
  );

// モーダルコンポーネント
const NotificationModal = ({ notification, onClose, isClosing }) => {
  // notificationがない場合は何も表示しない
  if (!notification) return null;

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('ja-JP', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  };

  return (
    // isClosingの状態に応じて 'closing' クラスを付与
    <div className={`modal-overlay ${isClosing ? 'closing' : ''}`} onClick={onClose}>
      <div className={`modal-content ${isClosing ? 'closing' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2 className="modal-title">{notification.title}</h2>
          <button className="modal-close-button" onClick={onClose}>
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="modal-body">
            <p className="modal-date">{formatDate(notification.published_at)}</p>
            <p className="modal-text-content">{notification.content}</p>
        </div>
      </div>
    </div>
  );
};

const NotificationsPage = () => {
  // ...(useState, fetchNotificationsなどは変更なし)...
  const { profile, loading: userLoading } = useUser();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNotification, setSelectedNotification] = useState(null);

  const [isModalClosing, setIsModalClosing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!profile?.id) return;
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_notifications_for_customer', {
        p_customer_id: profile.id
      });
      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error("お知らせの取得に失敗しました:", error);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);
  
  const handleNotificationClick = async (notification) => {
    setSelectedNotification(notification);
    if (!notification.is_read) {
       try {
        await supabase.from('notification_reads').upsert({
          notification_id: notification.id,
          customer_id: profile.id
        });
        setNotifications(prev => prev.map(n => n.id === notification.id ? {...n, is_read: true} : n));
      } catch(error) { console.error("既読処理に失敗:", error); }
    }
  };

  const closeModal = () => {
    setIsModalClosing(true); // 閉じるアニメーションを開始
    // アニメーションの時間（300ms）待ってからモーダルを非表示にする
    setTimeout(() => {
      setSelectedNotification(null);
      setIsModalClosing(false); // 次回のためにstateをリセット
    }, 300);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString('ja-JP');
  };

  if (userLoading || loading) return <LoadingSpinner />;

  return (
    <div className="notifications-page-container">
      <header className="notifications-page-header">
        <Link to="/" className="back-link">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" /></svg>
        </Link>
        <h1>お知らせ</h1>
      </header>
      <div className="notifications-list">
        {notifications.length > 0 ? (
          notifications.map(n => (
            <div key={n.id} className={`notification-item ${n.is_read ? 'read' : 'unread'}`} onClick={() => handleNotificationClick(n)}>
               <NotificationIcon is_read={n.is_read} />
               <div className="notification-item-content">
                <div className="notification-item-header">
                    <p className="notification-title">{n.title}</p>
                    <span className="notification-date">{formatDate(n.published_at)}</span>
                </div>
                <p className="notification-body">{n.content}</p>
              </div>
              <ChevronRightIcon />
            </div>
          ))
        ) : (
          <p className="no-notifications">お知らせはありません。</p>
        )}
      </div>

      {/* selectedNotificationが存在する場合のみモーダルをレンダリング */}
      {selectedNotification && (
        <NotificationModal
          notification={selectedNotification}
          onClose={closeModal}
          isClosing={isModalClosing}
        />
      )}

    </div>
  );
};

export default NotificationsPage;