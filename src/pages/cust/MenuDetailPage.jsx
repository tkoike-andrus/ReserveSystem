import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import LoadingSpinner from '../../components/LoadingSpinner';
import './MenuDetailPage.css';

const MenuDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [offMenu, setOffMenu] = useState(null); // オフメニューの情報を保持
  const [withOff, setWithOff] = useState(false); // オフ選択の状態
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMenuData = async () => {
      setLoading(true);
      try {
        // メインメニューの詳細を取得
        const { data: menuData, error: menuError } = await supabase
          .from('menus')
          .select(`
            *,
            menu_categories (name),
            menu_division_associations (
              menu_divisions (name)
            )
          `)
          .eq('id', id)
          .single();

        if (menuError) throw menuError;
        if (!menuData) throw new Error('メニューが見つかりませんでした。');
        
        setMenu(menuData);

        // 同じサロンの「オフ」メニューを取得
        const { data: offData, error: offError } = await supabase
          .from('menus')
          .select('price_without_tax, duration_minutes')
          .eq('salon_id', menuData.salon_id)
          .eq('name', 'オフあり') // 'オフ' という名前のメニューを検索
          .single();
        
        if (offError && offError.code !== 'PGRST116') { // PGRST116は行が見つからないエラーなので無視
            throw offError;
        }
        setOffMenu(offData);

      } catch (err) {
        console.error('Error fetching menu details:', err);
        setError('メニュー情報の取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchMenuData();
  }, [id]);
  
  // 合計時間と価格を計算
  const { totalDuration, totalPrice } = useMemo(() => {
    if (withOff && offMenu) {
      return {
        totalDuration: menu.duration_minutes + offMenu.duration_minutes,
        totalPrice: menu.price_without_tax + offMenu.price_without_tax,
      };
    }
    return {
      totalDuration: menu?.duration_minutes,
      totalPrice: menu?.price_without_tax,
    };
  }, [menu, offMenu, withOff]);


  const handleReservation = () => {
    // 予約ページに渡す情報を更新
    const reservationMenu = {
      ...menu,
      base_price: menu.price_without_tax,
      base_duration: menu.duration_minutes,
      price_without_tax: totalPrice,
      duration_minutes: totalDuration,
      with_off: withOff,
      off_price: withOff ? offMenu?.price_without_tax : 0,
    };

    navigate('/reserve', { state: { menu: reservationMenu } });
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <div className="menu-detail-container"><p className="error-message">{error}</p></div>;
  if (!menu) return null;

  return (
    <div className="menu-detail-container">
      <header className="detail-header">
        <button onClick={() => navigate('/menus')} className="back-button-detail">
          ＜
        </button>
      </header>
      <div className="menu-image-container">
        <img src={menu.image_url || 'https://placehold.co/600x400/f8e7f1/d17a94?text=Nail'} alt={menu.name} />
      </div>

      <div className="menu-content-container">
        <div className="tags-container">
          {menu.menu_categories && <span className="tag category-tag">{menu.menu_categories.name}</span>}
          {menu.menu_division_associations.map(assoc => (
            <span key={assoc.menu_divisions.name} className="tag division-tag">
              {assoc.menu_divisions.name}
            </span>
          ))}
        </div>

        <h1>{menu.name}</h1>
        <p className="description">{menu.description || 'メニューに関する詳細な説明はありません。'}</p>
        
        {offMenu && (
          <div className="off-toggle-section">
            <div className="off-info">
              <span className="off-label">オフあり</span>
              <span className="off-details">
                +{offMenu.duration_minutes}分 / +¥{offMenu.price_without_tax.toLocaleString()}
              </span>
            </div>
            <label className="toggle-switch">
              <input type="checkbox" checked={withOff} onChange={() => setWithOff(!withOff)} />
              <span className="slider"></span>
            </label>
          </div>
        )}

        <div className="details-grid">
          <div>
            <span className="detail-label">合計時間</span>
            <p className="detail-value">{totalDuration}分</p>
          </div>
          <div>
            <span className="detail-label">合計価格（税抜）</span>
            <p className="detail-value price">¥{totalPrice.toLocaleString()}</p>
          </div>
        </div>
      </div>
      
      <div className="reservation-footer">
        <button onClick={handleReservation} className="reservation-button">
          このメニューで予約する
        </button>
      </div>
    </div>
  );
};

export default MenuDetailPage;