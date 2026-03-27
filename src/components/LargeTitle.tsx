interface LargeTitleProps {
  title: string;
}

export function LargeTitle({ title }: LargeTitleProps) {
  return (
    <div className="px-5 pt-14 pb-3">
      <h1 className="text-[26px] font-extrabold tracking-tight text-black">{title}</h1>
    </div>
  );
}
