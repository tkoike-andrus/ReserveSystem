import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import CustomConfirm from '../../components/CustomConfirm';
// CustomAlertは不要なのでインポートを削除
// import CustomAlert from '../../components/CustomAlert';
import './ReservationHistoryPage.css';

const PAGE_SIZE = 10;
const INITIAL_LOAD_SIZE = 5;

const ReservationHistoryPage = () => {
  const { profile } = useUser();
  const navigate = useNavigate();
  
  const [upcomingReservations, setUpcomingReservations] = useState([]);
  const [allPastReservations, setAllPastReservations] = useState([]);
  const [displayedPastReservations, setDisplayedPastReservations] = useState([]);
  const [pastReservationsPage, setPastReservationsPage] = useState(0);
  const [hasMorePast, setHasMorePast] = useState(true);
  const [hasActiveReservation, setHasActiveReservation] = useState(false);

  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [error, setError] = useState('');
  
  // CustomAlert関連のstateを削除
  // const [alertInfo, setAlertInfo] = useState({ show: false, message: '', type: 'info' });
  const [confirmInfo, setConfirmInfo] = useState({ show: false, reservationId: null, message: '' });

  // CustomAlertを表示するuseEffectを削除

  const fetchReservations = useCallback(async () => {
    if (!profile?.id) {
      setLoading(true);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const { data, error: fetchError } = await supabase.rpc('get_my_reservations_with_salon_details');
      if (fetchError) throw fetchError;

      const now = new Date();
      const upcoming = [];
      const past = [];
      let activeFound = false;

      (data || []).forEach(res => {
        const reservationDateTime = new Date(`${res.reservation_date}T${res.reservation_time}`);
        if (res.status === 'reserved' && !res.is_canceled && reservationDateTime >= now) {
          upcoming.push(res);
          activeFound = true;
        } else {
          past.push(res);
        }
      });
      
      setHasActiveReservation(activeFound);
      setUpcomingReservations(upcoming.sort((a, b) => new Date(`${a.reservation_date}T${a.reservation_time}`) - new Date(`${b.reservation_date}T${b.reservation_time}`)));
      
      setAllPastReservations(past);
      setDisplayedPastReservations(past.slice(0, INITIAL_LOAD_SIZE));
      setHasMorePast(past.length > INITIAL_LOAD_SIZE);

    } catch (err) {
      console.error('予約履歴の取得エラー:', err);
      setError('予約履歴の取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [profile?.id]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);
  
  const loadMorePastReservations = () => {
    setMoreLoading(true);
    const nextPage = pastReservationsPage + 1;
    const newCount = INITIAL_LOAD_SIZE + (nextPage * PAGE_SIZE);
    
    setTimeout(() => {
        const newDisplayed = allPastReservations.slice(0, newCount);
        setDisplayedPastReservations(newDisplayed);
        setPastReservationsPage(nextPage);
        setHasMorePast(allPastReservations.length > newCount);
        setMoreLoading(false);
    }, 500);
  };

  const handleCancelClick = (reservationId) => {
    setConfirmInfo({
      show: true,
      reservationId: reservationId,
      message: 'この予約をキャンセルしますか？'
    });
  };

  const executeCancellation = async (reservationId) => {
    try {
      const { error } = await supabase.rpc('cancel_reservation_and_free_slot', {
        p_reservation_id: reservationId
      });
        
      if (error) throw error;
      
      // 成功したらリストを再読み込み
      fetchReservations();
    } catch (err) {
      console.error('キャンセルエラー:', err);
      setError('予約のキャンセルに失敗しました。');
    } finally {
      setConfirmInfo({ show: false, reservationId: null, message: '' });
    }
  };

  const handleRebookClick = async (reservation) => {
    if (hasActiveReservation) {
      setError('予約済のメニューがあるため、新しく予約はできません。');
      return;
    }

    if (!reservation.menu_id) {
      setError('この予約に紐づくメニューが見つかりません。');
      return;
    }
    
    setLoading(true);
    try {
      const { data: menuData, error: menuError } = await supabase
        .from('menus')
        .select('id, is_active')
        .eq('id', reservation.menu_id)
        .single();

      if (menuError && menuError.code !== 'PGRST116') {
        throw menuError;
      }

      if (!menuData || !menuData.is_active) {
        setError('選択したメニューは存在しません。詳細は店舗にお問い合わせください。');
        return;
      }

      navigate(`/menu/${reservation.menu_id}`);
    } catch (err) {
      console.error("再予約チェックエラー:", err);
      setError('メニュー情報の確認中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  const formatTime = (timeStr) => timeStr ? timeStr.substring(0, 5) : '';
  
  const getStatusText = (reservation) => {
    if (reservation.is_canceled || reservation.status === 'canceled') return 'キャンセル済';
    if (reservation.status === 'completed') return '完了';
    if (reservation.status === 'noshow') return '取消';
    if (reservation.status === 'reserved') return '予約済';
    return '不明';
  };

  const ReservationCard = ({ reservation, isUpcoming }) => (
    <div 
      className={`reservation-card ${!isUpcoming ? 'rebookable' : ''} ${!isUpcoming && hasActiveReservation ? 'disabled' : ''}`}
      onClick={!isUpcoming ? () => handleRebookClick(reservation) : undefined}
    >
      <div className="card-header">
        <span className="salon-name">{reservation.salon_name || 'サロン情報なし'}</span>
        <span className={`status ${reservation.status}`}>{getStatusText(reservation)}</span>
      </div>
      <div className="card-body">
        <p className="menu-name">{reservation.menu_name || 'メニュー情報なし'}</p>
        <div className="details">
          <p><strong>日時:</strong> {formatDate(reservation.reservation_date)} {formatTime(reservation.reservation_time)}</p>
          <p><strong>担当者:</strong> {reservation.operator_name || '担当者情報なし'}</p>
        </div>
      </div>
      {isUpcoming && reservation.status === 'reserved' && !reservation.is_canceled && (
        <div className="card-footer">
          <button onClick={(e) => { e.stopPropagation(); handleCancelClick(reservation.reservation_id); }} className="cancel-button">予約をキャンセル</button>
        </div>
      )}
    </div>
  );

  if (loading) return <LoadingSpinner />;

  return (
    <div className="history-container">
      {/* CustomAlertの呼び出しを削除 */}
      {confirmInfo.show && <CustomConfirm message={confirmInfo.message} onConfirm={() => executeCancellation(confirmInfo.reservationId)} onCancel={() => setConfirmInfo({ show: false, reservationId: null, message: '' })} />}
      
      <header className="history-header">
        <button onClick={() => navigate('/')} className="back-to-mypage-btn">＜マイページへ戻る</button>
      </header>

      {error && <p className="error-message">{error}</p>}
      
      <section className="history-section">
        <h2>現在の予約</h2>
        {upcomingReservations.length > 0 ? (
          upcomingReservations.map(res => <ReservationCard key={res.reservation_id} reservation={res} isUpcoming={true} />)
        ) : (
          <p className="no-reservations">現在、予約はありません。</p>
        )}
      </section>

      <section className="history-section">
        <h2>過去の予約</h2>
        {displayedPastReservations.length > 0 ? (
          displayedPastReservations.map(res => <ReservationCard key={res.reservation_id} reservation={res} isUpcoming={false} />)
        ) : (
          <p className="no-reservations">過去の予約はありません。</p>
        )}
        {moreLoading && <div className="more-loader"><LoadingSpinner /></div>}
        {hasMorePast && !moreLoading && (
            <button onClick={loadMorePastReservations} className="load-more-btn">もっと見る</button>
        )}
      </section>
    </div>
  );
};

export default ReservationHistoryPage;

