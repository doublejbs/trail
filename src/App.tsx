import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from './lib/supabase';

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light });
  StatusBar.setBackgroundColor({ color: '#ffffff' });
  SplashScreen.hide();

  // OAuth 딥링크 리스너: 외부 브라우저에서 앱으로 돌아올 때 URL을 Supabase에 전달
  CapApp.addListener('appUrlOpen', ({ url }: { url: string }) => {
    if (url.includes('auth/callback') || url.includes('com.trail.app://auth/callback')) {
      Browser.close();
      const parsed = new URL(url);
      const code = parsed.searchParams.get('code');
      if (code) {
        supabase.auth.exchangeCodeForSession(code).then(() => {
          window.location.href = '/auth/callback';
        });
      }
    }
  });
}

import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { MainLayout } from './pages/MainLayout';
import { GroupPage } from './pages/GroupPage';
import { GroupCreatePage } from './pages/GroupCreatePage';
import { GroupMapPage } from './pages/GroupMapPage';
import { GroupSettingsPage } from './pages/GroupSettingsPage';
import { CoursePage } from './pages/CoursePage';
import { CourseUploadPage } from './pages/CourseUploadPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { MyGroupsPage } from './pages/MyGroupsPage';
import { ProfilePage } from './pages/ProfilePage';
import { HistoryPage } from './pages/HistoryPage';
import { InvitePage } from './pages/InvitePage';
import { SetupProfilePage } from './pages/SetupProfilePage';
import { CheckpointEditPage } from './pages/CheckpointEditPage';

const App = () => {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/setup-profile" element={<SetupProfilePage />} />

        {/* Protected routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <MainLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/group" replace />} />
          <Route path="my" element={<MyGroupsPage />} />
          <Route path="group" element={<GroupPage />} />
          <Route path="group/new" element={<GroupCreatePage />} />
          <Route path="group/:id" element={<GroupMapPage />} />
          <Route path="group/:id/settings" element={<GroupSettingsPage />} />
          <Route path="group/:id/checkpoints" element={<CheckpointEditPage />} />
          <Route path="course" element={<CoursePage />} />
          <Route path="course/new" element={<CourseUploadPage />} />
          <Route path="course/:id" element={<CourseDetailPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
};

export default App;
