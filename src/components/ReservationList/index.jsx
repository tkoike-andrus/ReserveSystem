// src/components/ReservationList/index.jsx

import React, { useState } from 'react';
import './ReservationList.css';

const ReservationList = ({ reservations, onCancel, isPast }) => {
  const [expandedId, setExpandedId] = useState(null);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
  };

  // ▼▼▼ 修正点: キャンセル可能かどうかを判定するロジックを更新 ▼▼▼
  const isCancelable = (reservation) => {
    // データベースから取得したキャンセル期限（分）を使用。取得できなかった場合はデフォルトで24時間。
    const deadlineMinutes = reservation.cancellation_deadline_minutes || 1440;
    
    const reservationDateTime = new Date(`${reservation.reservation_date}T${reservation.reservation_time}`);
    const deadlineTime = reservationDateTime.getTime() - deadlineMinutes * 60 * 1000;
    
    // 現在時刻が、キャンセル期限の時刻よりも前かどうかを判定
    return new Date().getTime() < deadlineTime;
  };

  const toggleDetails = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="ReservationList">
      {reservations.length > 0 ? (
        <ul className="reservation-cards">
          {reservations.map(res => {
            const menuPrice = res.gel_removal ? res.menu_price_with_off : res.menu_price_without_off;
            const isExpanded = expandedId === res.reservation_id;
            const cardClasses = `reservation-card status-${res.status} ${isPast ? 'past-card' : ''}`;

            return (
              <li key={res.reservation_id} className={cardClasses}>
                <div className="card-body">
                  <div className="info-row">
                    <span className="info-label">予約番号</span>
                    <span className="info-value">{res.reservation_id.substring(0, 8).toUpperCase()}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">状況</span>
                    <span className={`status-badge status-${res.status}`}>
                      {res.status === 'noshow' ? '取り消し' : res.status_name}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">日付</span>
                    <span className="info-value">{formatDate(res.reservation_date)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">開始時間</span>
                    <span className="info-value">{res.reservation_time.slice(0, 5)}~</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">担当</span>
                    <span className="info-value">{res.operator_name || 'N/A'}</span>
                  </div>
                </div>

                {res.menu_id && (
                  <div className="menu-details-section">
                    <button onClick={() => toggleDetails(res.reservation_id)} className="details-toggle">
                      選択したメニュー・オプション
                      <span className={`arrow ${isExpanded ? 'up' : 'down'}`}></span>
                    </button>
                    {isExpanded && (
                      <div className="menu-details-content">
                        <img src={res.menu_image_url || 'https://placehold.co/300x300/f8e7f1/d17a94?text=Nail'} alt={res.menu_name} className="details-menu-image" />
                        <div className="details-menu-info">
                          <h4>{res.menu_name || 'メニュー情報なし'}</h4>
                          <p>{res.menu_description || ''}</p>
                          <div className="details-price-row">
                            <span>{res.gel_removal ? 'オフあり' : 'オフなし'}</span>
                            <strong>¥{menuPrice ? menuPrice.toLocaleString() : '-'}</strong>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="card-footer">
                  <div className="info-row total-price">
                    <span className="info-label">合計</span>
                    <span className="info-value">¥{menuPrice ? menuPrice.toLocaleString() : '-'} (税込)</span>
                  </div>
                  {!isPast && res.status === 'reserved' && isCancelable(res) && (
                    <button onClick={() => onCancel(res.reservation_id)} className="action-button">
                      予約の変更・キャンセル
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="no-reservations">{isPast ? '過去の予約はありません。' : '現在の予約はありません。'}</p>
      )}
    </div>
  );
};

export default ReservationList;
