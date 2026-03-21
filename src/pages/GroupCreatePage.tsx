import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { observer } from 'mobx-react-lite';
import { GroupCreateStore } from '../stores/GroupCreateStore';

export const GroupCreatePage = observer(() => {
  const navigate = useNavigate();
  const [store] = useState(() => new GroupCreateStore(navigate));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    store.submit();
  };

  return (
    <div className="h-full bg-white text-black flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center px-2 py-2 border-b border-neutral-200">
        <button
          onClick={() => navigate('/group')}
          className="flex items-center justify-center w-11 h-11 rounded-full text-black active:bg-neutral-100 transition-colors"
          aria-label="뒤로"
        >
          <svg width="11" height="19" viewBox="0 0 11 19" fill="none" aria-hidden="true">
            <path d="M9.5 1.5L1.5 9.5L9.5 17.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <h1 className="flex-1 text-center text-base font-semibold">그룹 만들기</h1>
        <div className="w-11" />
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="flex flex-col flex-1 p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">그룹명</label>
            <input
              type="text"
              value={store.name}
              onChange={(e) => store.setName(e.target.value)}
              className="bg-neutral-100 text-black rounded-lg px-3 py-2 text-sm outline-none border border-neutral-200 focus:border-black"
              placeholder="그룹명을 입력하세요"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-sm text-neutral-500">GPX 파일</label>
            <label className="bg-neutral-100 rounded-lg px-3 py-2 text-sm border border-neutral-200 cursor-pointer flex items-center">
              <span className="text-neutral-500">
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
        </div>

        <div className="mt-auto pt-4">
          <button
            type="submit"
            disabled={!store.isValid || store.submitting}
            className="w-full py-2 rounded-lg bg-black text-white font-semibold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {store.submitting && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            그룹 만들기
          </button>
        </div>
      </form>
    </div>
  );
});
