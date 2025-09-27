// src/components/ReservationForm/index.jsx

import React, { useState, useEffect } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { supabase } from '../../services/supabaseClient';
import CustomAlert from '../CustomAlert';
import CustomConfirm from '../CustomConfirm';
import './ReservationForm.css';

const ReservationForm = ({ liffProfile, onReservationSuccess, operatorId, availableDates, selectedMenu }) => {
  const [date, setDate] = useState(new Date());
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedTime, setSelectedTime] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '' });
  const [confirmInfo, setConfirmInfo] = useState({ show: false, message: '' });

  useEffect(() => {
    const fetchAvailableTimes = async () => {
      if (!date || !operatorId) {
        setAvailableTimes([]);
        return;
      }
      // タイムゾーンを考慮しない日付文字列を作成
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const selectedDateStr = `${year}-${month}-${day}`;

      let { data, error } = await supabase
        .from('slots')
        .select('slot_time')
        .eq('operator_id', operatorId)
        .eq('slot_date', selectedDateStr)
        .eq('is_booked', false)
        .order('slot_time');
      if (error) {
        console.error('予約可能時間の取得エラー:', error);
        setAvailableTimes([]);
        return;
      }
      const today = new Date();
      const isToday = selectedDateStr === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      if (isToday) {
        const currentTime = today.toTimeString().slice(0, 5);
        data = data.filter(slot => slot.slot_time.slice(0, 5) > currentTime);
      }
      setAvailableTimes(data.map(slot => slot.slot_time));
    };
    fetchAvailableTimes();
  }, [date, operatorId]);

  const tileClassName = ({ date, view }) => {
    if (view === 'month') {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateString = `${year}-${month}-${day}`;
      
      if (availableDates.has(dateString)) {
        return 'available';
      }
    }
    return null;
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

  const handleReservation = () => {
    if (!liffProfile || !date || !selectedTime) {
      setAlertInfo({ show: true, message: '日付と時間を選択してください。' });
      return;
    }
    if (!operatorId) {
      setAlertInfo({ show: true, message: '運営者情報が取得できませんでした。時間をおいて再度お試しください。'});
      return;
    }

    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const confirmationMessage = `以下の内容で予約しますか？\n${year}年${month}月${day}日 ${selectedTime.slice(0, 5)}`;
    
    setConfirmInfo({ show: true, message: confirmationMessage });
  };

  const executeReservation = async () => {
    setIsSubmitting(true);
    try {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const reservationDate = `${year}-${month}-${day}`;

      const { error } = await supabase.rpc('create_reservation_and_book_slot', {
        p_operator_id: operatorId,
        p_line_user_id: liffProfile.userId,
        p_display_name: liffProfile.displayName,
        p_picture_url: liffProfile.pictureUrl,
        p_status_message: liffProfile.statusMessage || null,
        p_reservation_date: reservationDate,
        p_reservation_time: selectedTime,
        p_other_requests: message || null,
        p_menu_id: selectedMenu ? selectedMenu.id : null,
        p_gel_removal: selectedMenu ? selectedMenu.gelRemoval : null,
      });

      if (error) throw error;

      setAlertInfo({ show: true, message: 'ご予約ありがとうございます！\n予約履歴ページでご確認ください。' });
      setSelectedTime('');
      setMessage('');
    } catch (error) {
      console.error('予約エラー:', error);
      setAlertInfo({ show: true, message: '予約の送信中にエラーが発生しました。' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="ReservationForm">
      {alertInfo.show && (
        <CustomAlert
          message={alertInfo.message}
          onClose={() => {
            setAlertInfo({ show: false, message: '' });
            if (alertInfo.message.includes('ありがとうございます')) {
                onReservationSuccess();
            }
          }}
        />
      )}
      
      {confirmInfo.show && (
        <CustomConfirm
          message={confirmInfo.message}
          onConfirm={() => {
            setConfirmInfo({ show: false, message: '' });
            executeReservation();
          }}
          onCancel={() => {
            setConfirmInfo({ show: false, message: '' });
          }}
        />
      )}

      <h3>予約カレンダー</h3>
      <Calendar
        className="react-calendar"
        onChange={(value) => {
          setDate(value);
          setSelectedTime('');
        }}
        value={date}
        minDate={new Date()}
        tileClassName={tileClassName}
        showNeighboringMonth={false}
        navigationLabel={formatNavigationLabel}
        formatDay={(locale, date) => date.getDate()}
      />
      <div className="time-and-remarks-container">
        <div>
          <h4>時間を選択</h4>
          <div className="time-buttons">
            {availableTimes.length > 0 ? (
              <div>
                {availableTimes.map(time => (
                  <button
                    key={time}
                    onClick={() => setSelectedTime(time)}
                    className={selectedTime === time ? 'selected' : ''}
                  >
                    {time.slice(0, 5)}
                  </button>
                ))}
              </div>
            ) : (
              <p>この日の予約可能時間はありません。</p>
            )}
          </div>
        </div>
        <div>
          <h4>その他・要望</h4>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="ご要望などはこちらにご記入ください"
            rows="4"
            maxLength="200"
          />
          <div className="char-counter">
            {message.length} / 200
          </div>
        </div>
      </div>
      <button 
        className="reserve-button" 
        onClick={handleReservation}
        disabled={!selectedTime || isSubmitting}
      >
        {isSubmitting ? '予約処理中...' : '予約する'}
      </button>
    </div>
  );
};

export default ReservationForm;
