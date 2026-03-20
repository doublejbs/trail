import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { AuthCallbackPage } from './pages/AuthCallbackPage';
import { MainLayout } from './pages/MainLayout';
import { GroupPage } from './pages/GroupPage';
import { GroupCreatePage } from './pages/GroupCreatePage';
import { GroupMapPage } from './pages/GroupMapPage';
import { GroupSettingsPage } from './pages/GroupSettingsPage';
import { HistoryPage } from './pages/HistoryPage';
import { ProfilePage } from './pages/ProfilePage';
import { InvitePage } from './pages/InvitePage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/invite/:token" element={<InvitePage />} />

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
          <Route path="group" element={<GroupPage />} />
          <Route path="group/new" element={<GroupCreatePage />} />
          <Route path="group/:id" element={<GroupMapPage />} />
          <Route path="group/:id/settings" element={<GroupSettingsPage />} />
          <Route path="history" element={<HistoryPage />} />
          <Route path="profile" element={<ProfilePage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
