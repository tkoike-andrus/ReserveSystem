// src/pages/admin/MenuManagementPage.jsx

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabase } from '../../services/supabaseClient';
import CustomAlert from '../../components/CustomAlert';
import CustomConfirm from '../../components/CustomConfirm';
import LoadingSpinner from '../../components/LoadingSpinner';
import imageCompression from 'browser-image-compression';
import Calendar from 'react-calendar';
import 'react-calendar/dist/Calendar.css';
import './MenuManagementPage.css';

// --- 説明文アコーディオン ---
const DescriptionAccordion = ({ description }) => {
  const [isOpen, setIsOpen] = useState(false);
  if (!description) return null;

  return (
    <div className="description-accordion">
      <button onClick={() => setIsOpen(!isOpen)} className="description-toggle">
        説明文
        <span className={`arrow ${isOpen ? 'up' : 'down'}`}></span>
      </button>
      {isOpen && <p className="menu-description collapsible">{description}</p>}
    </div>
  );
};

// --- 顧客向け単体プレビューモーダル ---
const SingleMenuPreviewModal = ({ menu, onClose }) => {
  if (!menu) return null;
  const isCoupon = menu.menu_categories?.name === 'クーポン';
  const discountedPrice = isCoupon && menu.discount_amount ? menu.price_without_tax - menu.discount_amount : menu.price_without_tax;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="preview-modal-content single" onClick={e => e.stopPropagation()}>
        <div className="preview-modal-header">
          <h2>プレビュー</h2>
          <button type="button" className="modal-close-button" onClick={onClose}>×</button>
        </div>
        <div className="preview-modal-body">
            <p className="preview-note">お客様がメニューを表示した際のイメージです。</p>
            <img src={menu.image_url || 'https://placehold.co/600x400/f8e7f1/d17a94?text=Nail'} alt={menu.name} className="preview-detail-image" />
            <div className="preview-detail-content">
                <h2>{menu.name}</h2>
                <div className="preview-division-badges">
                  {menu.menu_divisions && menu.menu_divisions.length > 0 ? (
                    menu.menu_divisions.map(div => <span key={div.id} className="division-badge">{div.name}</span>)
                  ) : null}
                </div>
                <p className="preview-description">{menu.description}</p>
                {isCoupon && (
                  <div className="coupon-info-preview">
                    <p><strong>割引額:</strong> ¥{menu.discount_amount?.toLocaleString()} OFF</p>
                    <p><strong>有効期間:</strong> {menu.valid_from} ~ {menu.valid_until}</p>
                  </div>
                )}
                <div className="preview-price-display">
                    <span>施術時間: {menu.duration_minutes}分</span>
                    <div className="price-values">
                      {isCoupon && menu.discount_amount && (
                        <span className="original-price">
                          ¥{menu.price_without_tax.toLocaleString()}
                        </span>
                      )}
                      <strong className="final-price">
                        ¥{discountedPrice.toLocaleString()}
                      </strong>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

// メニューカードコンポーネント (UI修正版)
const MenuCard = ({ menu, onEdit, onDelete, onPreview, isOffMenu = false }) => {
  const isCoupon = menu.menu_categories?.name === 'クーポン';

  return (
    <div className={`menu-card ${!menu.is_active ? 'inactive' : ''}`}>
      {!isOffMenu && (
        <img 
          src={menu.image_url ? `${menu.image_url}?width=400&quality=80` : 'https://placehold.co/600x400/eee/ccc?text=No+Image'} 
          alt={menu.name} 
          className="menu-card-image" 
        />
      )}
      <div className="menu-card-body">
        <div className="menu-card-title-wrapper">
          <h3 className="menu-card-title">{menu.name}</h3>
          {!isOffMenu && (
            <span className={`status-badge ${menu.is_active ? 'active' : 'inactive'}`}>
              {menu.is_active ? '公開中' : '非公開'}
            </span>
          )}
        </div>
        
        {!isOffMenu && (
          <div className="menu-card-info-item">
            <div className="info-value-row">
                <div className="division-badges">
                  {menu.menu_divisions && menu.menu_divisions.length > 0 ? (
                    menu.menu_divisions.map(div => <span key={div.id} className="division-badge">{div.name}</span>)
                  ) : (
                    <span>未分類</span>
                  )}
                </div>
            </div>
          </div>
        )}

        <div className="menu-card-info-item">
          <span className="info-label">価格 (税抜)</span>
          <span>¥{menu.price_without_tax.toLocaleString()}</span>
        </div>
        <div className="menu-card-info-item">
          <span className="info-label">施術時間</span>
          <span>{menu.duration_minutes} 分</span>
        </div>

        {isCoupon && (
          <>
            <div className="menu-card-info-item coupon-info">
              <span className="info-label">割引額</span>
              <span>¥{menu.discount_amount?.toLocaleString()} OFF</span>
            </div>
            <div className="menu-card-info-item coupon-info">
              <span className="info-label">有効期間</span>
              <span>{menu.valid_from} ~ {menu.valid_until}</span>
            </div>
          </>
        )}

        {!isOffMenu && (
          <div className="menu-card-info-item">
            <DescriptionAccordion description={menu.description} />
          </div>
        )}
      </div>
      <div className="menu-card-footer">
        {!isOffMenu && (
          <button onClick={() => onPreview(menu)} className="card-action-btn btn-preview">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            <span>確認</span>
          </button>
        )}
        <button onClick={() => onEdit(menu)} className="card-action-btn btn-edit">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
          <span>{isOffMenu ? '価格・施術時間を編集' : '編集'}</span>
        </button>
        {!isOffMenu && (
          <button onClick={() => onDelete(menu)} className="card-action-btn btn-delete">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>
            <span>削除</span>
          </button>
        )}
      </div>
    </div>
  );
};

// --- メニュー編集・追加用のモーダルコンポーネント---
const MenuFormModal = ({ menu, categories, divisions, onSave, onCancel, setAlertInfo }) => {
  const [formData, setFormData] = useState({
    name: '',
    category_id: '',
    price_without_tax: '',
    description: '',
    is_active: true,
    image_url: null,
    discount_amount: null,
    valid_from: null,
    valid_until: null,
  });
  const [selectedDivisions, setSelectedDivisions] = useState([]);
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  // --- Calendar State ---
  const [showCalendar, setShowCalendar] = useState(false);
  const [dateRange, setDateRange] = useState([null, null]);
  const calendarRef = useRef(null);

  useEffect(() => {
    const initialData = {
      name: '',
      category_id: categories.length > 0 ? categories[0].id : '',
      price_without_tax: '',
      description: '',
      is_active: true,
      image_url: null,
      discount_amount: null,
      valid_from: null,
      valid_until: null,
    };

    if (menu) {
      setFormData({ ...initialData, ...menu });
      setSelectedDivisions(menu.menu_divisions ? menu.menu_divisions.map(d => d.id) : []);
      if (menu.image_url) setImagePreview(menu.image_url);
      setHours(Math.floor((menu.duration_minutes || 0) / 60));
      setMinutes((menu.duration_minutes || 0) % 60);
      if(menu.valid_from && menu.valid_until) {
        setDateRange([new Date(menu.valid_from), new Date(menu.valid_until)]);
      }
    } else {
      setFormData(initialData);
      setSelectedDivisions([]);
      setHours(0);
      setMinutes(0);
      setDateRange([null, null]);
    }
  }, [menu, categories, divisions]);

  const isOffCategorySelected = useMemo(() => categories.find(cat => cat.id === formData.category_id)?.name === 'オフ', [formData.category_id, categories]);
  const isSpecialCategorySelected = useMemo(() => categories.find(cat => cat.id === formData.category_id)?.name === 'イベント', [formData.category_id, categories]);
  const isCourseCategorySelected = useMemo(() => categories.find(cat => cat.id === formData.category_id)?.name === 'コース', [formData.category_id, categories]);
  const isCouponCategorySelected = useMemo(() => categories.find(cat => cat.id === formData.category_id)?.name === 'クーポン', [formData.category_id, categories]);

  useEffect(() => {
    if (isOffCategorySelected) {
      setFormData(prev => ({ ...prev, name: menu && menu.id ? prev.name : '', is_active: true }));
      setSelectedDivisions([]);
    }
  }, [isOffCategorySelected, menu]);

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => { setImagePreview(reader.result); };
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
  };

  const handleDivisionChange = (divisionId) => {
    setSelectedDivisions(prev =>
      prev.includes(divisionId)
        ? prev.filter(id => id !== divisionId)
        : [...prev, divisionId]
    );
  };

  const handleDateChange = (newDateRange) => {
    setDateRange(newDateRange);
    const [start, end] = newDateRange;
    // YYYY-MM-DD形式に変換
    const formatDate = (date) => date ? date.toISOString().split('T')[0] : null;
    setFormData(prev => ({
      ...prev,
      valid_from: formatDate(start),
      valid_until: formatDate(end),
    }));
    setShowCalendar(false); // 日付を選択したらカレンダーを閉じる
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const duration_minutes = parseInt(hours, 10) * 60 + parseInt(minutes, 10);

    let dataToSave = { ...formData, id: menu ? menu.id : null, duration_minutes };
    
    // クーポンカテゴリでない場合は、クーポン関連の値をnullにする
    if (!isCouponCategorySelected) {
      dataToSave.discount_amount = null;
      dataToSave.valid_from = null;
      dataToSave.valid_until = null;
    }

    if (duration_minutes <= 0) {
      setAlertInfo({ show: true, message: '施術時間は0分で登録できません。', type: 'error' });
      return;
    }
    setIsUploading(true);
    await onSave({ ...formData, id: menu ? menu.id : null, duration_minutes }, imageFile, selectedDivisions);
    setIsUploading(false);
  };

  let formFields;
  if (isOffCategorySelected) {
    formFields = (
      <>
        <div className="form-group">
          <label>メニュー名</label>
          <select name="name" value={formData.name || ''} onChange={handleChange} required>
            <option value="" disabled>選択してください</option>
            <option value="オフあり">オフあり</option>
            <option value="オフのみ">オフのみ</option>
          </select>
        </div>
        <div className="form-group">
          <label>税抜き価格 (円)</label>
          <input type="number" name="price_without_tax" value={formData.price_without_tax || ''} onChange={handleChange} required />
        </div>
        {isCouponCategorySelected && (
          <>
            <div className="form-group">
              <label>値引き額 (円)</label>
              <input type="number" name="discount_amount" value={formData.discount_amount || ''} onChange={handleChange} required />
            </div>
          </>
        )}

        <div className="form-group">
          <label>施術時間</label>
          <div className="duration-selector">
            <select value={hours} onChange={(e) => setHours(e.target.value)}>
              {[...Array(6).keys()].map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span>時間</span>
            <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              {[0, 10, 20, 30, 40, 50].map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
            </select>
            <span>分</span>
          </div>
        </div>
      </>
    );
  } else {
    formFields = (
      <>
        <div className="form-group">
          <label>メニュー画像</label>
          <div className="image-upload-container">
            <input type="file" id="imageUpload" onChange={handleImageChange} accept="image/*" />
            <label htmlFor="imageUpload" className="image-upload-label">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="image-preview" />
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
        </div>
        <div className="form-group">
          <label>メニュー名</label>
          <input type="text" name="name" value={formData.name || ''} onChange={handleChange} placeholder="例: 定額デザインA" required />
        </div>
        <div className="form-group description-group">
          <label>説明文</label>
          <textarea name="description" value={formData.description || ''} onChange={handleChange} maxLength="200" placeholder="メニューの説明を200文字以内で入力" rows="4" />
          <div className="char-counter">{(formData.description || '').length} / 200</div>
        </div>
        <div className="form-group">
          <label>税抜き価格 (円)</label>
          <input type="number" name="price_without_tax" value={formData.price_without_tax || ''} onChange={handleChange} required />
        </div>

        {isCouponCategorySelected && (
          <>
            <div className="form-group">
              <label>割引額 (円)</label>
              <input type="number" name="discount_amount" value={formData.discount_amount || ''} onChange={handleChange} placeholder="割引額を入力してください。" required />
            </div>
          </>
        )}

        <div className="form-group">
          <label>施術時間</label>
          <div className="duration-selector">
            <select value={hours} onChange={(e) => setHours(e.target.value)}>
              {[...Array(6).keys()].map(h => <option key={h} value={h}>{h}</option>)}
            </select>
            <span>時間</span>
            <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
              {[0, 10, 20, 30, 40, 50].map(m => <option key={m} value={m}>{String(m).padStart(2, '0')}</option>)}
            </select>
            <span>分</span>
          </div>
        </div>
        <div className="form-group toggle-group">
          <label>メニュー表示</label>
          <label className="toggle-switch">
            <input type="checkbox" name="is_active" checked={formData.is_active} onChange={handleChange} />
            <span className="slider"></span>
          </label>
        </div>
      </>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <button type="button" className="modal-close-button" onClick={onCancel}>×</button>
        <form onSubmit={handleSubmit}>
          <h2>{menu && menu.id ? 'メニューを編集' : '新しいメニューを追加'}</h2>
          <div className="form-group">
            <label>カテゴリ</label>
            <div className="category-selector">
              {categories.map(cat => (
                <label key={cat.id} className={`category-option ${formData.category_id === cat.id ? 'selected' : ''}`}>
                  <input type="radio" name="category_id" value={cat.id} checked={formData.category_id === cat.id} onChange={handleChange} />
                  {cat.name}
                </label>
              ))}
            </div>
            {isSpecialCategorySelected && <p className="form-note">結婚式、成人式、パーティーなどイベントに合わせたものを設定します。</p>}
            {isCourseCategorySelected && <p className="form-note">ケアやオフ込みなど、複数のオプションメニューを一つのパッケージにまとめたメニューを設定します。</p>}
            {isCouponCategorySelected && <p className="form-note">季節限定や期間限定など、一時的に割引してお客様を呼び込むための施策を設定します。</p>}
            {isOffCategorySelected && <p className="form-note">"オフあり"や"オフのみ"を選んだお客様に金額を表示するために設定します。</p>}
          </div>
          
          {!isOffCategorySelected && (
            <div className="form-group">
              <label>区分 (複数選択可)</label>
              <div className="division-checkbox-group">
                {divisions.map(div => (
                  <label key={div.id} className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedDivisions.includes(div.id)}
                      onChange={() => handleDivisionChange(div.id)}
                    />
                    <span>{div.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
          
          {isCouponCategorySelected && (
            <div className="form-group">
              <label>有効期間</label>
              <div className="date-range-picker">
                <div className="date-input-display" onClick={() => setShowCalendar(!showCalendar)}>
                  <span>{formData.valid_from || '開始日'}</span>
                  <span>〜</span>
                  <span>{formData.valid_until || '終了日'}</span>
                </div>
                {showCalendar && (
                  <div className="calendar-container" ref={calendarRef}>
                    <Calendar
                      onChange={handleDateChange}
                      value={dateRange}
                      selectRange={true}
                      locale="ja-JP"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          {formFields}
          
          <div className="form-actions">
            <button type="submit" className="save-button" disabled={isUploading}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              <span>{isUploading ? '保存中...' : '保存する'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- MenuManagementPage 本体 
const MenuManagementPage = () => {
  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [alertInfo, setAlertInfo] = useState({ show: false, message: '' });
  const [confirmInfo, setConfirmInfo] = useState({ show: false, message: '', onConfirm: null });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState(null);
  const [previewingMenu, setPreviewingMenu] = useState(null);
  const [salonId, setSalonId] = useState(null);

  const touchStart = useRef({ x: 0, y: 0 });
  const [isSwiping, setIsSwiping] = useState(false);
  const tabsContainerRef = useRef(null);
  const [showScrollIndicators, setShowScrollIndicators] = useState({ left: false, right: false });

  const [offCategoryId, setOffCategoryId] = useState(null);

  const offMenus = useMemo(() => {
    const offAri = menus.find(m => m.name === 'オフあり');
    const offNomi = menus.find(m => m.name === 'オフのみ');
    return { offAri, offNomi };
  }, [menus]);

  const isOffCategoryActive = useMemo(() => {
    return activeCategoryId === offCategoryId;
  }, [activeCategoryId, offCategoryId]);

  const fetchData = useCallback(async (currentSalonId) => {
    if (!currentSalonId) return;
    try {
      const categoriesPromise = supabase.from('menu_categories').select('*').order('sort_order');
      const divisionsPromise = supabase.from('menu_divisions').select('*').order('sort_order');
      const menusPromise = supabase.from('menus')
        .select('*, menu_categories(name), menu_divisions!menu_division_associations(id, name)')
        .eq('salon_id', currentSalonId)
        .order('created_at', { ascending: false });

      const [{ data: categoriesData, error: catError }, { data: divisionsData, error: divError }, { data: menusData, error: menusError }] = await Promise.all([categoriesPromise, divisionsPromise, menusPromise]);

      if (catError || divError || menusError) throw catError || divError || menusError;
      
      setCategories(categoriesData || []);
      setDivisions(divisionsData || []);
      setMenus(menusData || []);
      
      const offCategory = categoriesData.find(cat => cat.name === 'オフ');
      if (offCategory) setOffCategoryId(offCategory.id);
      
      if (activeCategoryId === null && categoriesData && categoriesData.length > 0) {
        setActiveCategoryId(categoriesData[0].id);
      }
    } catch (err) {
      setError('データの取得に失敗しました。');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [activeCategoryId]);

  useEffect(() => {
    const getSalonAndFetchData = async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("ユーザーが認証されていません。");

        const { data: operator, error: operatorError } = await supabase
          .from('operators')
          .select('salon_id')
          .eq('operator_id', user.id)
          .single();

        if (operatorError) throw operatorError;
        if (!operator?.salon_id) throw new Error("サロンIDが見つかりません。");
        
        setSalonId(operator.salon_id);
      } catch (err) {
        setError('初期化に失敗しました: ' + err.message);
        setLoading(false);
      }
    };
    getSalonAndFetchData();
  }, []);

  useEffect(() => {
    if (salonId) {
      fetchData(salonId);
    }
  }, [salonId, fetchData]);

  const checkScrollIndicators = useCallback(() => {
    const el = tabsContainerRef.current;
    if (!el) return;
    const showLeft = el.scrollLeft > 0;
    const showRight = el.scrollWidth > el.clientWidth + el.scrollLeft + 1;
    setShowScrollIndicators({ left: showLeft, right: showRight });
  }, []);

  useEffect(() => {
    const el = tabsContainerRef.current;
    if (el) {
        checkScrollIndicators();
        el.addEventListener('scroll', checkScrollIndicators);
        window.addEventListener('resize', checkScrollIndicators);
        return () => {
            el.removeEventListener('scroll', checkScrollIndicators);
            window.removeEventListener('resize', checkScrollIndicators);
        };
    }
  }, [categories, checkScrollIndicators]);

  useEffect(() => {
    if (tabsContainerRef.current && activeCategoryId) {
      const activeButton = tabsContainerRef.current.querySelector(`[data-id="${activeCategoryId}"]`);
      if (activeButton) {
        // scrollIntoViewを使用して、選択したタブがコンテナの中央に来るようにします。
        activeButton.scrollIntoView({
          behavior: 'smooth', // スムーズなスクロール
          inline: 'center',  // 水平方向の中央揃え
          block: 'nearest',  // 垂直方向の位置は最も近い位置に
        });
      }
    }
  }, [activeCategoryId]);
  
  const handleCategoryChange = (newCategoryId) => {
    if (newCategoryId === activeCategoryId) return;

    setIsSwiping(true);
    setTimeout(() => {
      setActiveCategoryId(newCategoryId);
      setIsSwiping(false);
    }, 300);
  };

  const handleAddNewMenu = () => {
    setEditingMenu({ category_id: activeCategoryId });
    setIsModalOpen(true);
  };

  const handleAddNewOffMenu = (menuName) => {
    setEditingMenu({
      name: menuName,
      category_id: offCategoryId,
      price_without_tax: 0,
      duration_minutes: 0,
    });
    setIsModalOpen(true);
  };

  const handleEditMenu = (menu) => {
    setEditingMenu(menu);
    setIsModalOpen(true);
  };
  
  const handleSaveMenu = async (menuData, imageFile, selectedDivisionIds) => {
    if (!salonId) {
      setAlertInfo({ show: true, message: 'サロン情報が見つかりません。', type: 'error' });
      return;
    }
    try {
      delete menuData.menu_divisions;
      delete menuData.menu_division_associations;
      const { id, ...updateData } = menuData;
      updateData.salon_id = salonId;
      
      if (imageFile) {
        const options = {
          maxSizeMB: 0.5,
          maxWidthOrHeight: 800,
          useWebWorker: true,
        };
        const compressedFile = await imageCompression(imageFile, options);
        const fileName = `${salonId}/${Date.now()}_${compressedFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from('menu-images')
          .upload(fileName, compressedFile, { upsert: true });
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('menu-images')
          .getPublicUrl(fileName);
        updateData.image_url = urlData.publicUrl;
      }

      delete updateData.menu_categories;
      updateData.price_without_tax = parseInt(updateData.price_without_tax, 10);
      
      let savedMenu;
      if (id) {
        const { data, error } = await supabase.from('menus').update(updateData).eq('id', id).select().single();
        if (error) throw error;
        savedMenu = data;
      } else {
        const { data, error } = await supabase.from('menus').insert([updateData]).select().single();
        if (error) throw error;
        savedMenu = data;
      }
      
      // --- 区分(Division)の保存処理 ---
      // 1. 既存の関連付けを全て削除
      const { error: deleteError } = await supabase
        .from('menu_division_associations')
        .delete()
        .eq('menu_id', savedMenu.id);
      if (deleteError) throw deleteError;

      // 2. 新しい関連付けを挿入
      if (selectedDivisionIds && selectedDivisionIds.length > 0) {
        const associations = selectedDivisionIds.map(divisionId => ({
          menu_id: savedMenu.id,
          division_id: divisionId
        }));
        const { error: insertError } = await supabase
          .from('menu_division_associations')
          .insert(associations);
        if (insertError) throw insertError;
      }

      setAlertInfo({ show: true, message: 'メニューを保存しました。', type: 'success' });
      setIsModalOpen(false);
      setActiveCategoryId(updateData.category_id);
      await fetchData(salonId);

    } catch (err) {
      setAlertInfo({ show: true, message: '保存に失敗しました。', type: 'error' });
      console.error(err);
    }
  };

  const handleDeleteMenu = (menu) => {
    setConfirmInfo({
      show: true,
      message: `「${menu.name}」を削除しますか？`,
      onConfirm: () => executeDelete(menu.id),
    });
  };

  const executeDelete = async (id) => {
    try {
      const { error } = await supabase.from('menus').delete().eq('id', id).eq('salon_id', salonId);
      if (error) throw error;
      setAlertInfo({ show: true, message: 'メニューを削除しました。', type: 'success' });
      await fetchData(salonId);
    } catch (err) {
      setAlertInfo({ show: true, message: '削除に失敗しました。', type: 'error' });
      console.error(err);
    }
  };

  const handleTouchStart = (e) => {
    touchStart.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
  };

  const handleTouchEnd = (e) => {
    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const swipeDistanceX = touchEndX - touchStart.current.x;
    const swipeDistanceY = touchEndY - touchStart.current.y;
    const swipeThreshold = 50;

    if (Math.abs(swipeDistanceX) > swipeThreshold && Math.abs(swipeDistanceX) > Math.abs(swipeDistanceY)) {
      const currentIndex = categories.findIndex(c => c.id === activeCategoryId);
      let nextIndex = currentIndex;

      if (swipeDistanceX < 0 && currentIndex < categories.length - 1) {
        nextIndex = currentIndex + 1;
      } else if (swipeDistanceX > 0 && currentIndex > 0) {
        nextIndex = currentIndex - 1;
      }
      
      if (nextIndex !== currentIndex) {
        handleCategoryChange(categories[nextIndex].id);
      }
    }
  };
  
  const filteredMenus = menus.filter(menu => menu.category_id === activeCategoryId);

  if (loading) return <div className="loading-overlay-swipe"><LoadingSpinner /></div>;
  if (error) return <p className="error-message">{error}</p>;

  return (
    <div className="menu-management-page">
      {alertInfo.show && <CustomAlert message={alertInfo.message} onClose={() => setAlertInfo({ show: false, message: '' })} />}
      {confirmInfo.show && <CustomConfirm message={confirmInfo.message} onConfirm={() => { confirmInfo.onConfirm(); setConfirmInfo({ show: false, message: '', onConfirm: null }); }} onCancel={() => setConfirmInfo({ show: false, message: '', onConfirm: null })} />}
      {isModalOpen && <MenuFormModal menu={editingMenu} categories={categories} divisions={divisions} onSave={handleSaveMenu} onCancel={() => setIsModalOpen(false)} setAlertInfo={setAlertInfo} />}
      {previewingMenu && <SingleMenuPreviewModal menu={previewingMenu} onClose={() => setPreviewingMenu(null)} />}
      
      <button onClick={handleAddNewMenu} className="add-new-button">+ 新規メニューを登録</button>
      <div className="tabs-wrapper">
        <div className="category-tabs-container" ref={tabsContainerRef}>
          <div className="category-tabs">
            {categories.map(cat => (
              <button
                key={cat.id}
                data-id={cat.id}
                className={`tab-button ${activeCategoryId === cat.id ? 'active' : ''}`}
                onClick={() => handleCategoryChange(cat.id)}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
        {showScrollIndicators.left && (
          <div className="scroll-indicator left">
            <span>&lt;</span>
          </div>
        )}
        {showScrollIndicators.right && (
          <div className="scroll-indicator right">
            <span>&gt;</span>
          </div>
        )}
      </div>


      <div 
        className="menu-list-container"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isSwiping && (
          <div className="loading-overlay-swipe">
            <LoadingSpinner />
          </div>
        )}
        <div className={`menu-list ${isSwiping ? 'swiping' : ''}`}>
          {isOffCategoryActive ? (
            <>
              {offMenus.offAri ? (
                <MenuCard menu={offMenus.offAri} onEdit={handleEditMenu} isOffMenu={true} onPreview={setPreviewingMenu}/>
              ) : (
                <button className="add-off-menu-button" onClick={() => handleAddNewOffMenu('オフあり')}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="plus-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>「オフあり」を登録</span>
                </button>
              )}
              {offMenus.offNomi ? (
                <MenuCard menu={offMenus.offNomi} onEdit={handleEditMenu} isOffMenu={true} onPreview={setPreviewingMenu}/>
              ) : (
                <button className="add-off-menu-button" onClick={() => handleAddNewOffMenu('オフのみ')}>
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="plus-icon">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  <span>「オフのみ」を登録</span>
                </button>
              )}
            </>
          ) : (
            filteredMenus.length > 0 ? (
              filteredMenus.map(menu => (
                 <MenuCard key={menu.id} menu={menu} onEdit={handleEditMenu} onDelete={handleDeleteMenu} onPreview={setPreviewingMenu} />
              ))
            ) : (
              <p className="no-menu-message">このカテゴリにはメニューが<br />登録されていません。</p>
            )
          )}
        </div>
      </div>
    </div>
  );
};

export default MenuManagementPage;
