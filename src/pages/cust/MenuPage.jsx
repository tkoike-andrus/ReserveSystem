// src/pages/cust/MenuPage.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useUser } from '../../contexts/UserContext';
import './MenuPage.css';

// ヘッダー用の戻るボタンアイコン
const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="24" height="24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
  </svg>
);

const MenuPage = () => {
  const navigate = useNavigate();
  const { profile, loading: userLoading, isRegistered } = useUser();
  const tabsContainerRef = useRef(null);

  const [menus, setMenus] = useState([]);
  const [categories, setCategories] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeCategoryId, setActiveCategoryId] = useState(null);
  const [selectedDivisionIds, setSelectedDivisionIds] = useState([]);
  
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    if (userLoading || !isRegistered) return;

    const fetchData = async () => {
      setLoading(true);
      setError('');
      try {
        const salonId = profile?.salon_customers?.[0]?.salon_id;
        if (!salonId) throw new Error("所属サロンが見つかりません。");

        const [
          { data: categoriesData, error: categoriesError },
          { data: divisionsData, error: divisionsError },
          { data: menusData, error: menusError },
        ] = await Promise.all([
          supabase.from('menu_categories')
            .select('*')
            .order('sort_order'),
          supabase.from('menu_divisions')
            .select('*')
            .order('sort_order'),
          supabase.from('menus')
            .select(`*, menu_division_associations (division_id)`)
            .eq('salon_id', salonId)
            .eq('is_active', true)
        ]);

        if (categoriesError || divisionsError || menusError) {
            throw categoriesError || divisionsError || menusError;
        }

        const visibleCategories = categoriesData.filter(cat => cat.name !== 'オフ') || [];
        setCategories(visibleCategories);
        setDivisions(divisionsData || []);
        setMenus(menusData || []);
        
        if (visibleCategories.length > 0) {
          setActiveCategoryId(visibleCategories[0].id);
        }

      } catch (err) {
        console.error('データ取得エラー:', err);
        setError(err.message || 'ページの読み込みに失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [userLoading, isRegistered, profile]);
  
  useEffect(() => {
    if (!activeCategoryId || !tabsContainerRef.current) return;
    const container = tabsContainerRef.current;
    const activeTab = container.querySelector(`[data-category-id="${activeCategoryId}"]`);
    
    if (activeTab) {
      const containerRect = container.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const scrollLeft = container.scrollLeft + (tabRect.left - containerRect.left) - (containerRect.width / 2) + (tabRect.width / 2);
      container.scrollTo({ left: scrollLeft, behavior: 'smooth' });
    }
  }, [activeCategoryId]);

  const filteredMenus = useMemo(() => {
    return menus.filter(menu => {
      const categoryMatch = menu.category_id === activeCategoryId;
      if (!categoryMatch) return false;
      if (selectedDivisionIds.length === 0) return true;
      const menuDivisionIds = new Set(menu.menu_division_associations.map(assoc => assoc.division_id));
      return selectedDivisionIds.every(id => menuDivisionIds.has(id));
    });
  }, [menus, activeCategoryId, selectedDivisionIds]);

  const totalPages = Math.ceil(filteredMenus.length / ITEMS_PER_PAGE);
  const paginatedMenus = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredMenus.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredMenus, currentPage]);
  
  const handleCategoryClick = (categoryId) => {
    setActiveCategoryId(categoryId);
    setSelectedDivisionIds([]);
    setCurrentPage(1);
  };

  const handleTagClick = (divisionId) => {
    setSelectedDivisionIds(prevIds =>
      prevIds.includes(divisionId)
        ? prevIds.filter(id => id !== divisionId)
        : [...prevIds, divisionId]
    );
    setCurrentPage(1);
  };
  
  if (userLoading || loading) {
    return <div className="menu-page-container"><p>読み込み中...</p></div>;
  }
  
  if (error) {
    return <div className="menu-page-container"><p>{error}</p></div>;
  }

  return (
    <div className="menu-page-container">
      <header className="page-header">
        <button onClick={() => navigate('/')} className="back-button">
          <BackIcon />
        </button>
      </header>
      
      <div className="menu-filters">
        <div className="category-tabs" ref={tabsContainerRef}>
          {categories.map(category => (
            <button
              key={category.id}
              className={`tab-button ${activeCategoryId === category.id ? 'active' : ''}`}
              onClick={() => handleCategoryClick(category.id)}
              data-category-id={category.id}
            >
              {category.name}
            </button>
          ))}
        </div>
        
        <div className="division-tags">
          {divisions.map(division => (
            <button
              key={division.id}
              className={`tag-button ${selectedDivisionIds.includes(division.id) ? 'selected' : ''}`}
              onClick={() => handleTagClick(division.id)}
            >
              {division.name}
            </button>
          ))}
        </div>
      </div>
      
      <div className="menu-grid">
        {paginatedMenus.length > 0 ? (
          paginatedMenus.map(menu => (
            <Link to={`/menu/${menu.id}`} key={menu.id} className="menu-card-link">
              <div className="menu-card">
                <div className="menu-image-wrapper">
                  <img src={menu.image_url || 'https://placehold.co/300x300/f8e7f1/d17a94?text=Nail'} alt={menu.name} className="menu-image" />
                </div>
                <div className="menu-info">
                  <span className="menu-name">{menu.name}</span>
                  <span className="menu-price">
                    ¥{menu.price_without_tax ? menu.price_without_tax.toLocaleString() : '-'}~
                  </span>
                </div>
              </div>
            </Link>
          ))
        ) : (
          <p className="no-menus-message">この条件に合うメニューはありません。</p>
        )}
      </div>
      
      {totalPages > 1 && (
        <div className="pagination-container">
          <button onClick={() => setCurrentPage(p => p - 1)} disabled={currentPage === 1} className="pagination-button">
            前へ
          </button>
          <span className="page-info">{currentPage} / {totalPages}</span>
          <button onClick={() => setCurrentPage(p => p + 1)} disabled={currentPage === totalPages} className="pagination-button">
            次へ
          </button>
        </div>
      )}
    </div>
  );
};

export default MenuPage;