import { useEffect, useState } from "react";

/** Swipeable photo gallery with dotted pagination. Cover photo is passed as the first item. */
export function PhotoGallery({ paths }: { paths: string[] }) {
  const [index, setIndex] = useState(0);
  const [urls, setUrls] = useState<string[]>([]);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Resolve signed URLs for all photos (owner viewing own dog).
    void (async () => {
      const { photoSignedUrl } = await import("./dogsData.js");
      const resolved = await Promise.all(paths.map((p) => photoSignedUrl(p)));
      if (!cancelled) setUrls(resolved);
    })();
    return () => { cancelled = true; };
  }, [paths.join("|")]);

  if (paths.length === 0) {
    return <div style={{ width: "100%", height: 220, borderRadius: 16, background: "#e5e5ea", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🐶</div>;
  }

  const go = (delta: number) => setIndex((i) => Math.min(paths.length - 1, Math.max(0, i + delta)));

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          width: "100%", height: 240, borderRadius: 16, background: "#c7c7cc",
          backgroundSize: "cover", backgroundPosition: "center",
          backgroundImage: urls[index] ? `url(${urls[index]})` : undefined,
          touchAction: "pan-y", cursor: "grab", userSelect: "none",
        }}
        onTouchStart={(e) => setTouchStart(e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (touchStart === null) return;
          const touch = e.changedTouches[0];
          if (!touch) return;
          const dx = touch.clientX - touchStart;
          if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          setTouchStart(null);
        }}
        onClick={() => go(1)}
      />
      {paths.length > 1 && (
        <>
          {/* dotted pagination */}
          <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 8 }}>
            {paths.map((_, i) => (
              <span key={i} style={{
                width: 8, height: 8, borderRadius: "50%",
                background: i === index ? "var(--ink)" : "#c7c7cc",
                cursor: "pointer",
              }} onClick={() => setIndex(i)} />
            ))}
          </div>
          {/* arrows for desktop */}
          <button aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); go(-1); }}
            style={{ position: "absolute", left: 8, top: 100, width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.9)", fontSize: 18, cursor: "pointer", display: index > 0 ? "block" : "none" }}>‹</button>
          <button aria-label="Next photo" onClick={(e) => { e.stopPropagation(); go(1); }}
            style={{ position: "absolute", right: 8, top: 100, width: 36, height: 36, borderRadius: "50%", border: "none", background: "rgba(255,255,255,.9)", fontSize: 18, cursor: "pointer", display: index < paths.length - 1 ? "block" : "none" }}>›</button>
        </>
      )}
    </div>
  );
}
