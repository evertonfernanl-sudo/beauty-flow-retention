import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { initAnalytics } from "@/lib/analytics";

const KEY = "bf_cookie_consent";

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(KEY);
    if (!stored) setVisible(true);
    else if (stored === "accepted") initAnalytics();
  }, []);

  function accept() {
    localStorage.setItem(KEY, "accepted");
    setVisible(false);
    initAnalytics();
  }
  function reject() {
    localStorage.setItem(KEY, "rejected");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 px-4 py-3 shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Usamos cookies para melhorar sua experiência e medir o uso da plataforma.
          Veja nossa{" "}
          <Link to="/privacidade" className="underline">
            Política de Privacidade
          </Link>
          .
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={reject}>
            Recusar
          </Button>
          <Button size="sm" onClick={accept}>
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  );
}
