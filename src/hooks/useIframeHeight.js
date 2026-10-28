import { useEffect } from "react";
import { IFRAME_PARENT_ORIGIN } from "../config/publicationConfig.js";

export function useIframeHeight(targetOrigin = IFRAME_PARENT_ORIGIN) {
  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return undefined;

    let frameId = null;
    let observer = null;

    const send = () => {
      const height = Math.max(
        document.documentElement?.scrollHeight || 0,
        document.body?.scrollHeight || 0,
      );
      window.parent?.postMessage({ type: "arlResize", height }, targetOrigin);
    };

    if (typeof ResizeObserver !== "undefined" && document.body) {
      observer = new ResizeObserver(send);
      observer.observe(document.body);
    }

    window.addEventListener("load", send);
    window.addEventListener("resize", send);
    frameId = window.requestAnimationFrame(send);
    send();

    return () => {
      if (observer) observer.disconnect();
      if (frameId != null) window.cancelAnimationFrame(frameId);
      window.removeEventListener("load", send);
      window.removeEventListener("resize", send);
    };
  }, [targetOrigin]);
}
