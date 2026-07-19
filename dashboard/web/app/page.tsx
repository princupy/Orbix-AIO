"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, Bot, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/glass/GlassCard";
import { loginUrl } from "@/lib/api";
import { useSession } from "@/components/providers/SessionProvider";

const FEATURES = [
  {
    icon: Activity,
    title: "Live insights",
    desc: "Real-time member counts, logs, and command activity over WebSockets.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    desc: "Admins configure, moderators moderate — everyone stays in their lane.",
  },
  {
    icon: Sparkles,
    title: "Module toggles",
    desc: "Flip features on or off per server; changes reach the bot instantly.",
  },
];

export default function Home() {
  const { user, loading } = useSession();

  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 py-20 text-center">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <span className="glass mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-fuchsia-400" /> Premium control panel
        </span>
        <h1 className="text-balance text-5xl font-extrabold leading-tight sm:text-6xl">
          Control <span className="gradient-text">Orbix</span> from one
          beautiful dashboard
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
          Live stats, moderation, analytics, and module toggles for every
          server — in real time.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          {!loading && user ? (
            <Link href="/servers">
              <Button variant="gradient" size="lg">
                Go to Dashboard
              </Button>
            </Link>
          ) : (
            <a href={loginUrl()}>
              <Button variant="gradient" size="lg">
                <Bot className="h-5 w-5" /> Login with Discord
              </Button>
            </a>
          )}
        </div>
      </motion.div>

      <div className="mt-16 grid w-full gap-4 sm:grid-cols-3">
        {FEATURES.map((feature, index) => (
          <motion.div
            key={feature.title}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 * index }}
          >
            <GlassCard className="h-full text-left">
              <feature.icon className="h-6 w-6 text-fuchsia-400" />
              <h3 className="mt-3 font-semibold">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{feature.desc}</p>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </main>
  );
}
