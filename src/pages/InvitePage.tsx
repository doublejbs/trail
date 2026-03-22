import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { JoinGroupStore } from '../stores/JoinGroupStore';
import { NavigationBar } from '../components/NavigationBar';

export const InvitePage = observer(() => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new JoinGroupStore(navigate));

  useEffect(() => {
    if (token) store.checkAndJoin(token);
  }, [store, token]);

  if (!store.sessionChecked) {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (!store.isLoggedIn) {
    return (
      <Navigate
        to={`/login?next=${encodeURIComponent(`/invite/${token}`)}`}
        replace
      />
    );
  }

  if (store.status === 'loading' || store.status === 'idle') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (store.status === 'invalid') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-neutral-500">유효하지 않은 초대 링크입니다</p>
        </div>
      </div>
    );
  }

  if (store.status === 'full') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center px-4">
          <p className="text-sm text-neutral-500">그룹이 가득 찼습니다</p>
        </div>
      </div>
    );
  }

  return null;
});
