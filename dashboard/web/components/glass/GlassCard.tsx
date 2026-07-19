import * as React from "react";
import { cn } from "@/lib/utils";

export function GlassCard({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("glass rounded-2xl p-5 shadow-glow-sm", className)}
      {...props}
    >
      {children}
    </div>
  );
}
