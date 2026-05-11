// useKeyboardInset — reports the height (px) of the soft keyboard
// currently covering the layout viewport, or 0 when nothing's covering.
//
// Used by every bottom-anchored slide-up in the app (Sheet primitive,
// side="bottom") to translate itself upward by `inset` so its content
// stays visible while the on-screen keyboard is open.
//
// Math: window.innerHeight is the *layout* viewport; vv.height is the
// *visual* viewport (excludes the keyboard). Their difference, minus
// any vertical scroll offset of the visual viewport itself, is the
// keyboard's on-screen height. Clamped to >= 0 so a transient negative
// reading during orientation changes can't push the sheet downward.
//
// Falls back to inset = 0 when VisualViewport isn't available (older
// desktop browsers, SSR) — there's no on-screen keyboard there anyway.
//
// First lived inline in support-type-list.tsx (PR #33 / PR #34). Lifted
// to a shared hook in PR #35 so SheetContent itself can consume it and
// every bottom sheet in the app gets the behavior for free.

import { useEffect, useState } from "react";

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const vv = window.visualViewport;
    if (!vv) return;

    const recompute = () => {
      const next = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setInset(next);
    };

    recompute();
    vv.addEventListener("resize", recompute);
    vv.addEventListener("scroll", recompute);
    return () => {
      vv.removeEventListener("resize", recompute);
      vv.removeEventListener("scroll", recompute);
    };
  }, []);

  return inset;
}
