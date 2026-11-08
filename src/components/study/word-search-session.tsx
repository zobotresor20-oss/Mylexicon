"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Check, Grid3x3, Lightbulb, RefreshCw, Eye, X } from "lucide-react";
import { toast } from "sonner";

import { useLexicon } from "@/lib/store";
import { pickTopicWords } from "@/lib/topic";
import {
  SEARCH_LEVELS,
  buildWordSearch,
  isSearchWord,
  lineCells,
  type Level,
  type WordSearch,
} from "@/lib/word-games";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/shared/empty-state";
import { SpeakButton } from "@/components/shared/speak-button";
import { GameShell } from "@/components/study/game-shell";

type Cell = [number, number];

// Une couleur par mot trouvé.
const COLORS = [
  "bg-emerald-300/70 dark:bg-emerald-500/50",
  "bg-sky-300/70 dark:bg-sky-500/50",
  "bg-amber-300/70 dark:bg-amber-500/50",
  "bg-rose-300/70 dark:bg-rose-500/50",
  "bg-violet-300/70 dark:bg-violet-500/50",
  "bg-teal-300/70 dark:bg-teal-500/50",
  "bg-orange-300/70 dark:bg-orange-500/50",
  "bg-fuchsia-300/70 dark:bg-fuchsia-500/50",
];

