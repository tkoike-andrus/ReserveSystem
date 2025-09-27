import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import LoadingSpinner from '../../components/LoadingSpinner';
import imageCompression from 'browser-image-compression';
import './CustomerDetailPage.css';

// Debounce hook for auto-saving
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
};

const CustomerDetailPage = () => {
  const { customerId } = useParams();
  const { profile: operatorProfile, loading: userLoading } = useUser();
  const navigate = useNavigate();

  const [customer, setCustomer] = useState(null);
  const [karute, setKarute] = useState(null);
  const [history, setHistory] = useState([]);
  const [stats, setStats] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  
  // Form state for karute
  const [formData, setFormData] = useState({
    preferred_colors: '', design_preferences: '', designs_to_avoid: '',
    lifestyle_hobby: '', 
    lifestyle_notes: '', counseling_notes: ''
  });

  // Auto-saving logic
  const debouncedFormData = useDebounce(formData, 1500); // 1.5 seconds delay

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    setIsSaving(true);
  };
  
  // Lazy creation and fetching logic
  const fetchCustomerData = useCallback(async () => {
    if (!customerId || !operatorProfile?.salon_id) return;
    setIsLoading(true);

    try {
      // 1. Fetch customer profile
      const { data: customerData, error: customerError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', customerId)
        .single();
      if (customerError) throw customerError;
      setCustomer(customerData);

      // 2. Fetch reservation stats
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_customer_reservation_stats', { p_customer_id: customerId });
      if (statsError) throw statsError;
      setStats(statsData[0]);

      // 3. Fetch or create karute (Lazy Creation)
      let { data: karuteData, error: karuteError } = await supabase
        .from('customer_karutes')
        .select('*')
        .eq('customer_id', customerId)
        .single();
      
      if (karuteError && karuteError.code === 'PGRST116') { // Not found
        const { data: newKarute, error: newKaruteError } = await supabase
          .from('customer_karutes')
          .insert({
            customer_id: customerId,
            salon_id: operatorProfile.salon_id
          })
          .select()
          .single();
        if (newKaruteError) throw newKaruteError;
        karuteData = newKarute;
      } else if (karuteError) {
        throw karuteError;
      }
      setKarute(karuteData);
      setFormData({
        preferred_colors: karuteData.preferred_colors || '',
        design_preferences: karuteData.design_preferences || '',
        designs_to_avoid: karuteData.designs_to_avoid || '',
        lifestyle_hobby: karuteData.lifestyle_hobby || '',
        lifestyle_notes: karuteData.lifestyle_notes || '',
        counseling_notes: karuteData.counseling_notes || '',
      });

      // 4. Fetch visit history (completed only)
      const { data: historyData, error: historyError } = await supabase
        .from('reservations')
        .select('*, operators(operator_name), menus(name)')
        .eq('customer_id', customerId)
        .eq('status', 'completed')
        .order('reservation_date', { ascending: false });
      if (historyError) throw historyError;
      setHistory(historyData);

      // 5. Fetch photos
       const { data: photoData, error: photoError } = await supabase
        .from('karute_photos')
        .select('*')
        .eq('karute_id', karuteData.id)
        .order('uploaded_at', { ascending: false });
      if (photoError) throw photoError;
      setPhotos(photoData);

    } catch (error) {
      console.error('顧客カルテデータの取得に失敗しました:', error);
    } finally {
      setIsLoading(false);
    }
  }, [customerId, operatorProfile?.salon_id]);
  
  useEffect(() => {
    fetchCustomerData();
  }, [fetchCustomerData]);

  // Auto-save effect
  useEffect(() => {
    const saveKarute = async () => {
      if (karute && isSaving) {
        const { error } = await supabase
          .from('customer_karutes')
          .update(debouncedFormData)
          .eq('id', karute.id);
        
        if (error) {
          console.error("カルテの自動保存に失敗:", error);
        }
        setIsSaving(false);
      }
    };
    saveKarute();
  }, [debouncedFormData, karute, isSaving]);
  
  const handlePhotoUpload = async (event) => {
    if (!event.target.files || event.target.files.length === 0 || !karute) return;
    setIsUploading(true);
    try {
      const file = event.target.files[0];
      const options = {
        maxSizeMB: 1,
        maxWidthOrHeight: 1024,
        useWebWorker: true,
      };
      
      const compressedFile = await imageCompression(file, options);
      const fileExt = file.name.split('.').pop();
      const fileName = `${karute.id}/${new Date().getTime()}.${fileExt}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('karute-photos')
        .upload(fileName, compressedFile);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('karute-photos')
        .getPublicUrl(fileName);

      // Insert into karute_photos table
      const { data: newPhoto, error: insertError } = await supabase
        .from('karute_photos')
        .insert({
          karute_id: karute.id,
          photo_url: publicUrl,
          caption: ''
        })
        .select()
        .single();

      if (insertError) throw insertError;

      setPhotos(prev => [newPhoto, ...prev]);

    } catch (error) {
      alert(`写真のアップロードに失敗しました: ${error.message}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  const handleDeletePhoto = async (photoId, photoUrl) => {
    if (window.confirm('この写真を削除しますか？')) {
      try {
        // Delete from table
        const { error: dbError } = await supabase
          .from('karute_photos')
          .delete()
          .eq('id', photoId);
        if (dbError) throw dbError;

        // Delete from storage
        const path = new URL(photoUrl).pathname.split('/karute-photos/')[1];
        const { error: storageError } = await supabase.storage
          .from('karute-photos')
          .remove([path]);
        if (storageError) throw storageError;

        setPhotos(photos.filter(p => p.id !== photoId));
      } catch (error) {
        alert(`写真の削除に失敗しました: ${error.message}`);
      }
    }
  };

  const handleSendNotification = () => {
    navigate('/admin/notifications', {
      state: {
        targetCustomer: {
          customer_id: customer.id,
          display_name: customer.display_name
        }
      }
    });
  };

  if (userLoading || isLoading) return <LoadingSpinner />;
  if (!customer) return <div>顧客が見つかりません。</div>;
  
  const historyToShow = showAllHistory ? history : history.slice(0, 3);

  return (
    <div className="customer-detail-container">
      {selectedPhoto && (
        <div className="photo-modal-overlay" onClick={() => setSelectedPhoto(null)}>
          <img src={selectedPhoto} alt="拡大表示" className="photo-modal-content" />
        </div>
      )}
      <div className="detail-header">
        <div className="customer-info">
          <img src={customer.picture_url || 'https://placehold.co/80x80/EEDDE2/D17A94?text=User'} alt="avatar" className="customer-avatar" />
          <div>
            <h1 className="customer-name">{customer.display_name}</h1>
            <p className="customer-email">{customer.email}</p>
          </div>
        </div>
        <button onClick={handleSendNotification} className="send-notification-btn">
          <i className="fa-solid fa-paper-plane"></i> お知らせを送る
        </button>
      </div>

      <div className="karute-grid">
        {/* Reservation Stats */}
        <div className="karute-card">
          <h3>予約統計</h3>
          {stats ? (
            <div className="stats-container">
              <div className="stats-item">
                <span className="stats-value">{stats.completed_count}</span>
                <span className="stats-label">来店</span>
              </div>
              <div className="stats-item">
                <span className="stats-value">{stats.canceled_count}</span>
                <span className="stats-label">キャンセル</span>
              </div>
              <div className="stats-item">
                <span className="stats-value">{stats.noshow_count}</span>
                <span className="stats-label">無断キャンセル</span>
              </div>
            </div>
          ) : <p>統計データを読み込んでいます...</p>}
        </div>

        {/* 来店履歴 */}
        <div className="karute-card">
          <h3>来店履歴</h3>
          <div className="history-list">
            {history.length > 0 ? (
              <>
                {historyToShow.map(h => (
                  <div key={h.reservation_id} className="history-item">
                    <div className="history-item-main">
                      <span className="history-date">{new Date(h.reservation_date).toLocaleDateString()}</span>
                      <span className="history-staff">担当: {h.operators?.operator_name || 'N/A'}</span>
                    </div>
                    <div className="history-menu">{h.menus?.name || 'メニュー情報なし'}</div>
                  </div>
                ))}
                {history.length > 3 && (
                  <button onClick={() => setShowAllHistory(!showAllHistory)} className="toggle-history-btn">
                    {showAllHistory ? '閉じる' : `他 ${history.length - 3} 件をもっと見る`}
                  </button>
                )}
              </>
            ) : <p>来店履歴はありません。</p>}
          </div>
        </div>

        {/* 写真 */}
        <div className="karute-card full-width">
          <h3>写真</h3>
          <div className="photo-gallery">
             {photos.map(photo => (
              <div key={photo.id} className="photo-item" onClick={() => setSelectedPhoto(photo.photo_url)}>
                <img src={photo.photo_url} alt="カルテ写真" />
                <button 
                  onClick={(e) => { e.stopPropagation(); handleDeletePhoto(photo.id, photo.photo_url); }} 
                  className="delete-photo-btn"
                >&times;</button>
              </div>
            ))}
            <label className="upload-photo-label">
              <input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={isUploading} />
              {isUploading ? <div className="photo-spinner"></div> : <i className="fa-solid fa-camera"></i>}
            </label>
          </div>
        </div>

        {/* 希望デザインと好み */}
        <div className="karute-card full-width">
          <h3>希望デザインと好み</h3>
          <div className="form-grid">
            <div className="form-group">
              <label>好みの色</label>
              <textarea name="preferred_colors" value={formData.preferred_colors} onChange={handleInputChange} rows="3" maxLength="500"></textarea>
              <div className="char-counter">{formData.preferred_colors.length} / 500</div>
            </div>
            <div className="form-group">
              <label>デザインの傾向・好きなスタイル</label>
              <textarea name="design_preferences" value={formData.design_preferences} onChange={handleInputChange} rows="3" maxLength="500"></textarea>
              <div className="char-counter">{formData.design_preferences.length} / 500</div>
            </div>
            <div className="form-group">
              <label>避けたいデザイン</label>
              <textarea name="designs_to_avoid" value={formData.designs_to_avoid} onChange={handleInputChange} rows="3" maxLength="500"></textarea>
              <div className="char-counter">{formData.designs_to_avoid.length} / 500</div>
            </div>
          </div>
        </div>
        
        {/* ライフスタイル/趣味 */}
        <div className="karute-card full-width">
          <h3>ライフスタイル/趣味</h3>
           <div className="form-grid-lifestyle">
            <div className="form-group lifestyle-hobby-group">
              <textarea name="lifestyle_hobby" value={formData.lifestyle_hobby} onChange={handleInputChange} rows="5" placeholder="仕事の内容、頻度、趣味などをご記入ください" maxLength="500"></textarea>
              <div className="char-counter">{formData.lifestyle_hobby.length} / 500</div>
            </div>
            <div className="form-group lifestyle-notes-group">
              <label>アドバイス記録</label>
              <textarea name="lifestyle_notes" value={formData.lifestyle_notes} onChange={handleInputChange} rows="5" maxLength="500"></textarea>
              <div className="char-counter">{formData.lifestyle_notes.length} / 500</div>
            </div>
          </div>
        </div>

        {/* カウンセリング内容 */}
        <div className="karute-card full-width">
           <h3>カウンセリング内容</h3>
           <div className="form-group">
            <textarea name="counseling_notes" value={formData.counseling_notes} onChange={handleInputChange} rows="8" maxLength="500"></textarea>
            <div className="char-counter">{formData.counseling_notes.length} / 500</div>
          </div>
        </div>
      </div>
       <div className="saving-status">
        {isSaving ? '保存中...' : '保存済み'}
      </div>
    </div>
  );
};

export default CustomerDetailPage;