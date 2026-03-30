interface LargeTitleProps {
  title: string;
}

export function LargeTitle({ title }: LargeTitleProps) {
  return (
    <div className="px-5 pt-4 pb-3" style={{ paddingTop: 'calc(16px + env(safe-area-inset-top))' }}>
      <h1 className="text-[26px] font-extrabold tracking-tight text-black">{title}</h1>
    </div>
  );
}
