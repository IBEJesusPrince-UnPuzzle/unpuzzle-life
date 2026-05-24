import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

if (!window.location.hash) {
  window.location.hash = "#/";
}

// react-remove-scroll (used by Radix Dialog/Sheet) blocks all desktop clicks
// by either adding a block-interactivity-* class OR setting inline
// pointer-events:none on <body>. Watch both and undo them immediately.
new MutationObserver(() => {
  // Remove block-interactivity-* classes
  document.body.classList.forEach((cls) => {
    if (cls.startsWith("block-interactivity-")) {
      document.body.classList.remove(cls);
    }
  });
  // Clear inline pointer-events:none
  if (document.body.style.pointerEvents === "none") {
    document.body.style.pointerEvents = "";
  }
}).observe(document.body, { attributes: true, attributeFilter: ["class", "style"] });

createRoot(document.getElementById("root")!).render(<App />);
