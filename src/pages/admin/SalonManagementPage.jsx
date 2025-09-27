import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../services/supabaseClient';
import CustomAlert from '../../components/CustomAlert';
import LoadingSpinner from '../../components/LoadingSpinner';
import imageCompression from 'browser-image-compression';
import './SalonManagementPage.css';

const weekdays = [
  { key: 'monday', label: '月曜日' },
  { key: 'tuesday', label: '火曜日' },
  { key: 'wednesday', label: '水曜日' },
  { key: 'thursday', label: '木曜日' },
  { key: 'friday', label: '金曜日' },
  { key: 'saturday', label: '土曜日' },
  { key: 'sunday', label: '日曜日' },
  { key: 'holiday', label: '祝日' },
];

const paymentOptions = [
  { key: 'cash', label: '現金' },
  { key: 'creditCard', label: 'クレジットカード' },
  { key: 'eMoney', label: '電子マネー' },
  { key: 'qrCode', label: 'QRコード決済' },
];

const createDefaultOpeningHours = () => {
  const hours = {};
  weekdays.forEach(day => {
    hours[day.key] = { isOpen: true, start: '10:00', end: '19:00' };
  });
  return hours;
};

const createDefaultPaymentMethods = () => {
  const methods = {};
  paymentOptions.forEach(opt => {
    methods[opt.key] = false;
  });
  return methods;
};

