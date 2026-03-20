import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '../lib/supabase';
import { GroupInviteStore } from '../stores/GroupInviteStore';
import type { Group } from '../types/group';

export const GroupSettingsPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new GroupInviteStore());
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [maxInput, setMaxInput] = useState<string>('');

  useEffect(() => {
    if (!id) return;

    (async () => {
      const [{ data: userData }, { data: groupData }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from('groups').select('*').eq('id', id).single(),
      ]);

      const userId = userData?.user?.id ?? null;
      setCurrentUserId(userId);
      setGroup(groupData as Group | null ?? null);

      if (groupData && userId === (groupData as Group).created_by) {
        setMaxInput((groupData as Group).max_members?.toString() ?? '');
        store.fetchInvites(id);
        store.fetchMembers(id);
      }
    })();
  }, [id, store]);

  if (group === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="w-6 h-6 border-2 border-black border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (group === null || !id) {
    return <Navigate to="/group" replace />;
  }

  if (!currentUserId || currentUserId !== group.created_by) {
    return <Navigate to={`/group/${id}`} replace />;
  }

  const activeInvite = store.invites.find((inv) => inv.is_active);
  const inviteUrl = activeInvite
    ? `${window.location.origin}/invite/${activeInvite.token}`
    : null;

  const handleCopy = async () => {
    if (!inviteUrl) return;
    await navigator.clipboard.writeText(inviteUrl);
    toast.success('초대 링크가 복사됐습니다');
  };

  const handleSaveMax = async () => {
    const parsed = maxInput === '' ? null : parseInt(maxInput, 10);
    if (maxInput !== '' && (isNaN(parsed!) || parsed! < 1)) {
      toast.error('올바른 숫자를 입력해주세요');
      return;
    }
    await store.updateMaxMembers(id, parsed);
    if (!store.error) toast.success('저장됐습니다');
  };

  // GroupSettingsPage is rendered inside MainLayout (which shows a bottom tab bar).
  // Use `absolute inset-0` to cover the layout chrome — same pattern as GroupMapPage.
  return (
    <div className="absolute inset-0 overflow-y-auto bg-white">
      {/* Header */}
      <div className="flex items-center px-4 py-4 border-b border-neutral-200">
        <button
          onClick={() => navigate(`/group/${id}`)}
          className="text-sm text-neutral-500 mr-3"
        >
          ←
        </button>
        <h1 className="text-base font-semibold">{group.name} 설정</h1>
      </div>

      <div className="px-4 py-6 flex flex-col gap-8">
        {/* Invite Link Section */}
        <section>
          <h2 className="text-sm font-medium text-neutral-700 mb-3">초대 링크</h2>
          {inviteUrl ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-neutral-500 break-all bg-neutral-50 p-2 rounded">
                {inviteUrl}
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCopy} className="flex-1">
                  링크 복사
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-label="비활성화"
                  onClick={() => store.deactivateInvite(activeInvite!.id)}
                >
                  비활성화
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              aria-label="링크 생성"
              onClick={() => store.createInvite(id)}
            >
              링크 생성
            </Button>
          )}
        </section>

        {/* Max Members Section */}
        <section>
          <h2 className="text-sm font-medium text-neutral-700 mb-3">최대 인원</h2>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min={1}
              placeholder="제한 없음"
              value={maxInput}
              onChange={(e) => setMaxInput(e.target.value)}
              className="border border-neutral-300 rounded px-3 py-1.5 text-sm w-32"
            />
            <Button size="sm" onClick={handleSaveMax}>저장</Button>
          </div>
          <p className="text-xs text-neutral-400 mt-1">비워두면 제한 없음 (소유자 제외)</p>
        </section>

        {/* Members Section */}
        <section>
          <h2 className="text-sm font-medium text-neutral-700 mb-3">
            멤버 ({store.members.length}명)
          </h2>
          {store.members.length === 0 ? (
            <p className="text-sm text-neutral-400">아직 멤버가 없습니다</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {store.members.map((m) => (
                <li key={m.id} className="text-sm text-neutral-700 py-2 border-b border-neutral-100">
                  {m.user_id}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
});
