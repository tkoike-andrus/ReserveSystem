// src/components/CustomAlert/index.jsx

import React from 'react';
import './CustomAlert.css';

const CustomAlert = ({ message, onClose }) => {
  // メッセージ内の改行(\n)を段落(<p>)に変換します
  const messageLines = message.split('\n').map((line, index) => (
    <p key={index}>{line}</p>
  ));

  return (
    <div className="custom-alert-overlay">
      <div className="custom-alert-box">
        <div className="alert-icon-container">
          <svg className="alert-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
            <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/>
          </svg>
        </div>
        <div className="alert-message">
          {messageLines}
        </div>
        <button onClick={onClose} className="alert-close-button">
          閉じる
        </button>
      </div>
    </div>
  );
};

export default CustomAlert;
