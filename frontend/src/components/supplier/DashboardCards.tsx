import { ReactNode } from "react";

export function StatCard({
  title,
  value,
  description,
  accentColor,
  icon,
  bottomRightText,
  bottomRightTextColor,
}: {
  title: string;
  value: string | number;
  description: ReactNode;
  accentColor: "red" | "green" | "dark-green";
  icon: ReactNode;
  bottomRightText?: string;
  bottomRightTextColor?: string;
}) {
  const borderColors = {
    red: "border-l-red-600",
    green: "border-l-teal-500",
    "dark-green": "border-l-primary-900",
  };

  const iconBgs = {
    red: "bg-red-50 text-red-600",
    green: "bg-teal-50 text-teal-700",
    "dark-green": "bg-green-50 text-primary-900",
  };

  return (
    <div className={`bg-white rounded-xl shadow-sm border border-neutral-100 border-l-[4px] p-5 flex flex-col justify-between h-full ${borderColors[accentColor]}`}>
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-xs font-bold tracking-wider text-neutral-500 uppercase">{title}</h3>
          <p className="mt-3 text-5xl font-headline font-bold text-neutral-900">{value}</p>
        </div>
        <div className={`p-2 rounded-lg ${iconBgs[accentColor]}`}>
          {icon}
        </div>
      </div>
      <div className="mt-6 text-[13px] font-medium text-neutral-500 flex justify-between items-end gap-2">
        <span className="leading-snug">{description}</span>
        {bottomRightText && (
          <span className={`font-semibold shrink-0 ${bottomRightTextColor || "text-neutral-500"}`}>
            {bottomRightText}
          </span>
        )}
      </div>
    </div>
  );
}

export function TaskCard({
  title,
  subtitle,
  description,
  pill,
  button,
}: {
  title: string;
  subtitle?: string;
  description: ReactNode;
  pill?: ReactNode;
  button?: ReactNode;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-neutral-100 p-5 hover:shadow-md transition-shadow">
      <div className="flex gap-3 mb-2">
        {pill}
        {subtitle && <span className="text-[10px] text-neutral-400 font-serif tracking-wide uppercase pt-0.5">{subtitle}</span>}
      </div>
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start">
        <div className="flex-1">
          <h4 className="font-bold text-lg text-neutral-900 leading-snug">{title}</h4>
          <p className="mt-1 text-sm text-neutral-500 leading-relaxed max-w-lg">{description}</p>
        </div>
        {button && (
          <div className="shrink-0 mt-2 sm:mt-0">
            {button}
          </div>
        )}
      </div>
    </div>
  );
}

export function SectionHeading({ title, dotColor, rightText, rightNode }: { title: string; dotColor?: string; rightText?: string; rightNode?: ReactNode }) {
  return (
    <div className="flex items-end justify-between mb-5 mt-10 first:mt-0">
      <div className="flex items-center gap-2.5">
        {dotColor && <span className={`block h-3 w-3 rounded-full ${dotColor}`} />}
        <h2 className="text-2xl font-bold text-neutral-900 font-headline leading-none">{title}</h2>
      </div>
      {rightText && <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wide">{rightText}</span>}
      {rightNode && rightNode}
    </div>
  );
}