const LEVELS: Level[] = ["easy", "medium", "hard"];

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function WordSearchSession({ onExit }: { onExit: () => void }) {
  const words = useLexicon((s) => s.words);
  const cards = useLexicon((s) => s.cards);
  const addStudySession = useLexicon((s) => s.addStudySession);
  const recordDailyActivity = useLexicon((s) => s.recordDailyActivity);

  const [phase, setPhase] = useState<"setup" | "play" | "done">("setup");
  const [level, setLevel] = useState<Level>("easy");
  const [puzzle, setPuzzle] = useState<WordSearch | null>(null);
  const [found, setFound] = useState<Record<string, number>>({});
  const [selection, setSelection] = useState<Cell[]>([]);
  const [anchor, setAnchor] = useState<Cell | null>(null);
  const [hint, setHint] = useState<{ id: string; cell: Cell } | null>(null);
  const [hints, setHints] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [gaveUp, setGaveUp] = useState(false);

  const dragStart = useRef<Cell | null>(null);
  const selRef = useRef<Cell[]>([]);
  const startRef = useRef(0);

  function updateSelection(next: Cell[]) {
    selRef.current = next;
    setSelection(next);
  }

  // Chronomètre.
  useEffect(() => {
    if (phase !== "play") return;
    const id = setInterval(
      () => setElapsed(Math.round((Date.now() - startRef.current) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [phase]);

  const poolSizes = useMemo(() => {
    const out = {} as Record<Level, number>;
    for (const l of LEVELS) {
      out[l] = words.filter((w) => isSearchWord(w, SEARCH_LEVELS[l].size)).length;
    }
    return out;
  }, [words]);

  const foundMap = useMemo(() => {
    const m = new Map<string, number>();
    if (!puzzle) return m;
    for (const p of puzzle.placements) {
      const idx = found[p.id];
      if (idx === undefined) continue;
      for (const [r, c] of p.cells) m.set(`${r},${c}`, idx);
    }
    return m;
  }, [puzzle, found]);

  const missedMap = useMemo(() => {
    const m = new Set<string>();
    if (!puzzle || phase !== "done") return m;
    for (const p of puzzle.placements) {
      if (found[p.id] !== undefined) continue;
      for (const [r, c] of p.cells) m.add(`${r},${c}`);
    }
    return m;
  }, [puzzle, found, phase]);

  const selSet = useMemo(
    () => new Set(selection.map(([r, c]) => `${r},${c}`)),
    [selection]
  );

  function start() {
    const cfg = SEARCH_LEVELS[level];
    const pool = words.filter((w) => isSearchWord(w, cfg.size));
    // On tire quelques mots de plus que nécessaire : certains peuvent ne pas se placer.
    const candidates = pickTopicWords(pool, cards, Math.min(pool.length, cfg.count + 4));
    const p = buildWordSearch(candidates, level);
    if (!p) {
      toast.error("Pas assez de mots adaptés à ce niveau.");
      return;
    }
    setPuzzle(p);
    setFound({});
    updateSelection([]);
    setAnchor(null);
    setHint(null);
    setHints(0);
    setElapsed(0);
    setGaveUp(false);
    startRef.current = Date.now();
    setPhase("play");
  }

  function finish(finalFound: Record<string, number>, gave: boolean) {
    if (!puzzle) return;
    const count = Object.keys(finalFound).length;
    setElapsed(Math.round((Date.now() - startRef.current) / 1000));
    setGaveUp(gave);
    setPhase("done");
    updateSelection([]);
    setAnchor(null);
    recordDailyActivity(0, count);
    addStudySession({
      date: startRef.current,
      durationSec: Math.round((Date.now() - startRef.current) / 1000),
      correct: count,
      total: puzzle.placements.length,
      type: "word-search",
    });
  }

  function evaluate(cells: Cell[]) {
    if (!puzzle) return;
    const letters = cells.map(([r, c]) => puzzle.grid[r][c]).join("");
    const reversed = letters.split("").reverse().join("");
    const hit = puzzle.placements.find(
      (p) => found[p.id] === undefined && (p.letters === letters || p.letters === reversed)
    );
    updateSelection([]);
    setAnchor(null);
    if (!hit) return;
    const next = { ...found, [hit.id]: puzzle.placements.indexOf(hit) };
    setFound(next);
    if (hint?.id === hit.id) setHint(null);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(25);
    if (Object.keys(next).length === puzzle.placements.length) finish(next, false);
  }

  function cellAt(x: number, y: number): Cell | null {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const cell = el?.closest<HTMLElement>("[data-cell]");
    if (!cell) return null;
    return [Number(cell.dataset.r), Number(cell.dataset.c)];
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (phase !== "play") return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    // Deuxième touche après une première touche : on valide la ligne entre les deux.
    if (anchor) {
      const line = lineCells(anchor, cell);
      if (line && line.length > 1) {
        evaluate(line);
        return;
      }
      setAnchor(null);
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStart.current = cell;
    updateSelection([cell]);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragStart.current) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (!cell) return;
    const line = lineCells(dragStart.current, cell);
    if (line) updateSelection(line);
  }

  function onPointerUp() {
    const start = dragStart.current;
    if (!start) return;
    dragStart.current = null;
    if (selRef.current.length <= 1) {
      // Simple touche : première case d'une sélection en deux touches.
      setAnchor(start);
      updateSelection([start]);
      return;
    }
    evaluate(selRef.current);
  }

  function onPointerCancel() {
    dragStart.current = null;
    updateSelection([]);
  }

  function giveHint() {
    if (!puzzle) return;
    const p = puzzle.placements.find((x) => found[x.id] === undefined);
    if (!p) return;
    setHint({ id: p.id, cell: p.cells[0] });
    setHints((h) => h + 1);
  }

  // --- Pas de mots utilisables ---
  if (LEVELS.every((l) => poolSizes[l] < 3)) {
    return (
      <GameShell title="Mots mêlés" onExit={onExit}>
        <EmptyState
          icon={Grid3x3}
          title="Pas assez de mots"
          description="Il faut au moins 3 fiches avec un mot simple (3 lettres ou plus, sans espace) et une traduction."
        />
      </GameShell>
    );
  }

  // --- Choix du niveau ---
  if (phase === "setup" || !puzzle) {
    return (
      <GameShell title="Mots mêlés" onExit={onExit}>
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-1">
            <p className="font-semibold">Retrouvez les mots anglais cachés</p>
            <p className="text-sm text-muted-foreground">
              La liste vous donne la traduction française : à vous de retrouver le mot
              anglais dans la grille. Glissez le doigt sur les lettres, ou touchez la
              première puis la dernière lettre.
            </p>
          </div>
          <div className="space-y-2">
            {LEVELS.map((l) => {
              const cfg = SEARCH_LEVELS[l];
              const ok = poolSizes[l] >= 3;
              return (
                <button
                  key={l}
                  disabled={!ok}
                  onClick={() => setLevel(l)}
                  className={cn(
                    "w-full text-left rounded-lg border p-3 transition-all",
                    level === l ? "border-primary bg-primary/10" : "hover:border-primary/40",
                    !ok && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <p className="font-semibold">{cfg.label}</p>
                  <p className="text-xs text-muted-foreground">{cfg.help}</p>
                  {!ok && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Pas assez de mots assez courts pour ce niveau.
                    </p>
                  )}
                </button>
              );
            })}
          </div>
          <Button
            className="w-full h-11"
            onClick={start}
            disabled={poolSizes[level] < 3}
          >
            <Grid3x3 className="h-4 w-4" /> Lancer la grille
          </Button>
          <p className="text-xs text-muted-foreground">
            Les mots les moins maîtrisés sont choisis en priorité. Les expressions de
            plusieurs mots ne sont pas utilisées.
          </p>
        </div>
      </GameShell>
    );
  }

  const size = puzzle.size;
  const foundCount = Object.keys(found).length;
  const total = puzzle.placements.length;
  const letterSize = size >= 12 ? "text-xs" : size >= 10 ? "text-sm" : "text-base";
  const reveal = phase === "done";

  const grid = (
    <div
      className="grid gap-[3px] w-full max-w-sm mx-auto touch-none select-none"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {puzzle.grid.map((row, r) =>
        row.map((ch, c) => {
          const key = `${r},${c}`;
          const foundIdx = foundMap.get(key);
          const isSel = selSet.has(key);
          const isAnchor = anchor && anchor[0] === r && anchor[1] === c;
          const isHint = hint && hint.cell[0] === r && hint.cell[1] === c;
          const missed = missedMap.has(key);
          return (
            <div
              key={key}
              data-cell
              data-r={r}
              data-c={c}
              className={cn(
                "flex aspect-square items-center justify-center rounded-md border border-transparent bg-muted/50 font-semibold",
                letterSize,
                foundIdx !== undefined && COLORS[foundIdx % COLORS.length],
                missed && "border-dashed border-rose-500 bg-rose-100 dark:bg-rose-900/30",
                isSel && "bg-primary text-primary-foreground",
                isAnchor && "ring-2 ring-primary",
                isHint && "ring-2 ring-amber-500 animate-pulse"
              )}
            >
              {ch}
            </div>
          );
        })
      )}
    </div>
  );

  return (
    <GameShell
      title="Mots mêlés"
      onExit={onExit}
      right={
        <span className="text-xs text-muted-foreground tabular-nums">
          {fmtTime(elapsed)}
        </span>
      }
    >
      <div className="space-y-3">
        {phase === "done" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-xl border-2 p-3 space-y-1",
              gaveUp
                ? "border-amber-400/60 bg-amber-50 dark:bg-amber-900/20"
                : "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
            )}
          >
            <p className="font-semibold">
              {gaveUp ? "Solutions affichées" : "Bravo, grille terminée !"}
            </p>
            <p className="text-sm text-muted-foreground">
              {foundCount} mot(s) trouvé(s) sur {total} en {fmtTime(elapsed)}
              {hints > 0 ? `, avec ${hints} indice(s)` : ""}.
            </p>
          </motion.div>
        )}

        {grid}

        {phase === "play" && (
          <>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="tabular-nums">
                {foundCount} / {total} trouvés
              </Badge>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={giveHint}>
                  <Lightbulb className="h-4 w-4" /> Indice
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => finish(found, true)}
                >
                  <Eye className="h-4 w-4" /> Solutions
                </Button>
              </div>
            </div>
            {hint && (
              <p className="text-xs text-muted-foreground">
                La case qui clignote est la première lettre d'un mot à trouver.
              </p>
            )}
          </>
        )}

        <div className="grid grid-cols-2 gap-2">
          {puzzle.placements.map((p, i) => {
            const isFound = found[p.id] !== undefined;
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 text-sm",
                  isFound
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                    : reveal
                    ? "border-rose-400/60 bg-rose-50 dark:bg-rose-900/20"
                    : "bg-card"
                )}
              >
                {isFound || reveal ? (
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <p className="font-semibold flex items-center gap-1 break-words">
                        {isFound ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        ) : (
                          <X className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                        )}
                        {p.word}
                      </p>
                      <p className="text-xs text-muted-foreground break-words">
                        {p.translation}
                      </p>
                    </div>
                    <SpeakButton text={p.word} size="sm" />
                  </div>
                ) : (
                  <>
                    <p className="break-words">{p.translation}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.letters.length} lettres
                    </p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {phase === "done" && (
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onExit}>
              Retour
            </Button>
            <Button className="flex-1" onClick={() => setPhase("setup")}>
              <RefreshCw className="h-4 w-4" /> Rejouer
            </Button>
          </div>
        )}
      </div>
    </GameShell>
  );
}
