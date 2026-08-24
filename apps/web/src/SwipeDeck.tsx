import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tinder-style swipeable card deck.
 * - Full-bleed photo card with gradient info footer
 * - Drag to swipe (pointer events), LIKE/NOPE stamps fade in with drag
 * - Programmatic swipe for the action buttons
 * - Next card peeks behind at scale .94
 */
export interface SwipeCard {
  id: string;
  imageUrl: string;
  title: string;
  subtitle: string;
}

export function SwipeDeck({
  cards, onSwiped, emptyState,
}: {
  cards: SwipeCard[];
  onSwiped: (card: SwipeCard, dir: 1 | -1) => void;
  emptyState?: React.ReactNode;
}) {
  const [top, setTop] = useState<SwipeCard | null>(cards[0] ?? null);
  const [next, setNext] = useState<SwipeCard | null>(cards[1] ?? null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef({ active: false, startX: 0, startY: 0, dx: 0, dy: 0 });
  const busy = useRef(false);

  useEffect(() => {
    setTop(cards[0] ?? null);
    setNext(cards[1] ?? null);
  }, [cards]);

  const animateOut = useCallback((dir: 1 | -1, then: () => void) => {
    const el = cardRef.current;
    if (!el) { then(); return; }
    el.style.transition = "transform .35s ease-in, opacity .35s";
    el.style.transform = `translate(${dir * 600}px, 80px) rotate(${dir * 25}deg)`;
    el.style.opacity = "0";
    setTimeout(then, 350);
  }, []);

  const complete = useCallback((dir: 1 | -1) => {
    if (!top) return;
    const swiped = top;
    animateOut(dir, () => {
      onSwiped(swiped, dir);
      setTop(cards.find((c) => c.id !== swiped.id && c.id !== next?.id) ?? null);
      setNext(null);
    });
  }, [top, cards, next, animateOut, onSwiped]);

  // Reset transform when a new card becomes top.
  useEffect(() => {
    const el = cardRef.current;
    if (el && top) {
      el.style.transition = "";
      el.style.transform = "";
      el.style.opacity = "1";
    }
  }, [top?.id]);

  if (!top) return <>{emptyState ?? null}</>;

  const likeOpacity = () => { const el = cardRef.current?.querySelector<HTMLElement>(".stamp-like"); return el; };
  const nopeOpacity = () => cardRef.current?.querySelector<HTMLElement>(".stamp-nope");

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (busy.current) return;
    drag.current = { active: true, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active || !cardRef.current) return;
    d.dx = e.clientX - d.startX; d.dy = e.clientY - d.startY;
    cardRef.current.style.transform = `translate(${d.dx}px, ${d.dy}px) rotate(${d.dx / 25}deg)`;
    const like = likeOpacity(); const nope = nopeOpacity();
    if (like) like.style.opacity = String(Math.max(d.dx / 120, 0));
    if (nope) nope.style.opacity = String(Math.max(-d.dx / 120, 0));
  };
  const onPointerUp = () => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    if (Math.abs(d.dx) > 120) {
      busy.current = true;
      const dir: 1 | -1 = d.dx > 0 ? 1 : -1;
      animateOut(dir, () => {
        if (top) onSwiped(top, dir);
        setTop(next);
        setNext(null);
        busy.current = false;
      });
    } else {
      const el = cardRef.current;
      if (el) {
        el.style.transition = "transform .3s";
        el.style.transform = "";
        const like = likeOpacity(); const nope = nopeOpacity();
        if (like) like.style.opacity = "0";
        if (nope) nope.style.opacity = "0";
        setTimeout(() => { if (el) el.style.transition = ""; }, 300);
      }
    }
  };

  return (
    <div style={{ position: "relative", width: "100%", maxWidth: 340, height: 480, margin: "0 auto", touchAction: "none" }}>
      {next && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: 24, background: "#ddd",
          transform: "scale(.94) translateY(14px)", opacity: 0.5,
        }} />
      )}
      <div
        ref={cardRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          position: "absolute", inset: 0, borderRadius: 24,
          boxShadow: "0 12px 30px rgba(0,0,0,.18)",
          display: "flex", flexDirection: "column", justifyContent: "flex-end",
          color: "#fff", cursor: "grab", userSelect: "none",
          backgroundImage: top.imageUrl ? `url(${top.imageUrl})` : undefined,
          backgroundSize: "cover", backgroundPosition: "center",
          backgroundColor: "#c7c7cc", willChange: "transform",
        }}
      >
        <div className="stamp stamp-like" style={{
          position: "absolute", top: 26, left: 22, fontSize: 40, fontWeight: 900, letterSpacing: 2,
          padding: "4px 14px", border: "5px solid #31d158", borderRadius: 10, color: "#31d158",
          transform: "rotate(-16deg)", opacity: 0,
        }}>LIKE</div>
        <div className="stamp stamp-nope" style={{
          position: "absolute", top: 26, right: 22, fontSize: 40, fontWeight: 900, letterSpacing: 2,
          padding: "4px 14px", border: "5px solid #ff3b30", borderRadius: 10, color: "#ff3b30",
          transform: "rotate(16deg)", opacity: 0,
        }}>NOPE</div>
        <div style={{
          padding: 22, background: "linear-gradient(transparent, rgba(0,0,0,.6))",
          borderRadius: "0 0 24px 24px",
        }}>
          <h2 style={{ fontSize: 26, margin: 0 }}>{top.title}</h2>
          <p style={{ opacity: 0.92, margin: "4px 0 0" }}>{top.subtitle}</p>
        </div>
      </div>
    </div>
  );
}

/** Big round swipe action buttons (✕ / ♥) below the deck. */
export function SwipeActions({ onPass, onLike, disabled }: { onPass: () => void; onLike: () => void; disabled?: boolean }) {
  const btn: React.CSSProperties = {
    width: 72, height: 72, borderRadius: "50%", border: "none", background: "#fff",
    fontSize: 30, cursor: disabled ? "wait" : "pointer",
    boxShadow: "0 6px 16px rgba(0,0,0,.15)", transition: "transform .12s",
  };
  return (
    <div style={{ display: "flex", gap: 56, justifyContent: "center", margin: "22px 0 30px" }}>
      <button style={{ ...btn, color: "#ff3b30" }} aria-label="Pass" disabled={disabled} onClick={onPass}>✕</button>
      <button style={{ ...btn, color: "#31d158" }} aria-label="Interested" disabled={disabled} onClick={onLike}>♥</button>
    </div>
  );
}
