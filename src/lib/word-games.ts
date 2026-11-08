// ============================================================================
// Jeux de mots : mots mêlés (grille) et mélange de lettres (anagramme).
// Tout se fait sur l'appareil, sans internet ni IA.
// ----------------------------------------------------------------------------

import type { Word } from "./types";

/** Lettres A-Z en majuscules, sans accents, tirets ni apostrophes. */
export function normalizeLetters(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
}

/** Mot simple (sans espace) utilisable dans une grille de mots mêlés. */
export function isSearchWord(w: Word, maxLen: number): boolean {
  const t = w.word.trim();
  if (!w.translation.trim()) return false;
  if (/\s/.test(t) || !/^[A-Za-zÀ-ÿ'’-]+$/.test(t)) return false;
  const n = normalizeLetters(t).length;
  return n >= 3 && n <= maxLen;
}

/** Mot utilisable dans le jeu du mélange de lettres. */
export function isScrambleWord(w: Word): boolean {
  const t = w.word.trim();
  if (!w.translation.trim() || !/^[A-Za-z]+$/.test(t)) return false;
  return t.length >= 4 && t.length <= 12 && new Set(t.toLowerCase()).size >= 3;
}

// ---------------------------------------------------------------------------
// Mots mêlés
// ---------------------------------------------------------------------------

export type Level = "easy" | "medium" | "hard";

type Dir = [number, number];

export const SEARCH_LEVELS: Record<
  Level,
  { label: string; size: number; count: number; dirs: Dir[]; help: string }
> = {
  easy: {
    label: "Facile",
    size: 8,
    count: 4,
    dirs: [
      [0, 1],
      [1, 0],
    ],
    help: "Grille 8 × 8, 4 mots, de gauche à droite et de haut en bas",
  },
  medium: {
    label: "Moyen",
    size: 10,
    count: 6,
    dirs: [
      [0, 1],
      [1, 0],
      [1, 1],
    ],
    help: "Grille 10 × 10, 6 mots, avec des diagonales",
  },
  hard: {
    label: "Difficile",
    size: 12,
    count: 8,
    dirs: [
      [0, 1],
      [1, 0],
      [1, 1],
      [-1, 1],
      [0, -1],
      [-1, 0],
      [-1, -1],
      [1, -1],
    ],
    help: "Grille 12 × 12, 8 mots, dans tous les sens (même à l'envers)",
  },
};

export interface Placement {
  id: string;
  wordId: string;
  /** Mot tel qu'il est écrit dans la fiche. */
  word: string;
  /** Lettres du mot, en majuscules, telles qu'elles sont dans la grille. */
  letters: string;
  translation: string;
  cells: [number, number][];
}

export interface WordSearch {
  size: number;
  grid: string[][];
  placements: Placement[];
}

// Lettres de remplissage, pondérées pour ressembler à de l'anglais.
const FILL = "EEEEEEEEAAAAAIIIIOOOONNNRRRTTTSSSLLDDCUMPHGBFYWKVXZJQ";

function randInt(n: number): number {
  return Math.floor(Math.random() * n);
}

/**
 * Construit une grille avec jusqu'à `count` mots parmi `candidates`.
 * Renvoie null si moins de 3 mots ont pu être placés.
 */
export function buildWordSearch(candidates: Word[], level: Level): WordSearch | null {
  const cfg = SEARCH_LEVELS[level];
  const { size, dirs } = cfg;

  // Mots uniques (par lettres), du plus long au plus court : plus facile à placer.
  const seen = new Set<string>();
  const items = candidates
    .map((w) => ({ w, letters: normalizeLetters(w.word) }))
    .filter((x) => x.letters.length >= 3 && x.letters.length <= size)
    .filter((x) => (seen.has(x.letters) ? false : (seen.add(x.letters), true)))
    .sort((a, b) => b.letters.length - a.letters.length);

  const grid: (string | null)[][] = Array.from({ length: size }, () =>
    Array<string | null>(size).fill(null)
  );
  const placements: Placement[] = [];

  for (const item of items) {
    if (placements.length >= cfg.count) break;
    const len = item.letters.length;
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const [dr, dc] = dirs[randInt(dirs.length)];
      const r0 = randInt(size);
      const c0 = randInt(size);
      const rEnd = r0 + dr * (len - 1);
      const cEnd = c0 + dc * (len - 1);
      if (rEnd < 0 || rEnd >= size || cEnd < 0 || cEnd >= size) continue;
      const cells: [number, number][] = [];
      let ok = true;
      for (let i = 0; i < len; i++) {
        const r = r0 + dr * i;
        const c = c0 + dc * i;
        const cur = grid[r][c];
        if (cur !== null && cur !== item.letters[i]) {
          ok = false;
          break;
        }
        cells.push([r, c]);
      }
      if (!ok) continue;
      cells.forEach(([r, c], i) => {
        grid[r][c] = item.letters[i];
      });
      placements.push({
        id: `${item.w.id}-${placements.length}`,
        wordId: item.w.id,
        word: item.w.word,
        letters: item.letters,
        translation: item.w.translation,
        cells,
      });
      placed = true;
    }
  }

  if (placements.length < 3) return null;

  const filled = grid.map((row) =>
    row.map((ch) => ch ?? FILL[randInt(FILL.length)])
  );
  return { size, grid: filled, placements };
}

/** Cases alignées entre deux cases (ligne, colonne, diagonale), ou null. */
export function lineCells(
  start: [number, number],
  end: [number, number]
): [number, number][] | null {
  const dr = end[0] - start[0];
  const dc = end[1] - start[1];
  if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return null;
  const n = Math.max(Math.abs(dr), Math.abs(dc));
  const sr = Math.sign(dr);
  const sc = Math.sign(dc);
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) out.push([start[0] + sr * i, start[1] + sc * i]);
  return out;
}

// ---------------------------------------------------------------------------
// Mélange de lettres
// ---------------------------------------------------------------------------

/** Mélange les lettres d'un mot, en évitant de renvoyer le mot lui-même. */
export function shuffleLetters(letters: string): string[] {
  const original = letters.split("");
  for (let attempt = 0; attempt < 30; attempt++) {
    const a = [...original];
    for (let i = a.length - 1; i > 0; i--) {
      const j = randInt(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    if (a.join("") !== letters) return a;
  }
  return [...original].reverse();
}

/** Remplace le mot (et ses formes proches) par des tirets dans une phrase d'exemple. */
export function maskInSentence(sentence: string, word: string): string {
  const stem = word.toLowerCase().replace(/e$/, "");
  if (stem.length < 2) return sentence;
  const escaped = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return sentence.replace(new RegExp(`\\b${escaped}[a-z]{0,5}\\b`, "gi"), "_____");
}
