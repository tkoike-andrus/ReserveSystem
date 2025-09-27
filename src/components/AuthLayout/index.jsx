// src/components/AuthLayout/index.jsx

import React, { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

// このコンポーネントが、サインアップ画面とログイン画面の親となります
const AuthLayout = () => {
  // このレイアウトが使われるすべてのページで、タイトルを'NailyBook'に設定します
  useEffect(() => {
    document.title = 'NailyBook';
  }, []);

  // <Outlet /> は、子となるページコンポーネント(AdminSignUpPageなど)を
  // ここに表示するためのプレースホルダーです。
  return <Outlet />;
};

export default AuthLayout;
