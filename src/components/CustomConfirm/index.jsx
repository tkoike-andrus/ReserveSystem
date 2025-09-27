import React from 'react';
import './CustomConfirm.css';

const CustomConfirm = ({
  message,
  onConfirm,
  onCancel,
  confirmText = 'はい',      // OKボタンのテキスト（デフォルトは「はい」）
  cancelText = 'いいえ',     // キャンセルボタンのテキスト（デフォルトは「いいえ」）
  showCancelButton = true // キャンセルボタンを表示するかどうか
}) => {
  return (
    <div className="confirm-modal-overlay">
      <div className="confirm-modal-content" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-message" style={{ whiteSpace: 'pre-wrap' }}>
          {message}
        </p>
        <div className="confirm-modal-actions">
          {showCancelButton && (
            <button onClick={onCancel} className="confirm-cancel-btn">
              {cancelText}
            </button>
          )}
          <button onClick={onConfirm} className="confirm-ok-btn">
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CustomConfirm;
