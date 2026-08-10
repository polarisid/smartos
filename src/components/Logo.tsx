type LogoProps = {
  size?: number;
  withWordmark?: boolean;
  wordmarkClassName?: string;
  className?: string;
};

export function Logo({ size = 32, withWordmark = false, wordmarkClassName = "", className = "" }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" className="shrink-0" aria-hidden="true">
        <rect x="4" y="4" width="92" height="92" rx="24" fill="#0B1420" stroke="#16243A" strokeWidth="1.5" />
        <path d="M30 52 L44 66 L72 34" stroke="#17E9B0" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="76" cy="26" r="6" fill="#4C6FFF" />
      </svg>
      {withWordmark && (
        <span className={`font-headline font-semibold tracking-tight leading-none ${wordmarkClassName}`}>
          smart<span className="text-[#17E9B0]">OS</span>
        </span>
      )}
    </span>
  );
}
