import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  tag?: string;
}

export function PageHeader({ title, description, children, tag }: PageHeaderProps) {
  return (
    <div className="rounded-xl border border-[#e7e9e7] bg-white px-4 py-4 shadow-[0_1px_0_rgba(15,23,42,0.02)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {tag && (
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-green-100/50 px-2.5 py-1 text-[10px] font-bold tracking-wide text-green-800 uppercase">
              {tag}
            </div>
          )}
          <h1 className="font-headline text-2xl font-semibold text-neutral-900 tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-neutral-500 font-medium">
              {description}
            </p>
          )}
        </div>
        {children && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 pt-1">
            {children}
          </div>
        )}
      </div>
    </div>
  );
}
