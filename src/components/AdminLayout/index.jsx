import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useUser } from '../../contexts/UserContext';
import { supabase } from '../../services/supabaseClient';
import './AdminLayout.css';

const AdminLayout = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  const { profile } = useUser();
  const navigate = useNavigate();

  const toggleSidebar = () => {
    setSidebarOpen(!isSidebarOpen);
  };

  // メニュー項目クリック時にサイドバーを閉じる関数
  const closeSidebar = () => {
    if (isSidebarOpen) {
      setSidebarOpen(false);
    }
  };
  
  const handleLogout = async () => {
    console.log("ログアウト処理を開始します...");
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        // signOut自体でエラーが発生した場合
        throw error;
      }

      //console.log("Supabaseからのサインアウトに成功しました。");
      navigate('/login'); // ログインページへ強制的に遷移

    } catch (error) {
      console.error("ログアウト中にエラーが発生しました:", error);
      // 必要に応じてユーザーにエラーを通知
      alert("ログアウトに失敗しました。");
    }
  };

  // ユーザー情報が読み込まれるまでの表示
  if (!profile) {
    return <div>読み込み中...</div>; // ここにLoadingSpinnerを置いても良い
  }

  return (
    <div className="admin-layout">
      {/* スマホ表示時の背景オーバーレイ */}
      <div
        className={`sidebar-overlay ${isSidebarOpen ? 'active' : ''}`}
        onClick={toggleSidebar}
      />

      {/* サイドバー */}
      <nav className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-logo">Re:Nail</div>
        <div className="sidebar-nav">
          <ul>
            <li>
              <NavLink to="/admin" end onClick={closeSidebar}>
                <i className="fa-solid fa-calendar-check fa-fw"></i> 予約管理
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/customers" onClick={closeSidebar}>
                <i className="fa-solid fa-address-book fa-fw"></i> 顧客カルテ
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/notifications" onClick={closeSidebar}>
                <i className="fa-solid fa-bullhorn fa-fw"></i> お知らせ管理
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/schedule" onClick={closeSidebar}>
                <i className="fa-solid fa-clock fa-fw"></i> スケジュール管理
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/menus" onClick={closeSidebar}>
                <i className="fa-solid fa-book-open fa-fw"></i> メニュー管理
              </NavLink>
            </li>
            <li>
              <NavLink to="/admin/salon" onClick={closeSidebar}>
                <i className="fa-solid fa-house-chimney fa-fw"></i> サロン情報管理
              </NavLink>
            </li>
            <li>
            {/*<li>
              <NavLink to="/admin/staff"  onClick={closeSidebar}>
                <i className="fa-solid fa-users fa-fw"></i> スタッフ管理
              </NavLink>
            </li>*/}
              <NavLink to="/admin/invite-cust" onClick={closeSidebar}>
                 <i className="fa-solid fa-envelope fa-fw"></i> お客様招待
              </NavLink>
            </li>
          </ul>
        </div>
        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-button">
            <i className="fa-solid fa-right-from-bracket fa-fw"></i>
            <span>ログアウト</span>
          </button>
        </div>
      </nav>

      {/* メインコンテンツエリア */}
      <div className="main-content">
        <header className="main-header">
          <button className={`menu-toggle ${isSidebarOpen ? 'open' : ''}`} onClick={toggleSidebar}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <div className="user-info">
            {/* <span className="salon-name">{profile.salons?.salon_name || 'サロン'}</span> */}
            <span className="operator-name">{profile.operator_name}</span>
          </div>
        </header>
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;