import { useEffect, useState } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { observer } from "mobx-react-lite";
import { JoinGroupStore } from "../stores/JoinGroupStore";
import { NavigationBar } from "../components/NavigationBar";
import { supabase } from "../lib/supabase";

function GroupThumbnail({
  path,
  bucket,
}: {
  path: string | null;
  bucket: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) return;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600)
      .then(({ data }) => {
        if (data?.signedUrl) setUrl(data.signedUrl);
      });
  }, [path, bucket]);

  if (!url) {
    return (
      <div className="w-20 h-20 rounded-2xl bg-black/[0.04] flex items-center justify-center">
        <span className="text-3xl">🏔️</span>
      </div>
    );
  }

  return (
    <img src={url} className="w-20 h-20 rounded-2xl object-cover" alt="" />
  );
}

export const InvitePage = observer(() => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [store] = useState(() => new JoinGroupStore(navigate));

  useEffect(() => {
    if (token) store.checkAndPreview(token);
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

  if (store.status === "loading" || store.status === "idle") {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (store.status === "invalid") {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-3">
          <div className="w-14 h-14 rounded-full bg-black/[0.04] flex items-center justify-center mb-2">
            <span className="text-2xl">🔗</span>
          </div>
          <p className="text-[15px] font-semibold text-black/60">
            유효하지 않은 초대 링크입니다
          </p>
          <p className="text-[13px] text-black/30">
            링크가 만료되었거나 비활성화되었습니다
          </p>
        </div>
      </div>
    );
  }

  if (store.status === "full") {
    return (
      <div className="flex flex-col h-screen bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-3">
          <div className="w-14 h-14 rounded-full bg-black/[0.04] flex items-center justify-center mb-2">
            <span className="text-2xl">👥</span>
          </div>
          <p className="text-[15px] font-semibold text-black/60">
            그룹이 가득 찼습니다
          </p>
          <p className="text-[13px] text-black/30">
            최대 인원에 도달하여 참여할 수 없습니다
          </p>
        </div>
      </div>
    );
  }

  if (store.status === "ready" && store.groupPreview) {
    const g = store.groupPreview;
    return (
      <div className="h-full flex flex-col bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex flex-col items-center justify-center px-5 gap-5">
          <GroupThumbnail path={g.thumbnail_path} bucket={g.gpx_bucket} />
          <div className="text-center">
            <p className="text-[18px] font-bold">{g.name}</p>
            <p className="text-[13px] text-black/40 mt-1">
              멤버 {g.member_count}명
              {g.max_members ? ` / ${g.max_members}명` : ""}
            </p>
          </div>
          <p className="text-[15px] text-black/50">
            이 그룹에 참가하시겠습니까?
          </p>
        </div>
        <div className="shrink-0 px-5 pb-[calc(16px+env(safe-area-inset-bottom))]">
          <button
            className="w-full h-[52px] bg-black text-white rounded-2xl text-[15px] font-semibold disabled:opacity-40"
            onClick={() => store.confirmJoin()}
            disabled={store.status !== "ready"}
          >
            참가하기
          </button>
        </div>
      </div>
    );
  }

  if (store.status === "joining") {
    return (
      <div className="h-full flex flex-col bg-white">
        <NavigationBar title="그룹 참여" onBack={() => navigate(-1)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-black/15 border-t-black rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return null;
});
