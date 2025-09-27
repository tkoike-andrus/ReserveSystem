// src/pages/admin/ScheduleManagementPage.jsx

import React, { useState, useEffect, useMemo } from 'react';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import { supabase } from '../../services/supabaseClient';
import CustomAlert from '../../components/CustomAlert';
import CustomConfirm from '../../components/CustomConfirm';
import './ScheduleManagementPage.css';

const weekdaysMap = { 1: '月', 2: '火', 3: '水', 4: '木', 5: '金', 6: '土', 7: '日' };
const weekdays = Object.entries(weekdaysMap);

const ScheduleManagementPage = () => {
  const [allSlots, setAllSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '' });
  const [confirmInfo, setConfirmInfo] = useState({ show: false, message: '', action: null, data: null });

  const [selectedWeekdays, setSelectedWeekdays] = useState({});
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('19:00');
  const [interval, setInterval] = useState(30);
  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        const hour = String(h).padStart(2, '0');
        const minute = String(m).padStart(2, '0');
        options.push(`${hour}:${minute}`);
      }
    }
    return options;
  }, []);

  const fetchSlots = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_my_slots');
      if (error) throw error;
      setAllSlots(data || []);
    } catch (err) {
      console.error('予約枠の取得エラー:', err);
      setAlertInfo({ show: true, message: '予約枠の取得に失敗しました。' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSlots();
  }, []);

  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const formatDateForDisplay = (date) => {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return `${y}年${m}月${d}日`;
  };

  const availableSlotDates = useMemo(() => 
    new Set(allSlots.map(slot => slot.slot_date)), 
    [allSlots]
  );
  
  const selectedDateSlots = useMemo(() =>
    allSlots
      .filter(slot => slot.slot_date === formatDate(selectedDate))
      .sort((a, b) => a.slot_time.localeCompare(b.slot_time)),
    [allSlots, selectedDate]
  );

  const handleDeleteSlot = (timeToDelete) => {
    setConfirmInfo({
      show: true,
      message: `${formatDateForDisplay(selectedDate)} ${timeToDelete.slice(0,5)} \nの予約枠を削除しますか？`,
      action: 'deleteSlot',
      data: timeToDelete
    });
  };

  const executeDeleteSlot = async (timeToDelete) => {
    try {
      const { error } = await supabase.rpc('delete_slot', {
        p_slot_date: formatDate(selectedDate),
        p_slot_time: timeToDelete,
      });
      if (error) throw error;
      setAlertInfo({ show: true, message: '予約枠を削除しました。' });
      fetchSlots();
    } catch (err) {
      console.error('予約枠の削除エラー:', err);
      setAlertInfo({ show: true, message: '予約枠の削除に失敗しました。' });
    }
  };

  const handleWeekdayChange = (day) => {
    setSelectedWeekdays(prev => ({ ...prev, [day]: !prev[day] }));
  };

  const handleShowConfirmation = () => {
    const selectedDaysArray = Object.entries(selectedWeekdays)
      .filter(([, isSelected]) => isSelected)
      .map(([day]) => weekdaysMap[day]);

    if (selectedDaysArray.length === 0) {
      setAlertInfo({ show: true, message: '曜日を1つ以上選択してください。' });
      return;
    }
    if (startTime >= endTime) {
      setAlertInfo({ show: true, message: '終了時間は開始時間より後に設定してください。' });
      return;
    }

    const confirmationMessage = `以下の内容で${selectedDate.getMonth() + 1}月分の予約枠を一括登録します。\n\n曜日: ${selectedDaysArray.join('、')}\n営業時間: ${startTime} ～ ${endTime}\n間隔: ${interval}分ごと`;
    setConfirmInfo({ show: true, message: confirmationMessage, action: 'bulkAdd' });
  };

  const executeBulkAdd = async () => {
    const weekdays = Object.entries(selectedWeekdays)
      .filter(([, isSelected]) => isSelected)
      .map(([day]) => parseInt(day, 10));

    try {
      const { error } = await supabase.rpc('bulk_add_slots', {
        p_weekdays: weekdays,
        p_start_time: startTime,
        p_end_time: endTime,
        p_interval_minutes: interval,
        p_target_month: formatDate(selectedDate)
      });
      if (error) throw error;
      setAlertInfo({ show: true, message: '一括登録が完了しました。' });
      fetchSlots();
    } catch (err) {
      console.error('予約枠の一括登録エラー:', err);
      setAlertInfo({ show: true, message: '一括登録に失敗しました。' });
    }
  };
  
  const tileClassName = ({ date, view }) => {
    if (view === 'month' && availableSlotDates.has(formatDate(date))) {
      return 'has-slot';
    }
    return null;
  };

  const maxDate = useMemo(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth() + 3, 0);
  }, []);

  const handleBulkDelete = () => {
    setConfirmInfo({
      show: true,
      message: `${formatDateForDisplay(selectedDate)}の予約枠を\nすべて削除しますか？\n(予約済みの枠は削除されません)`,
      action: 'bulkDelete',
    });
  };

  const executeBulkDelete = async () => {
    try {
      const { error } = await supabase.rpc('delete_slots_for_date', {
        p_slot_date: formatDate(selectedDate)
      });
      if (error) throw error;
      setAlertInfo({ show: true, message: '予約枠を削除しました。' });
      fetchSlots();
    } catch (err) {
      console.error('予約枠の一括削除エラー:', err);
      setAlertInfo({ show: true, message: '一括削除に失敗しました。' });
    }
  };

  return (
    <div className="schedule-management-page">
      {alertInfo.show && ( <CustomAlert message={alertInfo.message} onClose={() => setAlertInfo({ show: false, message: '' })} /> )}
      {confirmInfo.show && (
        <CustomConfirm
          message={confirmInfo.message}
          onConfirm={() => {
            if (confirmInfo.action === 'deleteSlot') {
              executeDeleteSlot(confirmInfo.data);
            } else if (confirmInfo.action === 'bulkAdd') {
              executeBulkAdd();
            } else if (confirmInfo.action === 'bulkDelete') {
              executeBulkDelete();
            }
            setConfirmInfo({ show: false, message: '', action: null, data: null });
          }}
          onCancel={() => setConfirmInfo({ show: false, message: '', action: null, data: null })}
        />
      )}

      <div className="schedule-container">
        <div className="calendar-and-slots-view">
          <p>登録済みの予約枠は、<span style={{ color: '#007bff', fontWeight: 'bold' }}>青色</span>でハイライトされます。</p>
          <p>営業スケジュールは<span style={{ color: '#d17a94', fontWeight: 'bold' }}>3ヶ月先</span>まで登録できます。</p>
          <Calendar
            onChange={setSelectedDate}
            value={selectedDate}
            tileClassName={tileClassName}
            className="admin-calendar"
            minDate={new Date()}
            maxDate={maxDate}
            formatDay={(locale, date) => date.getDate()}
            onActiveStartDateChange={({ activeStartDate }) => setSelectedDate(activeStartDate)}
            showNeighboringMonth={false}
          />
          <div className="slot-editor-display">
            <div className="slot-editor-header">
              <h3>{formatDateForDisplay(selectedDate)} の予約枠</h3>
              {selectedDateSlots.some(slot => !slot.is_booked) && (
                <button onClick={handleBulkDelete} className="bulk-delete-button">この日を全て削除</button>
              )}
            </div>
            <div className="slot-list">
              {selectedDateSlots.length > 0 ? (
                selectedDateSlots.map(slot => (
                  <div key={slot.slot_time} className={`slot-item ${slot.is_booked ? 'booked' : ''}`}>
                    <span>{slot.slot_time.slice(0, 5)}</span>
                    {!slot.is_booked && <button onClick={() => handleDeleteSlot(slot.slot_time)} className="delete-slot-btn">&times;</button>}
                  </div>
                ))
              ) : (
                <p className="no-slots-message">この日の予約枠はありません。</p>
              )}
            </div>
          </div>
        </div>

        <div className="bulk-add-editor">
          <h3>営業スケジュールの登録</h3>
          <div className="bulk-add-step">
            <h4>1. 営業する曜日を選択 (複数可)</h4>
            <div className="weekday-selector">
              <div className="weekday-group">
                {weekdays.slice(0, 5).map(([day, name]) => (
                  <label key={day} className={selectedWeekdays[day] ? 'checked' : ''}>
                    <input type="checkbox" checked={!!selectedWeekdays[day]} onChange={() => handleWeekdayChange(day)} />
                    {name}
                  </label>
                ))}
              </div>
              <div className="weekday-group">
                {weekdays.slice(5, 7).map(([day, name]) => (
                  <label key={day} className={selectedWeekdays[day] ? 'checked' : ''}>
                    <input type="checkbox" checked={!!selectedWeekdays[day]} onChange={() => handleWeekdayChange(day)} />
                    {name}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="bulk-add-step">
            <h4>2. 営業スケジュールの設定</h4>
            <div className="time-range-selector">
              <select value={startTime} onChange={(e) => setStartTime(e.target.value)}>
                {timeOptions.map(time => <option key={time} value={time}>{time}</option>)}
              </select>
              <span>～</span>
              <select value={endTime} onChange={(e) => setEndTime(e.target.value)}>
                {timeOptions.map(time => <option key={time} value={time}>{time}</option>)}
              </select>
            </div>
          </div>
          <div className="bulk-add-step">
            <h4>3. 時間間隔を選択</h4>
            <div className="interval-selector">
              <label className={interval === 30 ? 'active' : ''}>
                <input type="radio" name="interval" checked={interval === 30} onChange={() => setInterval(30)} />
                30分
              </label>
              <label className={interval === 60 ? 'active' : ''}>
                <input type="radio" name="interval" checked={interval === 60} onChange={() => setInterval(60)} />
                60分
              </label>
            </div>
          </div>
          <div className="bulk-add-step">
            <button onClick={handleShowConfirmation} className="bulk-add-button">登録内容を確認</button>
            <p className="form-note">{selectedDate.getFullYear()}年{selectedDate.getMonth() + 1}月内の、今日以降の該当日が対象です。</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScheduleManagementPage;
