import { useEffect, useRef, useCallback } from "react";

interface TurnstileWidgetProps {
  onToken: (token: string) => void;
  onExpire?: () => void;
}

const SITE_KEY = "YOUR_CATCHAPP_SITE_KEY";

const TurnstileWidget = ({ onToken, onExpire }: TurnstileWidgetProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !(window as any).turnstile) return;
    // Clear previous widget
    if (widgetIdRef.current !== null) {
      (window as any).turnstile.remove(widgetIdRef.current);
    }
    widgetIdRef.current = (window as any).turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => onToken(token),
      "expired-callback": () => onExpire?.(),
      theme: "auto",
    });
  }, [onToken, onExpire]);

  useEffect(() => {
    // Load script if not already loaded
    if (!(window as any).turnstile) {
      const existing = document.querySelector('script[src*="turnstile"]');
      if (!existing) {
        const script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
        script.async = true;
        (window as any).onTurnstileLoad = () => renderWidget();
        document.head.appendChild(script);
      } else {
        // Script exists but API not ready yet — wait
        const interval = setInterval(() => {
          if ((window as any).turnstile) {
            clearInterval(interval);
            renderWidget();
          }
        }, 100);
        return () => clearInterval(interval);
      }
    } else {
      renderWidget();
    }

    return () => {
      if (widgetIdRef.current !== null && (window as any).turnstile) {
        (window as any).turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  return <div ref={containerRef} className="flex justify-center" />;
};

export default TurnstileWidget;
