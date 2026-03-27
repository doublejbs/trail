import { useState, useEffect } from 'react';
import { observer } from 'mobx-react-lite';
import { LogOut } from 'lucide-react';
import { AuthStore } from '../stores/AuthStore';
import { ProfileStore } from '../stores/ProfileStore';
import { LargeTitle } from '../components/LargeTitle';

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
    <div className="flex h-full flex-col bg-white">
      <LargeTitle title="프로필" />

      <div className="flex flex-col gap-6 px-5 pt-2">
        {/* Avatar placeholder */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-black/[0.06] flex items-center justify-center">
            <span className="text-[24px] font-bold text-black/20">
              {inputValue ? inputValue[0]?.toUpperCase() : '?'}
            </span>
          </div>
          <div>
            <p className="text-[17px] font-bold text-black">{inputValue || '이름 없음'}</p>
            <p className="text-[13px] text-black/35">{authStore.user?.email ?? ''}</p>
          </div>
        </div>

        {/* Name input */}
        <div className="bg-black/[0.02] rounded-2xl p-4">
          <label className="text-[13px] font-semibold text-black/50 mb-2 block">닉네임</label>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="표시될 이름을 입력하세요"
            className="w-full bg-white border border-black/[0.08] rounded-xl px-4 py-3 text-[15px] outline-none focus:border-black/20 transition-colors placeholder:text-black/25"
          />
          <button
            onClick={() => void profileStore.save(inputValue)}
            disabled={profileStore.saving || !inputValue.trim()}
            className="w-full mt-3 py-3 rounded-xl bg-black text-white font-semibold text-[14px] disabled:opacity-30 active:bg-black/80 transition-colors"
          >
            {profileStore.saving ? '저장 중...' : '저장'}
          </button>
        </div>

        {/* Logout */}
        <button
          onClick={() => authStore.signOut()}
          className="flex items-center justify-center gap-2 py-3 rounded-xl border border-black/[0.08] text-[14px] font-semibold text-black/50 active:bg-black/[0.02] transition-colors"
        >
          <LogOut size={16} />
          로그아웃
        </button>
      </div>
    </div>
  );
});
