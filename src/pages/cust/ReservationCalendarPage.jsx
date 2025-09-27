import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import CustomConfirm from '../../components/CustomConfirm';
import './ReservationCalendarPage.css';

// ヘルパー関数: 日付をJST基準の 'YYYY-MM-DD' 形式に変換
const toLocalISOString = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ヘルパー関数: 月の最初の日と最後の日を取得
const getMonthRange = (date) => {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: toLocalISOString(start),
    end: toLocalISOString(end),
  };
};

const ReservationCalendarPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile } = useUser();

  const [selectedMenu, setSelectedMenu] = useState(location.state?.menu || null);
  const [operators, setOperators] = useState([]);
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  
  const [activeStartDate, setActiveStartDate] = useState(new Date());
  const [availableDates, setAvailableDates] = useState([]);
  const [availableTimes, setAvailableTimes] = useState({});
  
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedTime, setSelectedTime] = useState('');
  const [otherRequests, setOtherRequests] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState('');
  
  const [showCompletionDialog, setShowCompletionDialog] = useState(false);

  const fetchAvailableSlots = useCallback(async (operatorId, date) => {
    if (!selectedMenu || !operatorId) {
      setAvailableDates([]);
      setAvailableTimes({});
      return;
    }
    setSlotsLoading(true);
    setError('');
    const { start, end } = getMonthRange(date);
    try {
      const { data: slots, error: slotsError } = await supabase
        .from('slots')
        .select('slot_date, slot_time')
        .eq('salon_id', selectedMenu.salon_id)
        .eq('is_booked', false)
        .eq('operator_id', operatorId)
        .gte('slot_date', start)
        .lte('slot_date', end)
        .order('slot_time', { ascending: true });

      if (slotsError) throw slotsError;

      const uniqueDates = [...new Set(slots.map(slot => slot.slot_date))];
      setAvailableDates(uniqueDates);
      const timesByDate = slots.reduce((acc, slot) => {
        if (!acc[slot.slot_date]) acc[slot.slot_date] = [];
        acc[slot.slot_date].push(slot.slot_time);
        return acc;
      }, {});
      setAvailableTimes(timesByDate);
    } catch (err) {
      console.error('予約枠の取得エラー:', err);
      setError('予約枠の取得に失敗しました。');
      setAvailableDates([]);
      setAvailableTimes({});
    } finally {
      setSlotsLoading(false);
    }
  }, [selectedMenu]);

  useEffect(() => {
    if (!selectedMenu) {
      setError('メニュー情報がありません。選択画面に戻ってください。');
      setLoading(false);
      return;
    }
    const fetchOperators = async () => {
      setLoading(true);
      try {
        const { data, error: fetchError } = await supabase.from('operators').select('operator_id, operator_name').eq('salon_id', selectedMenu.salon_id).eq('is_active', true);
        if (fetchError) throw fetchError;
        setOperators(data || []);
      } catch (err) {
        console.error('担当者情報の取得エラー:', err);
        setError('担当者情報の取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };
    fetchOperators();
  }, [selectedMenu]);

  useEffect(() => {
    fetchAvailableSlots(selectedOperatorId, activeStartDate);
  }, [selectedOperatorId, activeStartDate, fetchAvailableSlots]);

  const handleDateChange = (date) => {
    setSelectedDate(date);
    setSelectedTime('');
  };
  
  const handleReservation = async () => {
    setError('');
    if (!profile) {
      setError('予約するにはログインが必要です。');
      return;
    }
    if (!selectedOperatorId) {
      setError('担当者を選択してください。');
      return;
    }
    if (!selectedTime) {
      setError('予約時間を選択してください。');
      return;
    }
    if (otherRequests.length > 200) {
      setError('ご要望は200文字以内で入力してください。');
      return;
    }
    
    setLoading(true);

    try {
      const { data: canReserve, error: checkError } = await supabase.rpc('can_create_reservation');
      if (checkError) throw new Error('予約可否のチェックに失敗しました。');
      if (!canReserve) {
        setError('短時間にキャンセルが繰り返されたため、新しい予約は24時間後に可能になります。');
        setIsConfirming(false);
        setLoading(false);
        return;
      }
      
      const { error: insertError } = await supabase.rpc('create_reservation_and_book_slots', {
          p_customer_id: profile.id,
          p_operator_id: selectedOperatorId,
          p_salon_id: selectedMenu.salon_id,
          p_menu_id: selectedMenu.id,
          p_reservation_date: toLocalISOString(selectedDate),
          p_reservation_time: selectedTime,
          p_gel_removal: selectedMenu.with_off || false,
          p_off_price: selectedMenu.off_price || 0,
          p_other_requests: otherRequests
      });

      if (insertError) throw insertError;
      
      setShowCompletionDialog(true);

    } catch(err) {
      console.error('予約処理エラー:', err);
      setError('予約の確定に失敗しました。再度お試しください。');
    } finally {
      if (!showCompletionDialog) {
          setIsConfirming(false);
      }
      setLoading(false);
    }
  };
  
  const tileClassName = ({ date, view }) => {
    if (view === 'month') {
      const dateString = toLocalISOString(date);
      if (availableDates.includes(dateString)) return 'available-date';
    }
    return null;
  };

  const tileDisabled = ({ date, view }) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (view === 'month') {
        if (date < today) return true;
        return !availableDates.includes(toLocalISOString(date));
    }
    return false;
  };
  
  if (loading) return <LoadingSpinner />;

  if (!selectedMenu) {
     return (
      <div className="reservation-container">
        {error && <p className="error-message">{error}</p>}
        <button className="back-to-menu-button" onClick={() => navigate('/menus')}>メニュー選択へ戻る</button>
      </div>
     )
  }

  const selectedDateString = toLocalISOString(selectedDate);
  let timesForSelectedDate = availableTimes[selectedDateString] || [];
  const today = new Date();
  const todayString = toLocalISOString(today);
  if (selectedDateString === todayString) {
    const hours = String(today.getHours()).padStart(2, '0');
    const minutes = String(today.getMinutes()).padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;
    timesForSelectedDate = timesForSelectedDate.filter(time => time.substring(0, 5) > currentTime);
  }

  return (
    <div className="reservation-container">
      {showCompletionDialog && (
        <CustomConfirm
          message="予約が完了しました。"
          confirmText="予約履歴へ"
          showCancelButton={false}
          onConfirm={() => navigate('/history')}
        />
      )}

      {error && <p className="error-message-top">{error}</p>}
      
      <header className="reservation-header">
        <button onClick={() => navigate(-1)} className="back-button">＜</button>
        <h2>日時選択</h2>
      </header>
      <div className="selected-menu-info">
        <h3>{selectedMenu.name}</h3>
        <p>施術時間: {selectedMenu.duration_minutes}分 / 価格: ¥{selectedMenu.price_without_tax.toLocaleString()} (税抜)</p>
        {selectedMenu.with_off && <span className="off-label">オフ有り</span>}
      </div>

      <div className="operator-selector">
        <label htmlFor="operator">担当者を選択</label>
        <select id="operator" value={selectedOperatorId} onChange={(e) => setSelectedOperatorId(e.target.value)}>
          <option value="" disabled>選択してください</option>
          {operators.map(op => (
            <option key={op.operator_id} value={op.operator_id}>{op.operator_name}</option>
          ))}
        </select>
      </div>
      
      {selectedOperatorId ? (
        <>
          <div className="calendar-wrapper">
            <Calendar
              onChange={handleDateChange}
              value={selectedDate}
              onActiveStartDateChange={({ activeStartDate }) => setActiveStartDate(activeStartDate)}
              minDate={new Date()}
              tileClassName={tileClassName}
              tileDisabled={tileDisabled}
              showNeighboringMonth={false}
            />
          </div>

          <div className="time-slots-wrapper">
            <h3>時間を選択</h3>
            {slotsLoading ? <LoadingSpinner /> : (
              <div className="time-slots">
                {timesForSelectedDate.length > 0 ? (
                  timesForSelectedDate.map(time => (
                    <button
                      key={time}
                      className={`time-slot-button ${selectedTime === time ? 'selected' : ''}`}
                      onClick={() => setSelectedTime(time)}
                    >
                      {time.substring(0, 5)}
                    </button>
                  ))
                ) : (
                  <p>選択可能な時間がありません。</p>
                )}
              </div>
            )}
          </div>
          
          <div className="reservation-footer">
            <button 
              onClick={() => setIsConfirming(true)} 
              disabled={!selectedTime || loading}
              className="confirm-button"
            >
              予約内容の確認へ
            </button>
          </div>
        </>
      ) : (
        <div className="prompt-select-operator">
          <p>担当者を選択すると、予約可能な日時が表示されます。</p>
        </div>
      )}

      {isConfirming && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>ご予約内容の確認</h3>
            <div className="confirm-details">
              <p><strong>メニュー:</strong> {selectedMenu.name}</p>
              {selectedMenu.with_off && <p><strong>オプション:</strong> オフ</p>}
              <p><strong>日時:</strong> {new Date(selectedDate).toLocaleDateString()} {selectedTime.substring(0,5)}</p>
              <p><strong>担当者:</strong> {operators.find(op => op.operator_id === selectedOperatorId)?.operator_name}</p>
              <p><strong>合計時間:</strong> {selectedMenu.duration_minutes}分</p>
              <p><strong>合計金額:</strong> ¥{selectedMenu.price_without_tax.toLocaleString()} (税抜)</p>
            </div>
            
            <div className="form-group">
              <label htmlFor="other_requests">ご要望（任意）</label>
              <div className="textarea-wrapper">
                <textarea 
                  id="other_requests"
                  rows="3"
                  value={otherRequests}
                  onChange={(e) => setOtherRequests(e.target.value)}
                  maxLength="200"
                  placeholder="（例）特定のデザインについて相談したいです。"
                ></textarea>
                <div className="char-counter">{otherRequests.length} / 200</div>
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setIsConfirming(false)} className="button-cancel">戻る</button>
              <button onClick={handleReservation} disabled={loading} className="button-submit">予約する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationCalendarPage;

