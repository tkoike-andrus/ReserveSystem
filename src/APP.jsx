import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { UserProvider, useUser } from './contexts/UserContext';

// --- 共通コンポーネント ---
import Layout from './components/Layout';
import AdminLayout from './components/AdminLayout';
import AuthLayout from './components/AuthLayout';
import LoadingSpinner from './components/LoadingSpinner';

// --- 共通ページ ---
import SignUpPage from './pages/auth/SignUpPage';
import LoginPage from './pages/auth/LoginPage';

// --- お客様向けページ ---
import MyPage from './pages/cust/MyPage';
import ReservationCalendarPage from './pages/cust/ReservationCalendarPage';
import ReservationHistoryPage from './pages/cust/ReservationHistoryPage';
import MenuPage from './pages/cust/MenuPage';
import MenuDetailPage from './pages/cust/MenuDetailPage';
import NotificationsPage from './pages/cust/NotificationsPage';
import InviteFriendPage from './pages/cust/InviteFriendPage';
import InvitationPage from './pages/cust/InvitationPage';
//import SalonSearchPage from './pages/cust/SalonSearchPage'; 
//import FavoriteSalonsPage from './pages/cust/FavoriteSalonsPage'; 

// --- 管理者向けページ ---
import EmployeeSignUpPage from './pages/auth/EmployeeSignUpPage';
import EmployeeInviteLandingPage from './pages/auth/EmployeeInviteLandingPage';
import ReservationManagementPage from './pages/admin/ReservationManagementPage';
import ScheduleManagementPage from './pages/admin/ScheduleManagementPage';
import MenuManagementPage from './pages/admin/MenuManagementPage';
import StaffManagementPage from './pages/admin/StaffManagementPage';
import InviteCustomerPage from './pages/admin/InviteCustomerPage';
import SalonManagementPage from './pages/admin/SalonManagementPage';
import NotificationManagementPage from './pages/admin/NotificationManagementPage';
import CustomerListPage from './pages/admin/CustomerListPage';
import CustomerDetailPage from './pages/admin/CustomerDetailPage';

import './App.css';

// 1. 未ログインユーザー向け（ログイン済みの場合はダッシュボードへ）
const PublicRoutes = () => {
  const { loading, profile, userType } = useUser();
  if (loading) return <LoadingSpinner />;
  return profile ? <Navigate to={userType === 'operator' ? '/admin' : '/'} replace /> : <AuthLayout />;
};

// 2. 管理者向け（未ログイン or 顧客ならログインページへ）
const AdminRoutes = () => {
  const { loading, profile, userType } = useUser();
  if (loading) return <LoadingSpinner />;
  
  if (profile && userType === 'operator') {
    // パスワード未設定の場合は、強制的に設定ページへリダイレクト
    if (profile.password_change_required) {
      return <Navigate to="/employee-signup" replace />;
    }
    return <AdminLayout />;
  }
  
  return profile && userType === 'operator' ? <AdminLayout /> : <Navigate to="/login" replace />;
};

// 3. 顧客向け（未ログイン or 運営者ならログインページへ）
const CustomerRoutes = () => {
  const { loading, profile, userType } = useUser();
  if (loading) return <LoadingSpinner />;
  return profile && userType === 'customer' ? <Layout /> : <Navigate to="/login" replace />;
};


const AppRoutes = () => (
  <Routes>
    {/* 認証ルート (未ログイン時のみアクセス可能) */}
    <Route element={<PublicRoutes />}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignUpPage />} />
      <Route path="/employee-invite-landing" element={<EmployeeInviteLandingPage />} />
    </Route>

    {/* 管理者ルート (運営者のみアクセス可能) */}
    <Route path="/admin" element={<AdminRoutes />}>
      <Route index element={<ReservationManagementPage />} />
      <Route path="schedule" element={<ScheduleManagementPage />} />
      <Route path="menus" element={<MenuManagementPage />} />
      <Route path="staff" element={<StaffManagementPage />} />
      <Route path="invite-cust" element={<InviteCustomerPage />} />
      <Route path="salon" element={<SalonManagementPage />} />
      <Route path="notifications" element={<NotificationManagementPage />} />
      <Route path="customers" element={<CustomerListPage />} />
      <Route path="customer/:customerId" element={<CustomerDetailPage />} />
    </Route>

    {/* 顧客ルート (顧客のみアクセス可能) */}
    <Route path="/" element={<CustomerRoutes />}>
      <Route index element={<MyPage />} />
      <Route path="reserve" element={<ReservationCalendarPage />} />
      <Route path="history" element={<ReservationHistoryPage />} />
      <Route path="menus" element={<MenuPage />} />
      <Route path="menu/:id" element={<MenuDetailPage />} />
      <Route path="notifications" element={<NotificationsPage />} />
      {/*<Route path="salons" element={<SalonSearchPage />} /> */}
      {/*<Route path="favorite-salons" element={<FavoriteSalonsPage />} /> */}
    </Route>
    
    {/* どのルートにも一致しない場合は、未ログインならログインページへ */}
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
);


const App = () => (
  <UserProvider>
    <Router>
      <AppRoutes />
    </Router>
  </UserProvider>
);

export default App;

