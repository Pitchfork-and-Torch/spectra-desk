import { useEffect, useRef, useState, type ReactNode } from "react";

export default function ScrollFade({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tick = () => {
      const room = el.scrollHeight - el.clientHeight - el.scrollTop;
      setMore(el.scrollHeight > el.clientHeight + 24 && room > 28);
    };
    tick();
    el.addEventListener("scroll", tick, { passive: true });
    const ro = new ResizeObserver(tick);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", tick);
      ro.disconnect();
    };
  }, []);

  return (
    <div className="scroll-fade">
      <div ref={ref} className="scroll-fade__body">
        {children}
      </div>
      {more && (
        <div className="scroll-fade__hint" aria-hidden="true">
          <span>More in this brief</span>
        </div>
      )}
    </div>
  );
}
