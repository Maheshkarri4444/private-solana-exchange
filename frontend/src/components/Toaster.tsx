"use client";

import { createContext, type ReactNode, useCallback, useContext, useState } from "react";

type Tone = "success" | "info";
interface Toast {
  id: number;
  title: string;
  text: string;
  tone: Tone;
}

const Context = createContext<(title: string, text: string, tone?: Tone) => void>(() => {});

/** Small pop-up messages in the corner (e.g. "your order filled"). */
export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((t) => t.filter((x) => x.id !== id));
  const show = useCallback((title: string, text: string, tone: Tone = "success") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, title, text, tone }]);
    setTimeout(() => dismiss(id), 10_000);
  }, []);

  return (
    <Context.Provider value={show}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto rounded-xl border bg-card-2 p-3 shadow-2xl ${t.tone === "success" ? "border-accent/40" : "border-private/40"}`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`text-sm font-semibold ${t.tone === "success" ? "text-accent" : "text-private"}`}>{t.title}</p>
              <button onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss">
                ✕
              </button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t.text}</p>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}

export const useToast = () => useContext(Context);
