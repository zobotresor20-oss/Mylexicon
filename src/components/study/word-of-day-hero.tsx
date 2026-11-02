"use client";

import { motion } from "framer-motion";
import { Sparkles, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useLexicon } from "@/lib/store";
import { isFalseFriend } from "@/lib/false-friends";
import { SpeakButton } from "@/components/shared/speak-button";
import { Badge } from "@/components/ui/badge";
import { Phonetic } from "@/components/shared/phonetic";

/**
 * Hero « Mot du jour » affiché en haut du hub Étudier.
 * Sélectionne un mot déterministe basé sur la date du jour.
 */
export function WordOfDayHero({
  onStudy,
}: {
  /** Callback pour démarrer une session de flashcards sur ce mot. */
  onStudy: (wordId: string) => void;
}) {
  const words = useLexicon((s) => s.words);
  const cards = useLexicon((s) => s.cards);

  const wordOfDay = useMemo(() => {
    if (words.length === 0) return null;
    // Sélection déterministe basée sur la date du jour.
    const seed = Number(new Date().toISOString().slice(0, 10).replace(/-/g, ""));
    return words[seed % words.length];
  }, [words]);

  if (!wordOfDay) return null;

  const wordCards = cards.filter((c) => c.wordId === wordOfDay.id);
  const ff = isFalseFriend(wordOfDay.word);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-2xl p-4 text-white shadow-lg"
      style={{
        backgroundImage:
          "linear-gradient(135deg, oklch(0.45 0.13 160), oklch(0.4 0.1 175) 60%, oklch(0.35 0.08 190))",
      }}
    >
      {/* Motifs décoratifs */}
      <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -right-2 -bottom-8 h-24 w-24 rounded-full bg-amber-300/20 blur-2xl" />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/80">
              Mot du jour
            </span>
            {ff && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[9px] font-bold text-amber-950">
                ⚠ Faux-ami
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <h2 className="vocab-word text-2xl font-bold leading-tight truncate">
              {wordOfDay.word}
            </h2>
            <SpeakButton
              text={wordOfDay.word}
              className="text-white hover:bg-white/15"
            />
          </div>
          <Phonetic value={wordOfDay.phonetic} className="block text-white/80" />
          <p className="text-sm text-white/90 mt-0.5 truncate">
            {wordOfDay.translation}
          </p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium capitalize backdrop-blur-sm">
              {wordOfDay.partOfSpeech}
            </span>
            <span className="inline-flex items-center rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium backdrop-blur-sm">
              {wordCards.length} élément(s)
            </span>
          </div>
        </div>
      </div>

      <button
        onClick={() => onStudy(wordOfDay.id)}
        className="relative mt-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-white transition-colors shadow-sm"
      >
        Étudier ce mot
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}
