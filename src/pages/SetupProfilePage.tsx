import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export const SetupProfilePage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/';

  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('미인증');

      const { error } = await supabase
        .from('profiles')
        .upsert({ id: user.id, display_name: trimmed }, { onConflict: 'id' });

      if (error) throw error;

      const pendingToken = sessionStorage.getItem('pendingInviteToken');
      if (pendingToken) {
        sessionStorage.removeItem('pendingInviteToken');
        const { data: joinData } = await supabase.rpc('join_group_by_token', { p_token: pendingToken });
        if (
          joinData &&
          (joinData.status === 'joined' || joinData.status === 'already_member') &&
          joinData.group_id
        ) {
          navigate(`/group/${joinData.group_id}`, { replace: true });
          return;
        }
        navigate(`/invite/${pendingToken}`, { replace: true });
        return;
      }

      navigate(next, { replace: true });
    } catch {
      toast.error('저장에 실패했습니다');
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6">
      {/* Header */}
      <div className="mb-8 text-center anim-fade-up">
        <h1 className="text-[28px] font-extrabold tracking-tight text-black">
          닉네임을 설정해주세요
        </h1>
      </div>

      {/* Form */}
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-[320px] flex flex-col gap-3 anim-fade-up-1"
      >
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="닉네임 입력"
          maxLength={20}
          autoFocus
          className="w-full bg-white border border-black/[0.08] rounded-xl px-4 py-3.5 text-[15px] font-medium outline-none focus:border-black/20 transition-colors placeholder:text-black/25"
        />
        <button
          type="submit"
          disabled={!name.trim() || saving}
          className="w-full h-[52px] flex items-center justify-center rounded-xl bg-black text-white text-[14px] font-semibold disabled:opacity-30 active:bg-black/80 transition-colors"
        >
          {saving ? '저장 중...' : '시작하기'}
        </button>
      </form>

      <p className="text-[11px] text-black/25 mt-8 anim-fade-up-2">
        나중에 프로필에서 변경할 수 있어요
      </p>
    </div>
  );
};
