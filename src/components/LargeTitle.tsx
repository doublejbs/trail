interface LargeTitleProps {
  title: string;
}

export function LargeTitle({ title }: LargeTitleProps) {
  return (
    <div className="px-4 pt-5 pb-2">
      <h1 className="text-hig-title1">{title}</h1>
    </div>
  );
}
