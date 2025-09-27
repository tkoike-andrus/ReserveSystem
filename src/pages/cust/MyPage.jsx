import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import CustomConfirm from '../../components/CustomConfirm';
import imageCompression from 'browser-image-compression';
import './MyPage.css';

// --- Icon Components ---
const CalendarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0h18" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>;
const InviteIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>;
const LogoutIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" /></svg>;
const BellIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" /></svg>;
const StarIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg>;
const CameraIcon = () => <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" /><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" /></svg>;

const MyPage = () => {
  const navigate = useNavigate();
  const { profile, loading: userLoading } = useUser();
  const [nextReservation, setNextReservation] = useState(null);
  const [hasActiveReservation, setHasActiveReservation] = useState(false);
  const [loadingReservation, setLoadingReservation] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  const userId = profile?.id; // Get user ID for dependency array

  useEffect(() => {
    if (profile?.picture_url) {
        setAvatarUrl(profile.picture_url);
    }
  }, [profile?.picture_url]);

  const handleAvatarUpload = async (event) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }
      const file = event.target.files[0];
      const options = { maxSizeMB: 0.5, maxWidthOrHeight: 800, useWebWorker: true };
      const compressedFile = await imageCompression(file, options);
      const fileExt = file.name.split('.').pop();
      const fileName = `${profile.id}.${fileExt}`;
      const filePath = `${fileName}`;
      let { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, compressedFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const { error: updateError } = await supabase.from('profiles').update({ picture_url: publicUrl }).eq('id', profile.id);
      if (updateError) throw updateError;
      setAvatarUrl(publicUrl);
    } catch (error) {
      alert(error.message);
    } finally {
      setUploading(false);
    }
  };

  const fetchNextReservation = useCallback(async () => {
    if (!userId) return;
    setLoadingReservation(true);
    try {
      const { data, error } = await supabase.from('reservations').select(`reservation_date, reservation_time, menus(name), salons(salon_name)`).eq('customer_id', userId).eq('status', 'reserved').gte('reservation_date', new Date().toISOString().split('T')[0]).order('reservation_date', { ascending: true }).order('reservation_time', { ascending: true }).limit(1);
      if (error) throw error;
      if (data && data.length > 0) {
        setNextReservation(data[0]);
        setHasActiveReservation(true);
      } else {
        setNextReservation(null);
        setHasActiveReservation(false);
      }
    } catch (err) {
      console.error('次回予約の取得エラー:', err);
    } finally {
      setLoadingReservation(false);
    }
  }, [userId]);

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    try {
      const { data, error } = await supabase.rpc('get_notifications_for_customer', {
        p_customer_id: userId
      });
      if (error) throw error;
      if (data && data.length > 0) {
        setNotifications(data.slice(0, 3));
        setUnreadCount(data[0].total_unread_count || 0);
      } else {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (err) { 
      console.error("お知らせの取得エラー:", err); 
      setNotifications([]);
      setUnreadCount(0);
    }
  }, [userId]);

  useEffect(() => {
    fetchNextReservation();
    fetchNotifications();
  }, [fetchNextReservation, fetchNotifications]);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/login');
    } catch (err) {
      console.error('ログアウトエラー:', err);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const week = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
    return `${month}月${day}日(${week})`;
  };

  const formatTime = (timeStr) => timeStr ? timeStr.substring(0, 5) : '';
  
  if (userLoading) {
    return <LoadingSpinner />;
  }

  if (!profile) {
    return <Navigate to="/login" replace />;
  }
  
  if (profile.userType !== 'customer') {
    return <Navigate to="/admin" replace />;
  }
  
  const currentSalon = profile.salon_customers?.[0]?.salons;

  return (
    <div className="my-page-container">
      {showLogoutConfirm && (
        <CustomConfirm
          message="ログアウトしますか？"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutConfirm(false)}
        />
      )}
      <header className="my-page-header">
        <div className="profile-picture-container">
          <img 
            src={avatarUrl || 'https://placehold.co/100x100/EEDDE2/D17A94?text=User'} 
            alt="Profile" 
            className="profile-picture" 
          />
          <label htmlFor="avatar-upload" className="camera-icon-label">
            {uploading ? <div className="spinner-mini"></div> : <CameraIcon />}
          </label>
          <input
            type="file"
            id="avatar-upload"
            accept="image/*"
            onChange={handleAvatarUpload}
            disabled={uploading}
            style={{ display: 'none' }}
          />
        </div>
        <div className="greeting">
          {currentSalon ? (
             <p className="salon-name">{currentSalon.salon_name}</p>
          ) : (
             <p className="salon-name">所属サロンがありません</p>
          )}
          <h1>{profile?.display_name || 'ゲスト'}さん</h1>
        </div>
      </header>

      <section className="next-reservation-section">
        <h2>次回のご予約</h2>
        {loadingReservation ? <LoadingSpinner /> : (
          nextReservation ? (
            <Link to="/history" className="reservation-card-link">
              <div className="next-reservation-card">
                <div className="reservation-item">
                  <CalendarIcon />
                  <span>{formatDate(nextReservation.reservation_date)}</span>
                </div>
                <div className="reservation-item">
                  <ClockIcon />
                  <span>{formatTime(nextReservation.reservation_time)}</span>
                </div>
                <p className="reservation-menu-name">{nextReservation.menus.name}</p>
              </div>
            </Link>
          ) : (
            <div className="no-reservation-card-v2"><p>現在、ご予約はありません</p></div>
          )
        )}
      </section>

      <section className="notifications-section">
          <div className="section-header">
            <h2>お知らせ</h2>
            <Link to="/notifications">もっと見る</Link>
          </div>
          {notifications.length > 0 ? (
            <div className="notifications-list-mypage">
              {notifications.map(n => (
                <Link to="/notifications" key={n.id} className="notification-item-mypage">
                  <div className="notification-date">{formatDate(n.published_at)}</div>
                  <div className="notification-title">{n.title}</div>
                </Link>
              ))}
            </div>
          ) : (
             <p className="no-notifications-mypage">新しいお知らせはありません</p>
          )}
      </section>

      <section className="main-actions-grid">
        <div 
          onClick={() => !hasActiveReservation && navigate('/menus')} 
          className={`action-card ${hasActiveReservation ? 'disabled' : ''}`}>
          <CalendarIcon />
          <span>予約/メニュー</span>
        </div>
        <div onClick={() => navigate('/history')} className="action-card"><ClockIcon /><span>予約履歴</span></div>
        <div onClick={() => navigate('/notifications')} className="action-card">
            <BellIcon /><span>お知らせ</span>
            {unreadCount > 0 && <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </div>
        <div onClick={() => setShowLogoutConfirm(true)} className="action-card"><LogoutIcon /><span>ログアウト</span></div>
      </section>
    </div>
  );
};

export default MyPage;

