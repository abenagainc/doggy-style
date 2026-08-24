import type { CSSProperties, ReactNode } from "react";

/** Inline SVG icon set (stroke-based, 24px grid, currentColor). */
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ verticalAlign: "middle" }}>
      {PATHS[name]}
    </svg>
  );
}

export type IconName = keyof typeof PATHS;

const PATHS = {
  pass: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  heart: <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z" />,
  flame: <path d="M12 2c1 4-4 6-4 10a4 4 0 0 0 8 0c0-1-.5-2-1-3-1 1-2 1-2 0 0-2 2-4-1-7z" />,
  check: <polyline points="20 6 9 17 4 12" />,
  x: <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>,
  save: <><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" /></>,
  withdraw: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></>,
  trash: <><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  archive: <><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><line x1="10" y1="12" x2="14" y2="12" /></>,
  unarchive: <><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><polyline points="9 13 12 10 15 13" /><line x1="12" y1="10" x2="12" y2="17" /></>,
  chat: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  userX: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><line x1="18" y1="8" x2="23" y2="13" /><line x1="23" y1="8" x2="18" y2="13" /></>,
  eye: <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>,
  paw: <><circle cx="7" cy="7" r="2" /><circle cx="12" cy="5.5" r="2" /><circle cx="17" cy="7" r="2" /><path d="M12 10c-2.5 0-5 2-5 5a3 3 0 0 0 3 3c.8 0 1.4-.3 2-.3s1.2.3 2 .3a3 3 0 0 0 3-3c0-3-2.5-5-5-5z" /></>,
  send: <><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>,
  refresh: <><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2-9.4L23 10" /></>,
  plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  back: <><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></>,
} as const;

/** Round icon button. tone: "neutral" | "primary" | "danger" | "success" */
export function IconButton({
  icon, label, onClick, tone = "neutral", size = 52, disabled, style,
}: {
  icon: IconName; label: string; onClick?: (() => void) | undefined;
  tone?: "neutral" | "primary" | "danger" | "success"; size?: number; disabled?: boolean | undefined; style?: CSSProperties;
}) {
  const tones: Record<string, CSSProperties> = {
    neutral: { background: "#fff", color: "var(--ink)", border: "1.5px solid var(--line)" },
    primary: { background: "var(--ink)", color: "#fff", border: "1.5px solid var(--ink)" },
    danger: { background: "#fff", color: "var(--bad)", border: "1.5px solid var(--bad)" },
    success: { background: "#fff", color: "var(--good)", border: "1.5px solid var(--good)" },
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        width: size, height: size, borderRadius: "50%",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        cursor: disabled ? "wait" : "pointer", flexShrink: 0,
        ...tones[tone], ...style,
      }}
    >
      <Icon name={icon} size={Math.round(size * 0.44)} />
    </button>
  );
}

/** Labeled round action: circle icon with a small caption underneath. */
export function IconAction({
  icon, label, onClick, tone = "neutral", size = 56, disabled,
}: {
  icon: IconName; label: string; onClick?: (() => void) | undefined;
  tone?: "neutral" | "primary" | "danger" | "success"; size?: number; disabled?: boolean | undefined;
}) {
  const color = tone === "danger" ? "var(--bad)" : tone === "success" ? "var(--good)" : "var(--ink)";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <IconButton icon={icon} label={label} onClick={onClick} tone={tone} size={size} disabled={disabled} />
      <small style={{ color, fontWeight: 600 }}>{label}</small>
    </div>
  );
}

export function IconRow({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ display: "flex", gap: 14, alignItems: "flex-start", justifyContent: "center", flexWrap: "wrap", ...style }}>
      {children}
    </div>
  );
}
