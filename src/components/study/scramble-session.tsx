"use client";

import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Eye, Lightbulb, RefreshCw, Shuffle, X, Eraser } from "lucide-react";

import type { Word } from "@/lib/types";
import { useLexicon } from "@/lib/store";
import { speak } from "@/lib/speech";
import { pickTopicWords } from "@/lib/topic";
import {
  isScrambleWord,
  maskInSentence,
  normalizeLetters,
  shuffleLetters,
} from "@/lib/word-games";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SpeakButton } from "@/components/shared/speak-button";
import { Phonetic } from "@/components/shared/phonetic";
import { GameShell } from "@/components/study/game-shell";

interface Tile {
  id: number;
  ch: string;
}

interface Round {
  word: Word;
  letters: string;
}

interface Result {
  wordId: string;
  word: string;
  translation: string;
  ok: boolean;
  firstTry: boolean;
  hints: number;
}

const COUNTS = [5, 10, 15];
const MAX_HINTS = 3;

export function ScrambleSession({ onExit }: { onExit: () => void }) {
  const words = useLexicon((s) => s.words);
  const cards = useLexicon((s) => s.cards);
  const examples = useLexicon((s) => s.examples);
  const accent = useLexicon((s) => s.settings.accent);
  const rate = useLexicon((s) => s.settings.speechRate);
  const hidePhonetic = useLexicon((s) => !!s.settings.hidePhoneticInStudy);
  const addStudySession = useLexicon((s) => s.addStudySession);
  const recordDailyActivity = useLexicon((s) => s.recordDailyActivity);

  const [phase, setPhase] = useState<"setup" | "play" | "done">("setup");
  const [count, setCount] = useState(10);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [idx, setIdx] = useState(0);
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [slots, setSlots] = useState<(number | null)[]>([]);
  const [locked, setLocked] = useState<boolean[]>([]);
  const [outcome, setOutcome] = useState<"solved" | "skipped" | null>(null);
  const [wrong, setWrong] = useState(false);
  const [tries, setTries] = useState(0);
  const [hintsUsed, setHintsUsed] = useState(0);
  const [showExample, setShowExample] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const startRef = useRef(0);

  const pool = useMemo(() => words.filter(isScrambleWord), [words]);

  function setupRound(round: Round) {
    const chars = shuffleLetters(round.letters);
    setTiles(chars.map((ch, id) => ({ id, ch })));
    setSlots(Array(chars.length).fill(null));
    setLocked(Array(chars.length).fill(false));
    setOutcome(null);
    setWrong(false);
    setTries(0);
    setHintsUsed(0);
    setShowExample(false);
  }

  function start() {
    const picked = pickTopicWords(pool, cards, Math.min(count, pool.length));
    if (picked.length === 0) return;
    const r: Round[] = picked.map((w) => ({ word: w, letters: normalizeLetters(w.word) }));
    setRounds(r);
    setIdx(0);
    setResults([]);
    startRef.current = Date.now();
    setupRound(r[0]);
    setPhase("play");
  }

  const round = rounds[idx];

  function record(ok: boolean, hints: number, triesNow: number) {
    if (!round) return;
    setResults((prev) => [
      ...prev,
      {
        wordId: round.word.id,
        word: round.word.word,
        translation: round.word.translation,
        ok,
        firstTry: ok && triesNow === 0 && hints === 0,
        hints,
      },
    ]);
  }

  function checkAnswer(nextSlots: (number | null)[], hintsNow: number) {
    if (!round || nextSlots.some((s) => s === null)) return;
    const answer = nextSlots.map((id) => tiles[id as number].ch).join("");
    if (answer === round.letters) {
      setOutcome("solved");
      setWrong(false);
      record(true, hintsNow, tries);
      speak(round.word.word, accent, rate);
    } else {
      setWrong(true);
      setTries((t) => t + 1);
    }
  }

  function placeTile(tileId: number) {
    if (outcome) return;
    const free = slots.findIndex((s) => s === null);
    if (free === -1) return;
    const next = [...slots];
    next[free] = tileId;
    setSlots(next);
    setWrong(false);
    checkAnswer(next, hintsUsed);
  }

  function removeSlot(i: number) {
    if (outcome || locked[i] || slots[i] === null) return;
    const next = [...slots];
    next[i] = null;
    setSlots(next);
    setWrong(false);
  }

  function clearAll() {
    if (outcome) return;
    setSlots((prev) => prev.map((s, i) => (locked[i] ? s : null)));
    setWrong(false);
  }

  function giveHint() {
    if (!round || outcome || hintsUsed >= MAX_HINTS) return;
    const pos = locked.findIndex((l) => !l);
    if (pos === -1) return;
    const needed = round.letters[pos];
    const next = [...slots];
    let tileId: number | undefined =
      next[pos] !== null && tiles[next[pos] as number].ch === needed
        ? (next[pos] as number)
        : undefined;
    if (tileId === undefined) {
      const used = new Set(next.filter((s): s is number => s !== null));
      tileId = tiles.find((t) => t.ch === needed && !used.has(t.id))?.id;
      if (tileId === undefined) {
        // La bonne lettre est déjà posée ailleurs : on la reprend.
        const other = next.findIndex(
          (id, j) => id !== null && j !== pos && !locked[j] && tiles[id].ch === needed
        );
        if (other === -1) return;
        tileId = next[other] as number;
        next[other] = null;
      }
    }
    next[pos] = tileId;
    const nextLocked = [...locked];
    nextLocked[pos] = true;
    const hintsNow = hintsUsed + 1;
    setSlots(next);
    setLocked(nextLocked);
    setHintsUsed(hintsNow);
    setWrong(false);
    checkAnswer(next, hintsNow);
  }

  function skip() {
    if (!round || outcome) return;
    setOutcome("skipped");
    setWrong(false);
    record(false, hintsUsed, tries);
  }

  function next() {
    if (idx + 1 >= rounds.length) {
      const okCount = results.filter((r) => r.ok).length;
      recordDailyActivity(0, rounds.length);
      addStudySession({
        date: startRef.current,
        durationSec: Math.round((Date.now() - startRef.current) / 1000),
        correct: okCount,
        total: rounds.length,
        type: "scramble",
      });
      setPhase("done");
      return;
    }
    const n = idx + 1;
    setIdx(n);
    setupRound(rounds[n]);
  }

  const exampleSentence = useMemo(() => {
    if (!round) return "";
    const stem = round.word.word.toLowerCase().replace(/e$/, "");
    const ex = examples.find(
      (e) => e.wordId === round.word.id && e.content.toLowerCase().includes(stem)
    );
    return ex ? maskInSentence(ex.content, round.word.word) : "";
  }, [round, examples]);

  // --- Pas assez de mots ---
  if (pool.length < 3) {
    return (
      <GameShell title="Mélange de lettres" onExit={onExit}>
        <EmptyState
          icon={Shuffle}
          title="Pas assez de mots"
          description="Il faut au moins 3 fiches avec un mot simple (4 à 12 lettres, sans espace ni tiret) et une traduction."
        />
      </GameShell>
    );
  }

  // --- Préparation ---
  if (phase === "setup") {
    return (
      <GameShell title="Mélange de lettres" onExit={onExit}>
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-1">
            <p className="font-semibold">Remettez les lettres dans l'ordre</p>
            <p className="text-sm text-muted-foreground">
              Un mot de votre dictionnaire apparaît avec ses lettres en désordre.
              La traduction vous aide, et vous pouvez écouter le mot ou demander un indice.
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Nombre de mots</p>
            <div className="flex gap-2">
              {COUNTS.map((n) => (
                <Button
                  key={n}
                  variant={count === n ? "default" : "outline"}
                  className="flex-1"
                  onClick={() => setCount(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {pool.length} mot(s) utilisable(s) dans votre dictionnaire. Les moins
              maîtrisés sortent en priorité.
            </p>
          </div>
          <Button className="w-full h-11" onClick={start}>
            <Shuffle className="h-4 w-4" /> Commencer
          </Button>
        </div>
      </GameShell>
    );
  }

  // --- Résultat ---
  if (phase === "done") {
    const okCount = results.filter((r) => r.ok).length;
    const first = results.filter((r) => r.firstTry).length;
    return (
      <GameShell title="Mélange de lettres" onExit={onExit}>
        <div className="space-y-3">
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 text-center space-y-1"
          >
            <p className="text-4xl font-bold tabular-nums">
              {okCount} / {rounds.length}
            </p>
            <p className="text-sm text-muted-foreground">
              mots retrouvés, dont {first} du premier coup et sans indice
            </p>
          </motion.div>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div key={i} className="rounded-lg border bg-card p-2.5 flex items-center gap-3">
                <span
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
                    r.ok ? "bg-emerald-500" : "bg-rose-500"
                  )}
                >
                  {r.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium break-words">{r.word}</p>
                  <p className="text-xs text-muted-foreground break-words">
                    {r.translation}
                    {r.hints > 0 ? ` · ${r.hints} indice(s)` : ""}
                  </p>
                </div>
                <SpeakButton text={r.word} size="sm" />
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onExit}>
              Retour
            </Button>
            <Button className="flex-1" onClick={() => setPhase("setup")}>
              <RefreshCw className="h-4 w-4" /> Rejouer
            </Button>
          </div>
        </div>
      </GameShell>
    );
  }

  // --- Jeu ---
  const usedIds = new Set(slots.filter((s): s is number => s !== null));
  const n = round.letters.length;

  return (
    <GameShell
      title="Mélange de lettres"
      onExit={onExit}
      right={
        <span className="text-xs text-muted-foreground tabular-nums">
          {idx + 1} / {rounds.length}
        </span>
      }
    >
      <div className="space-y-4">
        {/* Indices */}
        <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-2 text-center">
          <p className="text-xs text-muted-foreground">Retrouvez le mot qui signifie</p>
          <p className="text-2xl font-bold break-words">{round.word.translation}</p>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <Badge variant="outline" className="capitalize">
              {round.word.partOfSpeech}
            </Badge>
            <Badge variant="outline">{n} lettres</Badge>
            {!hidePhonetic && <Phonetic value={round.word.phonetic} className="text-sm" />}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            <SpeakButton text={round.word.word} size="sm" label="Écouter le mot" />
            {exampleSentence && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2 text-xs"
                onClick={() => setShowExample((v) => !v)}
              >
                <Eye className="h-3.5 w-3.5" />
                {showExample ? "Masquer l'exemple" : "Voir un exemple"}
              </Button>
            )}
          </div>
          {showExample && exampleSentence && (
            <p className="text-sm text-muted-foreground break-words">{exampleSentence}</p>
          )}
        </div>

        {/* Cases de réponse */}
        <motion.div
          key={`${idx}-${tries}`}
          animate={wrong ? { x: [0, -8, 8, -6, 6, 0] } : { x: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-wrap items-center justify-center gap-1.5"
        >
          {slots.map((id, i) => {
            const ch = id !== null ? tiles[id].ch : "";
            return (
              <button
                key={i}
                onClick={() => removeSlot(i)}
                disabled={!!outcome || locked[i] || id === null}
                aria-label={ch ? `Retirer la lettre ${ch}` : "Case vide"}
                className={cn(
                  "flex h-12 w-9 items-center justify-center rounded-lg border-2 text-xl font-bold transition-colors",
                  id === null && "border-dashed bg-muted/40",
                  id !== null && !locked[i] && "bg-card border-primary/50",
                  locked[i] && "bg-amber-100 border-amber-400 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200",
                  outcome === "solved" &&
                    "bg-emerald-100 border-emerald-500 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
                  outcome === "skipped" &&
                    "bg-rose-100 border-rose-400 text-rose-800 dark:bg-rose-900/30 dark:text-rose-200",
                  wrong && id !== null && !locked[i] && "border-destructive"
                )}
              >
                {outcome === "skipped" ? round.letters[i] : ch}
              </button>
            );
          })}
        </motion.div>

        {wrong && !outcome && (
          <p className="text-center text-sm text-destructive">
            Ce n'est pas le bon mot. Touchez une lettre pour la retirer.
          </p>
        )}

        {/* Lettres disponibles */}
        {!outcome && (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {tiles.map((t) => {
              const used = usedIds.has(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => placeTile(t.id)}
                  disabled={used}
                  className={cn(
                    "flex h-12 w-11 items-center justify-center rounded-lg border bg-card text-xl font-bold shadow-sm transition-all active:scale-95",
                    used ? "opacity-15" : "hover:border-primary/60"
                  )}
                >
                  {t.ch}
                </button>
              );
            })}
          </div>
        )}

        {/* Résultat de la question */}
        {outcome && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-xl border-2 p-3 space-y-1 text-center",
              outcome === "solved"
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                : "border-rose-400/60 bg-rose-50 dark:bg-rose-900/20"
            )}
          >
            <p className="font-semibold">
              {outcome === "solved" ? "Bravo !" : "La réponse était :"}
            </p>
            <p className="text-xl font-bold flex items-center justify-center gap-1.5 break-words">
              {round.word.word}
              <SpeakButton text={round.word.word} size="sm" />
            </p>
            {!hidePhonetic && <Phonetic value={round.word.phonetic} className="block" />}
          </motion.div>
        )}

        {/* Actions */}
        {!outcome ? (
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={clearAll}>
              <Eraser className="h-4 w-4" /> Vider
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={giveHint}
              disabled={hintsUsed >= MAX_HINTS}
            >
              <Lightbulb className="h-4 w-4" /> Indice ({hintsUsed}/{MAX_HINTS})
            </Button>
            <Button variant="ghost" className="flex-1" onClick={skip}>
              Passer
            </Button>
          </div>
        ) : (
          <Button className="w-full h-11" onClick={next}>
            {idx + 1 >= rounds.length ? "Voir le résultat" : "Mot suivant"}
          </Button>
        )}
      </div>
    </GameShell>
  );
}
