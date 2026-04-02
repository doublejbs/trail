import { useState, useEffect, useRef } from 'react';
import { observer } from 'mobx-react-lite';
import { LogOut, Pencil, Camera } from 'lucide-react';
import { AuthStore } from '../stores/AuthStore';
import { ProfileStore } from '../stores/ProfileStore';
import { LargeTitle } from '../components/LargeTitle';

export const ProfilePage = observer(() => {
  const [authStore] = useState(() => new AuthStore());
  const [profileStore] = useState(() => new ProfileStore());
  const [inputValue, setInputValue] = useState('');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => authStore.initialize(), [authStore]);
  useEffect(() => {
    profileStore.load().then(() => {
      setInputValue(profileStore.displayName);
    });
  }, [profileStore]);

  const handleEdit = () => {
    setEditing(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSave = async () => {
    await profileStore.save(inputValue);
    setEditing(false);
  };

  const handleCancel = () => {
    setInputValue(profileStore.displayName);
    setEditing(false);
  };

  return (
    <div className="flex h-full flex-col bg-white">
      <LargeTitle title="프로필" />

      <div className="flex flex-col gap-6 px-5 pt-2">
        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void profileStore.uploadAvatar(file);
              e.target.value = '';
            }}
          />

          {/* Avatar */}
          {profileStore.loading ? (
            <div className="skeleton w-16 h-16 rounded-full" />
          ) : (
            <button
              onClick={() => fileInputRef.current?.click()}
              aria-label="프로필 사진 변경"
              className="relative w-16 h-16 rounded-full shrink-0 active:opacity-75 transition-opacity"
            >
              {profileStore.avatarUrl ? (
                <img
                  src={profileStore.avatarUrl}
                  alt="프로필"
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div className="w-full h-full rounded-full bg-black/[0.06] flex items-center justify-center">
                  <span className="text-[24px] font-bold text-black/20">
                    {inputValue ? inputValue[0]?.toUpperCase() : '?'}
                  </span>
                </div>
              )}
              {/* Upload overlay */}
              {profileStore.uploadingAvatar ? (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <div className="w-5 h-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                </div>
              ) : (
                <div className="absolute bottom-0 right-0 w-5 h-5 rounded-full bg-black flex items-center justify-center">
                  <Camera size={10} strokeWidth={2} className="text-white" />
                </div>
              )}
            </button>
          )}
          <div className="flex-1 min-w-0">
            {profileStore.loading ? (
              <div className="flex flex-col gap-2">
                <div className="skeleton h-[18px] w-28 rounded-md" />
                <div className="skeleton h-[13px] w-40 rounded-md" />
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className="text-[17px] font-bold text-black truncate">{inputValue || '이름 없음'}</p>
                  {!editing && (
                    <button
                      onClick={handleEdit}
                      className="min-h-0 min-w-0 w-7 h-7 flex items-center justify-center rounded-full bg-black/[0.05] active:bg-black/[0.1] transition-colors"
                      aria-label="닉네임 수정"
                    >
                      <Pencil size={13} className="text-black/40" />
                    </button>
                  )}
                </div>
                <p className="text-[13px] text-black/35">{authStore.user?.email ?? ''}</p>
              </>
            )}
          </div>
        </div>

        {/* Edit nickname */}
        {editing && (
          <div className="bg-black/[0.02] rounded-2xl p-4">
            <label className="text-[13px] font-semibold text-black/50 mb-2 block">닉네임</label>
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="표시될 이름을 입력하세요"
              className="w-full bg-white border border-black/[0.08] rounded-xl px-4 py-3 text-[15px] outline-none focus:border-black/20 transition-colors placeholder:text-black/25"
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleCancel}
                className="flex-1 py-3 rounded-xl border border-black/[0.08] text-[14px] font-semibold text-black/50 active:bg-black/[0.02] transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => void handleSave()}
                disabled={profileStore.saving || !inputValue.trim()}
                className="flex-1 py-3 rounded-xl bg-black text-white font-semibold text-[14px] disabled:opacity-30 active:bg-black/80 transition-colors"
              >
                {profileStore.saving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}

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
