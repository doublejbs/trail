import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { Copy, Link, UserMinus, Play, Square, MapPin } from 'lucide-react';
import { NavigationBar } from '../components/NavigationBar';
import { GroupSettingsStore } from '../stores/GroupSettingsStore';
import { useSafeBack } from '../hooks/useSafeBack';

export const GroupSettingsPage = observer(() => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const safeBack = useSafeBack();
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
        onBack={safeBack}
      />

      <div className="px-5 py-6 flex flex-col gap-6">
        {/* Activity Period Section */}
        <section className="bg-black/[0.02] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            {store.isPeriodActive ? (
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            ) : (
              <div className="w-2 h-2 rounded-full bg-black/20" />
            )}
            <h2 className="text-[13px] font-bold text-black/60 uppercase tracking-wide">활동 상태</h2>
          </div>
          <p className="text-[13px] text-black/40 mb-3">
            {store.isPeriodActive ? '활동이 진행 중입니다. 멤버들이 트래킹을 시작할 수 있습니다.' : '활동이 비활성 상태입니다. 시작하면 멤버들이 트래킹할 수 있습니다.'}
          </p>
          {store.isPeriodActive ? (
            <button
              onClick={() => void store.endPeriod(id)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-black/10 text-[13px] font-semibold text-black/50 active:bg-black/[0.03] transition-colors"
            >
              <Square size={14} />
              활동 종료
            </button>
          ) : (
            <button
              onClick={() => void store.startPeriod(id)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-black text-white text-[13px] font-semibold active:bg-black/80 transition-colors"
            >
              <Play size={14} />
              활동 시작
            </button>
          )}
        </section>

        {/* Checkpoint Section */}
        <section className="bg-black/[0.02] rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <MapPin size={16} className="text-black/40" />
            <h2 className="text-[13px] font-bold text-black/60 uppercase tracking-wide">체크포인트</h2>
          </div>
          {store.checkpoints.length === 0 ? (
            <p className="text-[13px] text-black/30 mb-3">아직 체크포인트가 없습니다</p>
          ) : (
            <div className="bg-white rounded-xl border border-black/[0.06] overflow-hidden mb-3">
              {store.checkpoints.map((cp, i) => (
                <div
                  key={cp.id}
                  className={`flex items-center gap-3 px-3 py-2.5 ${
                    i < store.checkpoints.length - 1 ? 'border-b border-black/[0.04]' : ''
                  }`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    cp.is_finish
                      ? 'bg-red-500 text-white'
                      : 'bg-black/[0.06] text-black/50'
                  }`}>
                    {cp.is_finish ? 'F' : i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-black/70 truncate">{cp.name}</p>
                    <p className="text-[11px] text-black/30">반경 {cp.radius_m}m</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => navigate(`/group/${id}/checkpoints`)}
            className="w-full py-2.5 rounded-xl bg-black text-white text-[13px] font-semibold active:bg-black/80 transition-colors"
          >
            체크포인트 편집
          </button>
        </section>

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
