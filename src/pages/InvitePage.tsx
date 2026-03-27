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
          <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
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
          <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (store.status === 'invalid') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-3">
          <div className="w-14 h-14 rounded-full bg-black/[0.04] flex items-center justify-center mb-2">
            <span className="text-2xl">🔗</span>
          </div>
          <p className="text-[15px] font-semibold text-black/60">유효하지 않은 초대 링크입니다</p>
          <p className="text-[13px] text-black/30">링크가 만료되었거나 비활성화되었습니다</p>
        </div>
      </div>
    );
  }

  if (store.status === 'full') {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-3">
          <div className="w-14 h-14 rounded-full bg-black/[0.04] flex items-center justify-center mb-2">
            <span className="text-2xl">👥</span>
          </div>
          <p className="text-[15px] font-semibold text-black/60">그룹이 가득 찼습니다</p>
          <p className="text-[13px] text-black/30">최대 인원에 도달하여 참여할 수 없습니다</p>
        </div>
      </div>
    );
  }

  return null;
});
