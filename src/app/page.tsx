"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";

const PROGRAMMES = ["Global BBA", "PGE", "MSc", "MBA", "Autre"] as const;
const REACTION_EMOJIS = ["❤️", "🔥", "👏", "🚀", "💡", "😍"];

const PROGRAMME_COLORS: Record<string, string> = {
  "Global BBA": "bg-violet-100 text-violet-700 border-violet-200",
  PGE: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  MSc: "bg-amber-100 text-amber-700 border-amber-200",
  MBA: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Autre: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

const PROGRAMME_COLORS_DARK: Record<string, string> = {
  "Global BBA": "bg-violet-900/40 text-violet-300 border-violet-800",
  PGE: "bg-fuchsia-900/40 text-fuchsia-300 border-fuchsia-800",
  MSc: "bg-amber-900/40 text-amber-300 border-amber-800",
  MBA: "bg-emerald-900/40 text-emerald-300 border-emerald-800",
  Autre: "bg-zinc-800 text-zinc-400 border-zinc-700",
};

interface Signature {
  id: string;
  prenom: string;
  nom: string;
  programme: string;
  message: string;
  likes_count: number;
  created_at: string;
}

type ReactionsMap = Record<string, Record<string, number>>;
type UserReactionsMap = Record<string, Record<string, string[]>>;

// Card dimensions + spacing to prevent overlap
const CELL_W = 290; // 240px card + 50px gap
const CELL_H = 230; // ~180px card + 50px gap
const PADDING = 80;  // edge padding
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;

function isTouchDevice() {
  return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
}

function seededRandom(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  const x = Math.sin(hash) * 10000;
  return x - Math.floor(x);
}

function getGridSize(total: number) {
  const cols = Math.max(2, Math.ceil(Math.sqrt(total * 1.2)));
  const rows = Math.max(2, Math.ceil(total / cols));
  return {
    cols,
    rows,
    canvasW: cols * CELL_W + PADDING * 2,
    canvasH: rows * CELL_H + PADDING * 2,
  };
}

function getPosition(sig: Signature, index: number, total: number) {
  const seed = sig.prenom + sig.nom + index;
  const { cols } = getGridSize(total);
  const col = index % cols;
  const row = Math.floor(index / cols);
  // Small jitter within safe bounds (max ±20px so cards never overlap)
  const jitterX = (seededRandom(seed + "x") - 0.5) * 40;
  const jitterY = (seededRandom(seed + "y") - 0.5) * 40;
  const x = PADDING + col * CELL_W + jitterX;
  const y = PADDING + row * CELL_H + jitterY;
  const rotation = seededRandom(seed + "r") * 6 - 3;
  return { x, y, rotation };
}

function getFingerprint(): string {
  if (typeof window === "undefined") return "server";
  let fp = localStorage.getItem("vibe-fp");
  if (!fp) {
    fp = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("vibe-fp", fp);
  }
  return fp;
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "maintenant";
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}j`;
}

// ─── Post card (positioned absolutely on the canvas) ───
function PostCard({
  sig,
  index,
  dark,
  reactions,
  myReactions,
  onToggleReact,
  zoom,
}: {
  sig: Signature & { pos: ReturnType<typeof getPosition> };
  index: number;
  dark: boolean;
  reactions: Record<string, number>;
  myReactions: Set<string>;
  onToggleReact: (id: string, emoji: string, remove: boolean) => void;
  zoom: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [renderPos, setRenderPos] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [animDone, setAnimDone] = useState(false);
  const state = useRef({ dragging: false, startX: 0, startY: 0, ox: 0, oy: 0, cx: 0, cy: 0, moved: false });

  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        // Use requestAnimationFrame so click events on emoji buttons fire first
        requestAnimationFrame(() => setShowPicker(false));
      }
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [showPicker]);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-react-zone]")) return;
    e.preventDefault();
    e.stopPropagation();
    state.current.dragging = true;
    state.current.moved = false;
    state.current.startX = e.clientX;
    state.current.startY = e.clientY;
    state.current.ox = state.current.cx;
    state.current.oy = state.current.cy;
    setDragging(true);
    setShowPicker(false);
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!state.current.dragging) return;
    // Divide by zoom so card moves 1:1 with cursor
    const dx = (e.clientX - state.current.startX) / zoom;
    const dy = (e.clientY - state.current.startY) / zoom;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.current.moved = true;
    const nx = state.current.ox + dx;
    const ny = state.current.oy + dy;
    state.current.cx = nx;
    state.current.cy = ny;
    setRenderPos({ x: nx, y: ny });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    state.current.dragging = false;
    setDragging(false);
    ref.current?.releasePointerCapture(e.pointerId);
  };

  const colors = dark ? PROGRAMME_COLORS_DARK : PROGRAMME_COLORS;
  const reactionEntries = Object.entries(reactions).filter(([, count]) => count > 0);

  return (
    <div
      ref={outerRef}
      className={`absolute ${animDone ? "" : "animate-pop-in"}`}
      onAnimationEnd={() => setAnimDone(true)}
      style={{
        left: sig.pos.x,
        top: sig.pos.y,
        animationDelay: `${Math.min(index * 0.04, 2)}s`,
        opacity: animDone ? 1 : 0,
      }}
    >
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className={`w-60 rounded-2xl border p-4 select-none transition-shadow
          ${dragging ? "z-50 shadow-xl cursor-grabbing" : "cursor-grab hover:shadow-lg"}
          ${dark ? "bg-zinc-900 border-zinc-700/60" : "bg-white border-zinc-200"}`}
        style={{
          transform: `translate(${renderPos.x}px, ${renderPos.y}px) rotate(${dragging ? sig.pos.rotation : 0}deg) scale(${dragging ? 1.05 : 1})`,
          touchAction: "none",
          transition: dragging ? "none" : "box-shadow 0.2s, transform 0.2s",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-sm font-semibold truncate ${dark ? "text-zinc-100" : "text-zinc-800"}`}>
            {sig.prenom} {sig.nom.charAt(0)}.
          </span>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${colors[sig.programme] || colors["Autre"]}`}>
            {sig.programme}
          </span>
        </div>

        {/* Message */}
        {sig.message && (
          <p className={`text-xs leading-relaxed mb-3 line-clamp-4 ${dark ? "text-zinc-400" : "text-zinc-500"}`}>
            {sig.message}
          </p>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2" data-react-zone>
          <span className={`text-[10px] shrink-0 ${dark ? "text-zinc-600" : "text-zinc-300"}`}>
            {timeAgo(sig.created_at)}
          </span>

          <div className="flex items-center gap-1 flex-wrap justify-end relative" ref={pickerRef}>
            {reactionEntries.map(([emoji, count]) => {
              const isMine = myReactions.has(emoji);
              return (
                <button
                  key={emoji}
                  data-react-zone
                  onClick={(e) => { e.stopPropagation(); onToggleReact(sig.id, emoji, isMine); }}
                  className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-all cursor-pointer active:scale-90
                    ${isMine
                      ? dark ? "bg-violet-900/40 border border-violet-700 shadow-sm" : "bg-violet-50 border border-violet-300 shadow-sm"
                      : dark ? "bg-zinc-800 border border-zinc-700 hover:border-zinc-600" : "bg-zinc-50 border border-zinc-200 hover:border-zinc-300"
                    }`}
                >
                  <span className="leading-none">{emoji}</span>
                  <span className={`text-[10px] font-medium ${isMine ? (dark ? "text-violet-300" : "text-violet-600") : (dark ? "text-zinc-400" : "text-zinc-500")}`}>{count}</span>
                </button>
              );
            })}

            <button
              data-react-zone
              onClick={(e) => { e.stopPropagation(); if (!state.current.moved) setShowPicker((p) => !p); }}
              className={`w-6 h-6 flex items-center justify-center rounded-full transition-all cursor-pointer active:scale-90
                ${showPicker
                  ? dark ? "bg-zinc-700 border border-zinc-600" : "bg-zinc-200 border border-zinc-300"
                  : dark ? "bg-zinc-800 border border-zinc-700 hover:bg-zinc-700" : "bg-zinc-50 border border-zinc-200 hover:bg-zinc-100"
                }`}
              title="Réagir"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={dark ? "text-zinc-500" : "text-zinc-400"}>
                <circle cx="12" cy="12" r="10" />
                <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                <line x1="9" y1="9" x2="9.01" y2="9" />
                <line x1="15" y1="9" x2="15.01" y2="9" />
              </svg>
            </button>

            {showPicker && (
              <div
                data-react-zone
                className={`absolute bottom-full right-0 mb-2 flex gap-0.5 p-1.5 rounded-2xl border shadow-xl z-50
                  ${dark ? "bg-zinc-800 border-zinc-700" : "bg-white border-zinc-200"}`}
                style={{ animation: "pop-in 0.15s ease-out forwards" }}
              >
                {REACTION_EMOJIS.map((emoji) => {
                  const isMine = myReactions.has(emoji);
                  return (
                    <button
                      key={emoji}
                      data-react-zone
                      onClick={(e) => { e.stopPropagation(); onToggleReact(sig.id, emoji, isMine); setShowPicker(false); }}
                      className={`w-9 h-9 flex items-center justify-center rounded-xl text-lg transition-all cursor-pointer hover:scale-110 active:scale-90
                        ${isMine ? (dark ? "bg-violet-900/40 ring-1 ring-violet-600" : "bg-violet-50 ring-1 ring-violet-300") : (dark ? "hover:bg-zinc-700" : "hover:bg-zinc-50")}`}
                    >
                      {emoji}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [count, setCount] = useState<number>(0);
  const [form, setForm] = useState({ prenom: "", nom: "", email: "", programme: "", message: "" });
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [showPanel, setShowPanel] = useState(false);
  const [dark, setDark] = useState(false);
  const [reactions, setReactions] = useState<ReactionsMap>({});
  const [userReactions, setUserReactions] = useState<UserReactionsMap>({});

  // Map pan/zoom state
  const [zoom, setZoom] = useState(0.6);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const mapRef = useRef<HTMLDivElement>(null);
  const panState = useRef({ panning: false, startX: 0, startY: 0, ox: 0, oy: 0 });

  // Center canvas on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { canvasW, canvasH } = getGridSize(Math.max(1, signatures.length));
    setPan({
      x: (vw - canvasW * 0.6) / 2,
      y: (vh - canvasH * 0.6) / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("vibe-dark");
    if (stored === "true") {
      setDark(true);
      document.documentElement.classList.add("dark");
    }
  }, []);

  const toggleDark = () => {
    setDark((prev) => {
      const next = !prev;
      localStorage.setItem("vibe-dark", String(next));
      if (next) document.documentElement.classList.add("dark");
      else document.documentElement.classList.remove("dark");
      return next;
    });
  };

  // Wheel zoom (zoom toward cursor)
  useEffect(() => {
    const el = mapRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const mx = e.clientX;
      const my = e.clientY;

      setZoom((prevZoom) => {
        const delta = e.deltaY > 0 ? 0.92 : 1.08;
        const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, prevZoom * delta));
        const scale = newZoom / prevZoom;

        setPan((prevPan) => ({
          x: mx - scale * (mx - prevPan.x),
          y: my - scale * (my - prevPan.y),
        }));

        return newZoom;
      });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  // Pinch-to-zoom for touch devices
  const pinchState = useRef({ active: false, startDist: 0, startZoom: 0, midX: 0, midY: 0 });
  useEffect(() => {
    const el = mapRef.current;
    if (!el || !isTouchDevice()) return;

    const getDist = (t: TouchList) => {
      const dx = t[1].clientX - t[0].clientX;
      const dy = t[1].clientY - t[0].clientY;
      return Math.hypot(dx, dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        pinchState.current.active = true;
        pinchState.current.startDist = getDist(e.touches);
        pinchState.current.startZoom = zoom;
        pinchState.current.midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        pinchState.current.midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pinchState.current.active || e.touches.length !== 2) return;
      e.preventDefault();
      const dist = getDist(e.touches);
      const scale = dist / pinchState.current.startDist;
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchState.current.startZoom * scale));
      const zoomScale = newZoom / zoom;
      const mx = pinchState.current.midX;
      const my = pinchState.current.midY;

      setPan((prevPan) => ({
        x: mx - zoomScale * (mx - prevPan.x),
        y: my - zoomScale * (my - prevPan.y),
      }));
      setZoom(newZoom);
    };

    const onTouchEnd = () => { pinchState.current.active = false; };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, [zoom]);

  // Pan handlers (on the map container)
  const onMapPointerDown = (e: React.PointerEvent) => {
    // Only pan on direct clicks on the map bg, not on cards
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains("map-canvas")) return;
    panState.current.panning = true;
    panState.current.startX = e.clientX;
    panState.current.startY = e.clientY;
    panState.current.ox = pan.x;
    panState.current.oy = pan.y;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onMapPointerMove = (e: React.PointerEvent) => {
    if (!panState.current.panning) return;
    setPan({
      x: panState.current.ox + (e.clientX - panState.current.startX),
      y: panState.current.oy + (e.clientY - panState.current.startY),
    });
  };

  const onMapPointerUp = () => {
    panState.current.panning = false;
  };

  const fetchSignatures = useCallback(async () => {
    try {
      const res = await fetch("/api/signatures");
      const data = await res.json();
      setSignatures(data.signatures);
      setCount(data.count);
    } catch { /* */ }
  }, []);

  const fetchReactions = useCallback(async () => {
    try {
      const res = await fetch("/api/signatures/reactions");
      const data = await res.json();
      setReactions(data.reactions ?? {});
      setUserReactions(data.userReactions ?? {});
    } catch { /* */ }
  }, []);

  useEffect(() => {
    fetchSignatures();
    fetchReactions();
    const interval = setInterval(() => { fetchSignatures(); fetchReactions(); }, 15000);
    return () => clearInterval(interval);
  }, [fetchSignatures, fetchReactions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMsg("");
    try {
      const res = await fetch("/api/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { setStatus("error"); setErrorMsg(data.error || "Une erreur est survenue."); return; }
      setStatus("success");
      setForm({ prenom: "", nom: "", email: "", programme: "", message: "" });
      fetchSignatures();
    } catch { setStatus("error"); setErrorMsg("Erreur de connexion. Réessayez."); }
  };

  const handleToggleReact = async (signatureId: string, emoji: string, remove: boolean) => {
    const fp = getFingerprint();
    if (remove) {
      setReactions((prev) => {
        const copy = { ...prev };
        if (copy[signatureId]?.[emoji]) { copy[signatureId] = { ...copy[signatureId] }; copy[signatureId][emoji] = Math.max(0, copy[signatureId][emoji] - 1); }
        return copy;
      });
      setUserReactions((prev) => {
        const copy = { ...prev };
        if (copy[signatureId]?.[emoji]) { copy[signatureId] = { ...copy[signatureId] }; copy[signatureId][emoji] = copy[signatureId][emoji].filter((f) => f !== fp); }
        return copy;
      });
      try { const res = await fetch("/api/signatures/like", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature_id: signatureId, fingerprint: fp, emoji }) }); if (!res.ok) fetchReactions(); } catch { fetchReactions(); }
    } else {
      setReactions((prev) => {
        const copy = { ...prev };
        if (!copy[signatureId]) copy[signatureId] = {};
        copy[signatureId] = { ...copy[signatureId] };
        copy[signatureId][emoji] = (copy[signatureId][emoji] || 0) + 1;
        return copy;
      });
      setUserReactions((prev) => {
        const copy = { ...prev };
        if (!copy[signatureId]) copy[signatureId] = {};
        copy[signatureId] = { ...copy[signatureId] };
        if (!copy[signatureId][emoji]) copy[signatureId][emoji] = [];
        copy[signatureId][emoji] = [...copy[signatureId][emoji], fp];
        return copy;
      });
      try { const res = await fetch("/api/signatures/like", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ signature_id: signatureId, fingerprint: fp, emoji }) }); if (!res.ok) fetchReactions(); } catch { fetchReactions(); }
    }
  };

  const fp = typeof window !== "undefined" ? getFingerprint() : "";

  const getMyReactions = useCallback(
    (sigId: string): Set<string> => {
      const sigReactions = userReactions[sigId];
      if (!sigReactions) return new Set();
      const mine = new Set<string>();
      for (const [emoji, fps] of Object.entries(sigReactions)) {
        if (fps.includes(fp)) mine.add(emoji);
      }
      return mine;
    },
    [userReactions, fp]
  );

  const positioned = useMemo(
    () => signatures.map((sig, i) => ({ ...sig, pos: getPosition(sig, i, signatures.length) })),
    [signatures]
  );

  const { canvasW, canvasH } = useMemo(() => getGridSize(Math.max(1, signatures.length)), [signatures.length]);
  const zoomPercent = Math.round(zoom * 100);

  return (
    <div className={`relative w-screen h-screen overflow-hidden transition-colors duration-300 dot-grid ${dark ? "bg-[#0a0a0a]" : "bg-white"}`}>
      <div className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 z-50" />

      {/* Header */}
      <header className="fixed top-4 left-4 max-[480px]:left-3 max-[480px]:top-3 z-40 animate-fade-in-up flex items-center gap-3 max-[480px]:gap-2">
        <div>
          <h1 className={`text-lg max-[480px]:text-sm font-semibold tracking-tight ${dark ? "text-zinc-100" : "text-zinc-900"}`}>
            Vibe Coding{" "}
            <span className={dark ? "text-zinc-500 font-normal" : "text-zinc-400 font-normal"}>à NEOMA</span>
          </h1>
          <p className={`text-xs max-[480px]:text-[10px] mt-0.5 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
            Ateliers gratuits avec Martin Bonan
          </p>
        </div>
        <button
          onClick={toggleDark}
          className={`ml-2 mt-0.5 p-2 max-[480px]:p-1.5 rounded-xl border transition-all cursor-pointer hover:scale-110 active:scale-95 ${
            dark ? "bg-zinc-800 border-zinc-700 text-amber-400 hover:bg-zinc-700" : "bg-zinc-50 border-zinc-200 text-zinc-500 hover:bg-zinc-100"
          }`}
          title={dark ? "Mode clair" : "Mode sombre"}
        >
          {dark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
            </svg>
          )}
        </button>
      </header>

      {/* Counter */}
      <div className="fixed top-5 right-6 max-[480px]:top-3 max-[480px]:right-3 z-40 animate-counter-enter">
        <div className="flex items-baseline gap-2">
          <span className="text-4xl max-[480px]:text-2xl font-bold font-mono bg-gradient-to-r from-violet-600 to-fuchsia-500 bg-clip-text text-transparent">
            {count}
          </span>
          <span className={`text-sm max-[480px]:text-xs ${dark ? "text-zinc-500" : "text-zinc-400"}`}>
            signature{count !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Zoom indicator */}
      <div className={`fixed bottom-20 right-6 max-[480px]:right-3 z-40 flex flex-col items-center gap-2`}>
        <button
          onClick={() => setZoom((z) => Math.min(MAX_ZOOM, z * 1.2))}
          className={`w-9 h-9 flex items-center justify-center rounded-xl border text-lg font-medium transition-all cursor-pointer active:scale-90
            ${dark ? "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800" : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}
        >+</button>
        <span className={`text-[10px] font-mono ${dark ? "text-zinc-600" : "text-zinc-400"}`}>{zoomPercent}%</span>
        <button
          onClick={() => setZoom((z) => Math.max(MIN_ZOOM, z / 1.2))}
          className={`w-9 h-9 flex items-center justify-center rounded-xl border text-lg font-medium transition-all cursor-pointer active:scale-90
            ${dark ? "bg-zinc-900 border-zinc-700 text-zinc-400 hover:bg-zinc-800" : "bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50"}`}
        >-</button>
      </div>

      {/* ─── Pannable/zoomable map ─── */}
      <div
        ref={mapRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerUp}
        style={{ touchAction: "none" }}
      >
        <div
          className="map-canvas"
          style={{
            width: canvasW,
            height: canvasH,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            position: "relative",
          }}
          onPointerDown={onMapPointerDown}
          onPointerMove={onMapPointerMove}
          onPointerUp={onMapPointerUp}
        >
          {positioned.map((sig, i) => (
            <PostCard
              key={sig.id}
              sig={sig}
              index={i}
              dark={dark}
              reactions={reactions[sig.id] || {}}
              myReactions={getMyReactions(sig.id)}
              onToggleReact={handleToggleReact}
              zoom={zoom}
            />
          ))}

          {signatures.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className={`text-lg ${dark ? "text-zinc-600" : "text-zinc-300"}`}>
                Soyez le premier à signer...
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ─── Bottom CTA ─── */}
      {!showPanel && status !== "success" && (
        <div className="fixed bottom-8 max-[480px]:bottom-6 left-1/2 -translate-x-1/2 z-40 animate-fade-in-up" style={{ animationDelay: "0.3s", opacity: 0 }}>
          <button
            onClick={() => setShowPanel(true)}
            className={`px-8 py-4 max-[480px]:px-6 max-[480px]:py-3 rounded-2xl font-semibold text-base max-[480px]:text-sm text-white
              bg-gradient-to-r from-violet-600 to-fuchsia-500
              hover:shadow-xl hover:scale-105 active:scale-95
              transition-all duration-200 cursor-pointer
              ${dark ? "shadow-lg shadow-violet-900/30 hover:shadow-violet-800/40" : "shadow-lg shadow-violet-200 hover:shadow-violet-300"}`}
          >
            Je veux apprendre
          </button>
        </div>
      )}

      {/* Success toast */}
      {status === "success" && !showPanel && (
        <div
          className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-40
            px-6 py-4 rounded-2xl border animate-fade-in-up text-center max-w-sm
            ${dark ? "bg-zinc-900 border-emerald-800 shadow-lg shadow-emerald-900/20" : "bg-white border-emerald-200 shadow-lg shadow-emerald-100"}`}
        >
          <p className="text-emerald-700 font-semibold">Merci, bienvenue !</p>
          <p className="text-emerald-600/70 text-sm mt-1">Votre post est sur le board.</p>
          <button
            onClick={() => {
              const url = window.location.href;
              const text = "Je veux apprendre le vibe coding à NEOMA ! Rejoins-nous :";
              if (navigator.share) navigator.share({ title: "Vibe Coding à NEOMA", text, url }).then(() => setStatus("idle"));
              else { navigator.clipboard.writeText(`${text} ${url}`); setStatus("idle"); }
            }}
            className="mt-3 px-5 py-2 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
          >
            Partager le lien
          </button>
        </div>
      )}

      {/* ─── Sign modal ─── */}
      {showPanel && (
        <>
          <div className="fixed inset-0 bg-black/30 backdrop-blur-md z-40" onClick={() => { setShowPanel(false); if (status === "success") setStatus("idle"); }} />
          <div className="fixed inset-0 z-50 flex items-center max-[480px]:items-end justify-center p-4 max-[480px]:p-0">
            <div
              className={`w-full max-w-md max-[480px]:max-w-none rounded-3xl max-[480px]:rounded-t-3xl max-[480px]:rounded-b-none shadow-2xl overflow-hidden max-h-[90dvh] overflow-y-auto ${dark ? "bg-zinc-900 shadow-black/50" : "bg-white shadow-zinc-300/50"}`}
              style={{ animation: "pop-in 0.25s ease-out forwards" }}
            >
              <div className="flex justify-end p-4 pb-0">
                <button
                  onClick={() => { setShowPanel(false); if (status === "success") setStatus("idle"); }}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-all cursor-pointer ${dark ? "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300" : "text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"}`}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div className="px-6 pb-6">
                {status === "success" ? (
                  <div className="text-center py-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-100 mb-4">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <p className="text-emerald-700 font-semibold text-lg">Bienvenue !</p>
                    <p className="text-emerald-600/70 text-sm mt-1">Votre post est maintenant sur le board.</p>
                    <button
                      onClick={() => {
                        const url = window.location.href;
                        const text = "Je veux apprendre le vibe coding à NEOMA ! Rejoins-nous :";
                        if (navigator.share) navigator.share({ title: "Vibe Coding à NEOMA", text, url }).then(() => { setShowPanel(false); setStatus("idle"); });
                        else { navigator.clipboard.writeText(`${text} ${url}`); setShowPanel(false); setStatus("idle"); }
                      }}
                      className="mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:opacity-90 active:scale-95 transition-all cursor-pointer"
                    >
                      Partager le lien
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-5">
                      <h2 className={`text-xl font-bold ${dark ? "text-zinc-100" : "text-zinc-900"}`}>Je veux apprendre</h2>
                      <p className={`text-sm mt-1 ${dark ? "text-zinc-500" : "text-zinc-400"}`}>Montrez votre intérêt pour le vibe coding</p>
                    </div>
                    <form onSubmit={handleSubmit}>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <input type="text" required value={form.prenom} onChange={(e) => setForm({ ...form, prenom: e.target.value })}
                            className={`rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 ${dark ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-300 focus:bg-white"}`}
                            placeholder="Prénom" />
                          <input type="text" required value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })}
                            className={`rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 ${dark ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-300 focus:bg-white"}`}
                            placeholder="Nom" />
                        </div>
                        <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                          className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 ${dark ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-300 focus:bg-white"}`}
                          placeholder="Email NEOMA" />
                        <select required value={form.programme} onChange={(e) => setForm({ ...form, programme: e.target.value })}
                          className={`w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 appearance-none cursor-pointer ${dark ? "border-zinc-700 bg-zinc-800 text-zinc-100" : "border-zinc-200 bg-zinc-50 text-zinc-900 focus:bg-white"}`}>
                          <option value="" disabled>Programme</option>
                          {PROGRAMMES.map((p) => (<option key={p} value={p}>{p}</option>))}
                        </select>
                        <div className="relative">
                          <textarea maxLength={500} rows={2} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
                            className={`w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-all focus:border-violet-400 focus:ring-2 focus:ring-violet-100 resize-none ${dark ? "border-zinc-700 bg-zinc-800 text-zinc-100 placeholder-zinc-600" : "border-zinc-200 bg-zinc-50 text-zinc-900 placeholder-zinc-300 focus:bg-white"}`}
                            placeholder="Votre message (optionnel)" />
                          {form.message.length > 0 && (
                            <span className={`absolute bottom-2 right-3 text-[10px] ${dark ? "text-zinc-600" : "text-zinc-300"}`}>{form.message.length}/500</span>
                          )}
                        </div>
                      </div>
                      {status === "error" && (
                        <div className={`mt-3 rounded-xl px-4 py-2.5 text-sm ${dark ? "bg-red-900/30 border border-red-800 text-red-400" : "bg-red-50 border border-red-200 text-red-600"}`}>
                          {errorMsg}
                        </div>
                      )}
                      <button type="submit" disabled={status === "loading"}
                        className="mt-4 w-full rounded-xl py-3.5 text-white font-semibold bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer">
                        {status === "loading" ? (
                          <span className="inline-flex items-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Envoi...
                          </span>
                        ) : "Je participe"}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      <div className={`fixed bottom-3 right-4 z-30 text-[10px] ${dark ? "text-zinc-700" : "text-zinc-300"}`}>
        Une initiative étudiante pour NEOMA
      </div>
    </div>
  );
}
