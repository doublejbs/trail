import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { toast } from 'sonner';
import { GroupCreateStore } from '../stores/GroupCreateStore';

export const GroupCreatePage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupCreateStore());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const groupId = await store.submit();
    if (groupId) {
      navigate('/group');
    } else {
      toast.error(store.error ?? '오류가 발생했습니다');
    }
  };

  return (
    <div className="h-full bg-black text-white flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-4 py-4 border-b border-neutral-800">
        <button
          onClick={() => navigate('/group')}
          className="text-white text-sm"
        >
          ← 뒤로
        </button>
        <h1 className="ml-4 text-base font-semibold">그룹 만들기</h1>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-400">그룹명</label>
          <input
            type="text"
            value={store.name}
            onChange={(e) => store.setName(e.target.value)}
            className="bg-neutral-900 text-white rounded-lg px-3 py-2 text-sm outline-none border border-neutral-700 focus:border-white"
            placeholder="그룹명을 입력하세요"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm text-neutral-400">GPX 파일</label>
          <label className="bg-neutral-900 rounded-lg px-3 py-2 text-sm border border-neutral-700 cursor-pointer flex items-center">
            <span className="text-neutral-400">
              {store.file ? store.file.name : '파일 선택'}
            </span>
            <input
              type="file"
              accept=".gpx"
              className="hidden"
              onChange={(e) => store.setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={!store.isValid || store.submitting}
          className="w-full py-2 rounded-lg bg-white text-black font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {store.submitting && (
            <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
          )}
          그룹 만들기
        </button>
      </form>
    </div>
  );
});
