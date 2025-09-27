// src/components/Layout/index.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * 顧客向けページの共通レイアウトコンポーネント。
 * ヘッダー、フッター、ナビゲーションメニューなどの共通UIを配置します。
 * <Outlet />部分に、各ページ（MyPage, MenuPageなど）のコンテンツが表示されます。
 */
const Layout = () => {
  return (
    <div className="layout-container">
      {/* 将来的に共通ヘッダーなどを追加する場合はここに記述 */}
      <main>
        <Outlet />
      </main>
      {/* 将来的に共通フッターなどを追加する場合はここに記述 */}
    </div>
  );
};

export default Layout;
