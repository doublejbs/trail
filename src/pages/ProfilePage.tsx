import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { AuthStore } from '../stores/AuthStore';

export const ProfilePage = observer(() => {
  const [store] = useState(() => new AuthStore());

  useEffect(() => store.initialize(), [store]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white">
      <p className="text-lg font-semibold">프로필</p>
      <p className="text-sm text-neutral-400">준비 중</p>
      <Button variant="outline" onClick={() => store.signOut()}>
        로그아웃
      </Button>
    </div>
  );
});
