"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { setToken } from "@/lib/auth";
import { useSession } from "@/components/providers/SessionProvider";

function CallbackInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { refresh } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const err = params.get("error");
    if (err) {
      setError(err);
      return;
    }

    const code = params.get("code");
    if (!code) {
      setError("missing_code");
      return;
    }

    let active = true;

    api<{ token: string }>("/auth/exchange", {
      method: "POST",
      body: JSON.stringify({ code }),
    })
      .then(async (data) => {
        setToken(data.token);
        await refresh();
        if (active) router.replace("/servers");
      })
      .catch(() => {
        if (active) setError("exchange_failed");
      });

    return () => {
      active = false;
    };
  }, [params, router, refresh]);

  if (error) {
    return (
      <div className="text-center">
        <p className="text-lg font-semibold">Login failed</p>
        <p className="mt-2 text-sm text-muted-foreground">{error}</p>
        <a href="/" className="mt-4 inline-block text-sm text-fuchsia-400">
          Try again
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
      <p className="text-sm text-muted-foreground">Signing you in…</p>
    </div>
  );
}

export default function AuthCallback() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Suspense fallback={null}>
        <CallbackInner />
      </Suspense>
    </main>
  );
}
