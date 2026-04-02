import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { Copy, Link, UserMinus } from 'lucide-react';
import { NavigationBar } from '../components/NavigationBar';
import { GroupSettingsStore } from '../stores/GroupSettingsStore';

export const GroupSettingsPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new GroupSettingsStore(navigate));

  useEffect(() => {
    if (id) store.load(id);
  }, [id, store]);

  if (store.group === undefined) {
    return (
      <div className="flex h-full items-center justify-center bg-white">
        <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (store.group === null || !id) {
    return <Navigate to="/group" replace />;
  }

  if (!store.currentUserId || store.currentUserId !== store.group.created_by) {
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
    const parsed = store.maxInput === '' ? null : parseInt(store.maxInput, 10);
    if (store.maxInput !== '' && (isNaN(parsed!) || parsed! < 1)) {
      toast.error('올바른 숫자를 입력해주세요');
      return;
    }
    await store.updateMaxMembers(id, parsed);
    if (!store.error) toast.success('저장됐습니다');
  };

  return (
    <div className="absolute inset-0 overflow-y-auto bg-white">
      <NavigationBar
        title="설정"
        onBack={() => navigate(-1)}
      />

      <div className="px-5 py-6 flex flex-col gap-6">
        {/* Invite Link Section */}
        <section className="bg-black/[0.02] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Link size={16} className="text-black/40" />
            <h2 className="text-[13px] font-bold text-black/60 uppercase tracking-wide">초대 링크</h2>
          </div>
          {inviteUrl ? (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-black/40 break-all bg-white rounded-xl px-3 py-2.5 border border-black/[0.06] font-mono">
                {inviteUrl}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleCopy}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black text-white text-[13px] font-semibold active:bg-black/80 transition-colors"
                >
                  <Copy size={14} />
                  링크 복사
                </button>
                <button
                  onClick={() => store.deactivateInvite(activeInvite!.id)}
                  aria-label="비활성화"
                  className="px-4 py-2.5 rounded-xl border border-black/10 text-[13px] font-semibold text-black/50 active:bg-black/[0.03] transition-colors"
                >
                  비활성화
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => store.createInvite(id)}
              aria-label="링크 생성"
              className="w-full py-2.5 rounded-xl bg-black text-white text-[13px] font-semibold active:bg-black/80 transition-colors"
            >
              링크 생성
            </button>
          )}
        </section>

        {/* Max Members Section */}
        <section className="bg-black/[0.02] rounded-2xl p-4">
          <h2 className="text-[13px] font-bold text-black/60 uppercase tracking-wide mb-3">최대 인원</h2>
          <div className="flex gap-2 items-center">
            <input
              type="number"
              min={1}
              placeholder="제한 없음"
              value={store.maxInput}
              onChange={(e) => store.setMaxInput(e.target.value)}
              className="flex-1 bg-white border border-black/[0.08] rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-black/20 transition-colors"
            />
            <button
              onClick={handleSaveMax}
              className="px-5 py-2.5 rounded-xl bg-black text-white text-[13px] font-semibold active:bg-black/80 transition-colors"
            >
              저장
            </button>
          </div>
          <p className="text-[11px] text-black/30 mt-2">비워두면 제한 없음 (소유자 제외)</p>
        </section>

        {/* Members Section */}
        <section>
          <h2 className="text-[13px] font-bold text-black/60 uppercase tracking-wide mb-3 px-1">
            멤버 ({store.members.length}명)
          </h2>
          {store.members.length === 0 ? (
            <p className="text-[13px] text-black/30 px-1">아직 멤버가 없습니다</p>
          ) : (
            <div className="bg-black/[0.02] rounded-2xl overflow-hidden">
              {store.members.map((m, i) => (
                <div
                  key={m.id}
                  className={`flex items-center gap-3 px-4 py-3.5 ${
                    i < store.members.length - 1 ? 'border-b border-black/[0.04]' : ''
                  }`}
                >
                  <div className="w-8 h-8 rounded-full bg-black/[0.06] flex items-center justify-center">
                    <UserMinus size={14} className="text-black/25" />
                  </div>
                  <span className="text-[14px] text-black/70 font-medium truncate">{m.profiles?.display_name ?? m.user_id}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
});