const SalonManagementPage = () => {
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [salonData, setSalonData] = useState(null);
  const [salonId, setSalonId] = useState(null);
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '' });

  const timeOptions = useMemo(() => {
    const options = [];
    for (let h = 0; h < 24; h++) {
      for (let m = 0; m < 60; m += 30) {
        options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
      }
    }
    return options;
  }, []);

  useEffect(() => {
    const fetchSalonData = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_salon_details');
        if (error) throw error;
        
        if (data && data.length > 0) {
          const fetchedData = data[0];
          setSalonId(fetchedData.salon_id);
          setSalonData({
            salon_name: fetchedData.salon_name || '',
            address: fetchedData.address || '',
            access_info: fetchedData.access_info || '',
            phone_number: fetchedData.phone_number || '',
            opening_hours: fetchedData.opening_hours || createDefaultOpeningHours(),
            payment_methods: fetchedData.payment_methods || createDefaultPaymentMethods(),
            image_url: fetchedData.image_url || '',
          });
        } else {
           // データがない場合はデフォルト値を設定
           setSalonData({
            salon_name: '',
            address: '',
            access_info: '',
            phone_number: '',
            opening_hours: createDefaultOpeningHours(),
            payment_methods: createDefaultPaymentMethods(),
          });
        }
      } catch (err) {
        console.error('サロン情報の取得エラー:', err);
        setAlertInfo({ show: true, message: 'サロン情報の取得に失敗しました。' });
      } finally {
        setLoading(false);
      }
    };
    fetchSalonData();
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSalonData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // ★ 画像圧縮のオプションを設定
    const options = {
      maxSizeMB: 0.5,          // 最大ファイルサイズ (0.5MB)
      maxWidthOrHeight: 1024,  // 最大幅または高さ
      useWebWorker: true,      // Web Workerを使用して処理を高速化
    };

    setIsUploading(true);
    try {
      // ★ ファイルを圧縮
      const compressedFile = await imageCompression(file, options);
      
      const filePath = `${salonId}/${Date.now()}_${compressedFile.name}`;
      
      // ★ 圧縮されたファイルをアップロード
      const { error: uploadError } = await supabase.storage
        .from('salon-images')
        .upload(filePath, compressedFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('salon-images')
        .getPublicUrl(filePath);

      if (!data.publicUrl) {
          throw new Error("画像のURL取得に失敗しました。");
      }

      setSalonData(prev => ({ ...prev, image_url: data.publicUrl }));
      setAlertInfo({show: true, message: "画像をアップロードしました。最後に「保存する」ボタンを押してください。"})

    } catch (error) {
      console.error('画像アップロードエラー:', error);
      setAlertInfo({ show: true, message: `画像のアップロードに失敗しました: ${error.message}` });
    } finally {
      setIsUploading(false);
    }
  };

  const handleOpeningHoursChange = (day, field, value) => {
    setSalonData(prev => ({
      ...prev,
      opening_hours: {
        ...prev.opening_hours,
        [day]: { ...prev.opening_hours[day], [field]: value },
      },
    }));
  };

  const handlePaymentMethodChange = (method) => {
    setSalonData(prev => ({
      ...prev,
      payment_methods: {
        ...prev.payment_methods,
        [method]: !prev.payment_methods[method],
      },
    }));
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.rpc('update_salon_details', {
        p_salon_name: salonData.salon_name,
        p_address: salonData.address,
        p_access_info: salonData.access_info,
        p_phone_number: salonData.phone_number,
        p_opening_hours: salonData.opening_hours,
        p_payment_methods: salonData.payment_methods,
        p_image_url: salonData.image_url,
      });
      if (error) throw error;
      setAlertInfo({ show: true, message: 'サロン情報を更新しました。' });
    } catch (err) {
      console.error('サロン情報の更新エラー:', err);
      setAlertInfo({ show: true, message: `更新に失敗しました: ${err.message}` });
    } finally {
      setLoading(false);
    }
  };
  
  if (loading) return <LoadingSpinner />;
  if (!salonData) return <div>サロン情報が見つかりません。</div>;

  return (
    <div className="salon-management-page">
      {alertInfo.show && <CustomAlert message={alertInfo.message} onClose={() => setAlertInfo({ show: false, message: '' })} />}
      <form onSubmit={handleUpdate} className="salon-form">
        <div className="form-section">
          <h3>サロン画像</h3>
          <div className="image-upload-container">
            <input
              type="file"
              id="salon-image-upload"
              accept="image/*"
              onChange={handleImageUpload}
              disabled={isUploading}
            />
            <label htmlFor="salon-image-upload" className="image-upload-label">
              {isUploading && <div className="uploading-overlay">アップロード中...</div>}
              {salonData.image_url ? (
                <img src={salonData.image_url} alt="サロンのプレビュー" className="image-preview" />
              ) : (
                <div className="upload-placeholder">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                  <span>画像をアップロード</span>
                </div>
              )}
            </label>
          </div>

          <h3>基本情報</h3>
          <div className="form-group">
            <label htmlFor="salon_name">サロン名</label>
            <input type="text" id="salon_name" name="salon_name" value={salonData.salon_name} onChange={handleChange} required />
          </div>
          <div className="form-group">
            <label htmlFor="phone_number">電話番号</label>
            <input type="tel" id="phone_number" name="phone_number" value={salonData.phone_number} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="address">住所</label>
            <input type="text" id="address" name="address" value={salonData.address} onChange={handleChange} />
          </div>
          <div className="form-group">
            <label htmlFor="access_info">アクセス</label>
            <textarea id="access_info" name="access_info" value={salonData.access_info} onChange={handleChange} rows="3"></textarea>
          </div>
        </div>

        <div className="form-section">
          <h3>営業時間</h3>
          {weekdays.map(({ key, label }) => (
            <div key={key} className="opening-hours-row">
              <div className="weekday-label">{label}</div>
              <div className="time-controls">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={salonData.opening_hours[key]?.isOpen || false}
                    onChange={(e) => handleOpeningHoursChange(key, 'isOpen', e.target.checked)}
                  />
                  営業
                </label>
                {salonData.opening_hours[key]?.isOpen && (
                  <>
                    <select
                      value={salonData.opening_hours[key]?.start || '10:00'}
                      onChange={(e) => handleOpeningHoursChange(key, 'start', e.target.value)}
                    >
                      {timeOptions.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                    <span>～</span>
                    <select
                      value={salonData.opening_hours[key]?.end || '19:00'}
                      onChange={(e) => handleOpeningHoursChange(key, 'end', e.target.value)}
                    >
                      {timeOptions.map(time => <option key={time} value={time}>{time}</option>)}
                    </select>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="form-section">
          <h3>支払い方法</h3>
          <div className="payment-methods-container">
            {paymentOptions.map(({ key, label }) => (
              <label key={key} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={salonData.payment_methods[key] || false}
                  onChange={() => handlePaymentMethodChange(key)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <button type="submit" className="save-button" disabled={loading}>
          {loading ? '保存中...' : '保存する'}
        </button>
      </form>
    </div>
  );
};

export default SalonManagementPage;