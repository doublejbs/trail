import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

if (Capacitor.isNativePlatform()) {
  StatusBar.setStyle({ style: Style.Light });
  StatusBar.setBackgroundColor({ color: '#ffffff' });
  SplashScreen.hide();
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
