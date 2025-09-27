// src/pages/admin/ReservationManagementPage.jsx

import React, { useState, useEffect, useMemo } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { supabase } from '../../services/supabaseClient';
import CustomAlert from '../../components/CustomAlert';
import CustomConfirm from '../../components/CustomConfirm';
import './ReservationManagementPage.css';

const ReservationManagementPage = () => {
  const [allReservations, setAllReservations] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '' });
  const [confirmInfo, setConfirmInfo] = useState({ show: false, reservationId: null, message: '', action: null });
　const [currentTime, setCurrentTime] = useState(new Date());

  const fetchReservations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_all_my_operator_reservations');
      if (error) throw error;
      setAllReservations(data || []);
    } catch (err) {
      setError('予約情報の取得に失敗しました。');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReservations();
  }, []);

  //1分ごとに現在時刻を更新するタイマーを設定
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // 60000ミリ秒 = 1分

    // コンポーネントが不要になったらタイマーを解除
    return () => clearInterval(timer);
  }, []);

  // statusから表示用のテキストを取得する関数を定義
  const getStatusText = (reservation) => {
    if (reservation.is_canceled || reservation.status === 'canceled') return 'キャンセル済';
    if (reservation.status === 'completed') return '完了';
    if (reservation.status === 'noshow') return '取消';
    if (reservation.status === 'reserved') return '予約済';
    return '不明';
  };

  const handleCompleteReservation = (reservationId) => {
    setConfirmInfo({
      show: true,
      reservationId: reservationId,
      message: 'この予約を「完了」ステータスに\n変更しますか？',
      action: 'complete'
    });
  };

  const executeCompletion = async (reservationId) => {
    try {
      const { error } = await supabase
        .from('reservations')
        .update({ status: 'completed' })
        .eq('reservation_id', reservationId);
      if (error) throw error;
      setAlertInfo({ show: true, message: 'ステータスを更新しました。' });
      fetchReservations();
    } catch (err) {
      setAlertInfo({ show: true, message: 'ステータスの更新に失敗しました。' });
      console.error(err);
    }
  };

  const handleNoShowCancel = (reservationId) => {
    setConfirmInfo({
      show: true,
      reservationId: reservationId,
      message: 'この予約を「無断キャンセル」として処理しますか？',
      action: 'noshow'
    });
  };

  const executeNoShowCancellation = async (reservationId) => {
    try {
      const { error } = await supabase
        .from('reservations')
        .update({ 
          status: 'noshow' })
        .eq('reservation_id', reservationId);
      if (error) throw error;
      setAlertInfo({ show: true, message: '無断キャンセルとして処理しました。' });
      fetchReservations();
    } catch (err) {
      setAlertInfo({ show: true, message: '処理に失敗しました。' });
      console.error(err);
    }
  };

  const handleAdminCancel = (reservationId) => {
    setConfirmInfo({
      show: true,
      reservationId: reservationId,
      message: 'この予約を取り消して\nよろしいですか？\n(予約枠は空きに戻ります)',
      action: 'canceled'
    });
  };

  const executeAdminCancellation = async (reservationId) => {
    try {
      // 顧客が使うものと同じ安全な関数を呼び出す
      const { error } = await supabase.rpc('cancel_reservation_and_free_slot', {
        p_reservation_id: reservationId
      });
      if (error) throw error;
      setAlertInfo({ show: true, message: '予約を取り消しました。' });
      fetchReservations();
    } catch (err) {
      setAlertInfo({ show: true, message: '処理に失敗しました。' });
      console.error(err);
    }
  };

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  //表示用の日付フォーマット関数
  const formatDateForDisplay = (date) => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}年${m}月${d}日`;
  };

  const formatNavigationLabel = ({ date }) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return (
      <span className="custom-navigation-label">
        <span className="nav-year">{year}年</span>
        <span className="nav-month">{month}月</span>
      </span>
    );
  };

  const reservationDates = useMemo(() => 
    new Set(allReservations.map(res => res.reservation_date)),
    [allReservations]
  );

  const selectedDateStr = useMemo(() => formatDate(selectedDate), [selectedDate]);
  const isTodaySelected = useMemo(() => formatDate(new Date()) === selectedDateStr, [selectedDateStr]);
  
  const reservationsForSelectedDate = useMemo(() =>
    allReservations.filter(res => res.reservation_date === selectedDateStr),
    [allReservations, selectedDateStr]
  );
  
  const selectedDateReservations = useMemo(() => 
    reservationsForSelectedDate.sort((a, b) => a.reservation_time.localeCompare(b.reservation_time)),
    [reservationsForSelectedDate]
  );

  const tileClassName = ({ date, view }) => {
    if (view === 'month' && reservationDates.has(formatDate(date))) {
      return 'has-reservation';
    }
    return null;
  };

  const isTimePassed = (date, time) => {
    const reservationDateTime = new Date(`${date}T${time}`);
    return currentTime >= reservationDateTime;
  };

  const monthlyReservationsCount = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    return allReservations.filter(res => {
      const resDate = new Date(res.reservation_date);
      return resDate.getFullYear() === currentYear && resDate.getMonth() === currentMonth;
    }).length;
  }, [allReservations]);

  const selectedDayStat = useMemo(() => {
    if (isTodaySelected) {
      return {
        label: '本日の残り予約数',
        count: reservationsForSelectedDate.filter(r => r.status === 'reserved').length
      };
    } else {
      return {
        label: `${selectedDate.getDate()}日の予約数`,
        count: reservationsForSelectedDate.length
      };
    }
  }, [reservationsForSelectedDate, isTodaySelected, selectedDate]);

  if (loading) return <p>読み込み中...</p>;
  if (error) return <p className="error-message">{error}</p>;

  return (
    <div className="reservation-management-page">
      {alertInfo.show && ( <CustomAlert message={alertInfo.message} onClose={() => setAlertInfo({ show: false, message: '' })} /> )}
      {confirmInfo.show && (
        <CustomConfirm
          message={confirmInfo.message}
          onConfirm={() => {
            if (confirmInfo.action === 'complete') {
              executeCompletion(confirmInfo.reservationId);
            } else if (confirmInfo.action === 'noshow') {
              executeNoShowCancellation(confirmInfo.reservationId);
            } else if (confirmInfo.action === 'canceled') {
              executeAdminCancellation(confirmInfo.reservationId);
            }
            setConfirmInfo({ show: false, reservationId: null, message: '', action: null });
          }}
          onCancel={() => setConfirmInfo({ show: false, reservationId: null, message: '', action: null })}
        />
      )}

      <div className="stats-container">
        <div className="stat-card">
          <h4>当月の予約数</h4>
          <p>{monthlyReservationsCount}<span>件</span></p>
        </div>
        {isTodaySelected ? (
          <>
            <div className="stat-card">
              <h4>{selectedDayStat.label}</h4>
              <p>{selectedDayStat.count}<span>件</span></p>
            </div>
          </>
        ) : (
          <div className="stat-card full-width">
            <h4>{selectedDate.getDate()}日の予約数</h4>
            <p>{reservationsForSelectedDate.length}<span>件</span></p>
          </div>
        )}
      </div>
      <p>お客様の予約は、<span style={{ color: '#1ac723ff', fontWeight: 'bold' }}>緑色</span>でハイライトされます。</p>
      <Calendar
        onChange={setSelectedDate}
        value={selectedDate}
        tileClassName={tileClassName}
        className="admin-calendar"
        navigationLabel={formatNavigationLabel}
        showNeighboringMonth={false}
        minDate={new Date()}
        formatDay={(locale, date) => date.getDate()}
      />
      
      <div className="selected-date-reservations">
        <h3>{formatDateForDisplay(selectedDate)} の予約</h3>
        {selectedDateReservations.length > 0 ? (
          <div className="reservation-list">
            {selectedDateReservations.map(res => {
              const price = res.gel_removal ? res.menu_price_with_off : res.menu_price_without_off;
              return (
                <div key={res.reservation_id} className={`reservation-card-admin status-${res.status}`}>
                  <div className="card-header-admin">
                    <strong>{res.reservation_time.slice(0, 5)}</strong>
                    <span>{res.status_name}</span>
                  </div>
                  <div className="card-body-admin">
                    <div className="customer-info">
                      <img 
                        src={res.customer_picture_url || 'https://placehold.co/50x50/ccc/fff?text=User'} 
                        alt={res.customer_name} 
                        className="customer-avatar"
                      />
                    </div>
                    <div className="reservation-details-admin">
                      <p><strong>顧客名:</strong><span>{res.customer_name || 'N/A'}</span></p>
                      <p><strong>メニュー:</strong><span>{res.menu_name || 'N/A'}</span></p>
                      <p><strong>オフ:</strong><span>{res.gel_removal ? 'あり' : 'なし'}</span></p>
                      <p><strong>価格:</strong><span>¥{price ? price.toLocaleString() : '-'}</span></p>
                      {res.other_requests && (
                        <div className="request-details-admin">
                          {/* ... */}
                        </div>
                      )}
                    </div>
                  </div>
                  {res.status === 'reserved' && (
                    <div className="card-footer-admin">
                      <button 
                        onClick={() => handleAdminCancel(res.reservation_id)}
                        className="cancel-button-admin"
                      >
                        取消
                      </button>
                      <button 
                        onClick={() => handleNoShowCancel(res.reservation_id)}
                        className="noshow-button"
                        disabled={!isTimePassed(res.reservation_date, res.reservation_time)}
                      >
                        無断キャンセル
                      </button>
                      <button 
                        onClick={() => handleCompleteReservation(res.reservation_id)}
                        className="complete-button"
                        disabled={!isTimePassed(res.reservation_date, res.reservation_time)}
                      >
                        施術完了
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p>この日の予約はありません。</p>
        )}
      </div>
    </div>
  );
};

export default ReservationManagementPage;
