import { cn } from "@/lib/utils";
import { formatPhonetic } from "@/lib/phonetic";

/** Affiche la transcription phonétique d'un mot, ou rien s'il n'y en a pas. */
export function Phonetic({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  const text = formatPhonetic(value);
  if (!text) return null;
  return (
    <span
      className={cn("text-sm text-muted-foreground min-w-0 truncate", className)}
      title="Prononciation (alphabet phonétique international)"
    >
      {text}
    </span>
  );
}
