import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { Button } from '@/components/ui/button';
import { AuthStore } from '../stores/AuthStore';
import { ProfileStore } from '../stores/ProfileStore';

export const ProfilePage = observer(() => {
  const [authStore] = useState(() => new AuthStore());
  const [profileStore] = useState(() => new ProfileStore());
  const [inputValue, setInputValue] = useState('');

  useEffect(() => authStore.initialize(), [authStore]);
  useEffect(() => {
    profileStore.load().then(() => {
      setInputValue(profileStore.displayName);
    });
  }, [profileStore]);

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-white px-6">
      <p className="text-lg font-semibold">프로필</p>

      <div className="w-full max-w-xs flex flex-col gap-2">
        <label className="text-sm text-neutral-500">닉네임</label>
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="표시될 이름을 입력하세요"
          className="border border-neutral-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-neutral-500"
        />
        <Button
          onClick={() => void profileStore.save(inputValue)}
          disabled={profileStore.saving || !inputValue.trim()}
          className="w-full"
        >
          {profileStore.saving ? '저장 중...' : '저장'}
        </Button>
      </div>

      <Button variant="outline" onClick={() => authStore.signOut()}>
        로그아웃
      </Button>
    </div>
  );
});
