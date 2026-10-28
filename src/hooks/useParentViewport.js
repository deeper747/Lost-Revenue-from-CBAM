import { useState, useEffect } from "react";

export function useParentViewport() {
  const [parentVw, setParentVw] = useState(null);

  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "parentViewport" && typeof e.data.width === "number") {
        setParentVw(e.data.width);
      }
    };
    window.addEventListener("message", handler);
    window.parent?.postMessage({ type: "requestViewport" }, "*");
    return () => window.removeEventListener("message", handler);
  }, []);

  return parentVw;
}
