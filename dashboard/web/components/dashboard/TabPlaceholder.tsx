import { GlassCard } from "@/components/glass/GlassCard";

export function TabPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="animate-fade-in space-y-6">
      <h1 className="text-2xl font-bold">{title}</h1>
      <GlassCard className="text-sm text-muted-foreground">{description}</GlassCard>
    </div>
  );
}
