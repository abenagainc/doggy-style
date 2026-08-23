import type { ReactNode } from "react";

export function PageState({ kind, children }: { kind: "loading" | "empty" | "error" | "unavailable" | "success"; children: ReactNode }) {
  return <section role={kind === "error" ? "alert" : "status"} data-state={kind}>{children}</section>;
}

export function LoadingState() { return <PageState kind="loading">Loading…</PageState>; }
export function EmptyState({ children }: { children: ReactNode }) { return <PageState kind="empty">{children}</PageState>; }
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) { return <PageState kind="error"><p>{message}</p>{retry && <button onClick={retry}>Try again</button>}</PageState>; }
