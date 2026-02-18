/**
 * AgentLedger Logo — Activity Heartbeat (Concept 6)
 * ECG-style monitoring line inside a gradient rounded square.
 */
export function Logo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="logo-grad" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="100%" stopColor="#06b6d4" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#logo-grad)" />
      <path
        d="M8 26H14L17 20L21 32L25 14L29 28L32 22H40"
        stroke="white"
        strokeWidth={size < 28 ? '3' : '2.2'}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Subtle shield outline for larger sizes */}
      {size >= 48 && (
        <path
          d="M24 10L36 16V26C36 32 30 37 24 39C18 37 12 32 12 26V16L24 10Z"
          stroke="white"
          strokeOpacity="0.12"
          strokeWidth="1"
          fill="none"
        />
      )}
    </svg>
  );
}

/** Logo with wordmark */
export function LogoWithText({ size = 32, className = '' }: { size?: number; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <Logo size={size} />
      <span
        className="font-semibold tracking-tight"
        style={{ fontSize: size * 0.56 }}
      >
        AgentLedger
      </span>
    </div>
  );
}
