// ============================================================================
// Store MyLexicon — Zustand avec persistance localStorage.
// Toutes les données restent sur l'appareil, rien n'est envoyé en ligne.
// ----------------------------------------------------------------------------

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { v4 as uuid } from "uuid";

import type {
  BackupData,
  Card,
  Example,
  PartOfSpeech,
  Register,
  SearchHistoryEntry,
  Settings,
  StudySession,
  Word,
  WordStatus,
} from "./types";
import { DAY_MS, reviewSm2 } from "./sm2";
import { normalizePhonetic } from "./phonetic";

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const now = () => Date.now();

function todayStr(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** Calcule le statut d'une fiche selon ses éléments. */
function computeStatus(word: Word, cards: Card[]): WordStatus {
  if (word.status === "mastered") return "mastered";
  const wordCards = cards.filter((c) => c.wordId === word.id);
  const chunks = wordCards.filter((c) => c.type === "chunk").length;
  const collocations = wordCards.filter((c) => c.type === "collocation").length;
  const expressions = wordCards.filter((c) => c.type === "expression").length;
  const complete = chunks >= 3 && collocations >= 3 && expressions >= 3;
  if (!complete) return "incomplete";
  // Si complète et au moins une carte en apprentissage -> learning.
  if (wordCards.some((c) => c.mastery < 4)) return "learning";
  return "complete";
}

// ----------------------------------------------------------------------------
// État
// ----------------------------------------------------------------------------

interface LexiconState {
  words: Word[];
  cards: Card[];
  examples: Example[];
  studySessions: StudySession[];
  searchHistory: SearchHistoryEntry[];
  settings: Settings;

  // --- Fiches ---
  addWord: (input: NewWordInput) => string;
  updateWord: (id: string, patch: Partial<Word>) => void;
  deleteWord: (id: string) => void;
  toggleFavorite: (id: string) => void;

  // --- Cartes (chunks/collocations/expressions) ---
  addCard: (input: NewCardInput) => string;
  updateCard: (id: string, patch: Partial<Card>) => void;
  deleteCard: (id: string) => void;
  reviewCard: (id: string, quality: number) => void;

  // --- Exemples ---
  addExample: (input: NewExampleInput) => string;
  updateExample: (id: string, patch: Partial<Example>) => void;
  deleteExample: (id: string) => void;

  // --- Étude ---
  addStudySession: (s: Omit<StudySession, "id">) => void;
  recordDailyActivity: (newWords: number, reviews: number) => void;
  resetDailyCountersIfNeeded: () => void;

  // --- Recherche ---
  addSearchHistory: (query: string) => void;
  clearSearchHistory: () => void;

  // --- Réglages ---
  updateSettings: (patch: Partial<Settings>) => void;

  // --- Sauvegarde / restauration ---
  buildBackup: () => BackupData;
  restoreBackup: (data: BackupData, replace: boolean) => void;
  loadDemoData: () => void;
  clearAll: () => void;
}

export interface NewWordInput {
  word: string;
  translation: string;
  phonetic?: string;
  partOfSpeech: PartOfSpeech;
  context: string;
  register: Register | "";
  notes: string;
  tags: string[];
}

export interface NewCardInput {
  wordId: string;
  type: Card["type"];
  content: string;
  translation: string;
}

export interface NewExampleInput {
  wordId: string;
  parentId: string;
  parentType: Example["parentType"];
  content: string;
  translation: string;
  personal?: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "britannique",
  fontScale: 1,
  speechRate: 0.95,
  dailyNewWordsGoal: 3,
  dailyReviewsGoal: 15,
  reminderEnabled: false,
  reminderHour: 20,
  reminderMinute: 0,
  lastActiveDay: "",
  streak: 0,
  newWordsToday: 0,
  reviewsToday: 0,
  dailyCountersDate: "",
};

// ----------------------------------------------------------------------------
// Store
// ----------------------------------------------------------------------------

export const useLexicon = create<LexiconState>()(
  persist(
    (set, get) => ({
      words: [],
      cards: [],
      examples: [],
      studySessions: [],
      searchHistory: [],
      settings: DEFAULT_SETTINGS,

      // --- Fiches ---

      addWord: (input) => {
        const id = uuid();
        const t = now();
        const word: Word = {
          id,
          word: input.word.trim(),
          translation: input.translation.trim(),
          phonetic: normalizePhonetic(input.phonetic),
          partOfSpeech: input.partOfSpeech,
          context: input.context.trim(),
          register: input.register,
          notes: input.notes.trim(),
          tags: input.tags,
          status: "incomplete",
          isFavorite: false,
          createdAt: t,
          updatedAt: t,
        };
        set((s) => ({ words: [word, ...s.words] }));
        return id;
      },

      updateWord: (id, patch) =>
        set((s) => ({
          words: s.words.map((w) => {
            if (w.id !== id) return w;
            const updated: Word = { ...w, ...patch, updatedAt: now() };
            updated.status = computeStatus(updated, s.cards);
            return updated;
          }),
        })),

      deleteWord: (id) =>
        set((s) => ({
          words: s.words.filter((w) => w.id !== id),
          cards: s.cards.filter((c) => c.wordId !== id),
          examples: s.examples.filter((e) => e.wordId !== id),
        })),

      toggleFavorite: (id) =>
        set((s) => ({
          words: s.words.map((w) =>
            w.id === id ? { ...w, isFavorite: !w.isFavorite, updatedAt: now() } : w
          ),
        })),

      // --- Cartes ---

      addCard: (input) => {
        const id = uuid();
        const t = now();
        const card: Card = {
          id,
          wordId: input.wordId,
          type: input.type,
          content: input.content.trim(),
          translation: input.translation.trim(),
          mastery: 0,
          easeFactor: 2.5,
          interval: 0,
          repetitions: 0,
          lastReviewed: null,
          nextReview: t,
          errorCount: 0,
          createdAt: t,
          updatedAt: t,
        };
        set((s) => {
          const words = s.words.map((w) => {
            if (w.id !== input.wordId) return w;
            const updated: Word = { ...w, updatedAt: now() };
            updated.status = computeStatus(updated, [...s.cards, card]);
            return updated;
          });
          return { cards: [...s.cards, card], words };
        });
        return id;
      },

      updateCard: (id, patch) =>
        set((s) => ({
          cards: s.cards.map((c) =>
            c.id === id ? { ...c, ...patch, updatedAt: now() } : c
          ),
        })),

      deleteCard: (id) =>
        set((s) => {
          const card = s.cards.find((c) => c.id === id);
          const cards = s.cards.filter((c) => c.id !== id);
          const examples = s.examples.filter((e) => e.parentId !== id);
          let words = s.words;
          if (card) {
            words = s.words.map((w) => {
              if (w.id !== card.wordId) return w;
              const updated: Word = { ...w, updatedAt: now() };
              updated.status = computeStatus(updated, cards);
              return updated;
            });
          }
          return { cards, examples, words };
        }),

      reviewCard: (id, quality) =>
        set((s) => ({
          cards: s.cards.map((c) => {
            if (c.id !== id) return c;
            const next = reviewSm2(
              {
                easeFactor: c.easeFactor,
                interval: c.interval,
                repetitions: c.repetitions,
                lastReviewed: c.lastReviewed,
                nextReview: c.nextReview,
              },
              quality
            );
            const mastery =
              next.repetitions === 0
                ? 0
                : next.interval < 3
                ? 1
                : next.interval < 7
                ? 2
                : next.interval < 21
                ? 3
                : next.interval < 60
                ? 4
                : 5;
            const errorCount = quality < 3 ? c.errorCount + 1 : c.errorCount;
            return {
              ...c,
              ...next,
              mastery,
              errorCount,
              updatedAt: now(),
            };
          }),
        })),

      // --- Exemples ---

      addExample: (input) => {
        const id = uuid();
        const t = now();
        const example: Example = {
          id,
          wordId: input.wordId,
          parentId: input.parentId,
          parentType: input.parentType,
          content: input.content.trim(),
          translation: input.translation.trim(),
          personal: input.personal ?? false,
          createdAt: t,
          updatedAt: t,
        };
        set((s) => ({ examples: [...s.examples, example] }));
        return id;
      },

      updateExample: (id, patch) =>
        set((s) => ({
          examples: s.examples.map((e) =>
            e.id === id ? { ...e, ...patch, updatedAt: now() } : e
          ),
        })),

      deleteExample: (id) =>
        set((s) => ({ examples: s.examples.filter((e) => e.id !== id) })),

      // --- Étude ---

      addStudySession: (sess) =>
        set((s) => ({ studySessions: [{ ...sess, id: uuid() }, ...s.studySessions] })),

      recordDailyActivity: (newWords, reviews) =>
        set((s) => {
          const today = todayStr();
          const settings = { ...s.settings };
          if (settings.dailyCountersDate !== today) {
            settings.dailyCountersDate = today;
            settings.newWordsToday = 0;
            settings.reviewsToday = 0;
          }
          settings.newWordsToday += newWords;
          settings.reviewsToday += reviews;

          // Série de jours consécutifs.
          if (settings.lastActiveDay !== today) {
            const yesterday = todayStr(new Date(Date.now() - DAY_MS));
            if (settings.lastActiveDay === yesterday) {
              settings.streak += 1;
            } else if (settings.lastActiveDay === "") {
              settings.streak = 1;
            } else {
              settings.streak = 1;
            }
            settings.lastActiveDay = today;
          }
          return { settings };
        }),

      resetDailyCountersIfNeeded: () =>
        set((s) => {
          const today = todayStr();
          if (s.settings.dailyCountersDate === today) return s;
          return {
            settings: {
              ...s.settings,
              dailyCountersDate: today,
              newWordsToday: 0,
              reviewsToday: 0,
            },
          };
        }),

      // --- Recherche ---

      addSearchHistory: (query) => {
        const q = query.trim();
        if (!q) return;
        set((s) => {
          const filtered = s.searchHistory.filter(
            (h) => h.query.toLowerCase() !== q.toLowerCase()
          );
          const entry: SearchHistoryEntry = {
            id: uuid(),
            query: q,
            timestamp: now(),
          };
          return { searchHistory: [entry, ...filtered].slice(0, 20) };
        });
      },

      clearSearchHistory: () => set({ searchHistory: [] }),

      // --- Réglages ---

      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),

      // --- Sauvegarde / restauration ---

      buildBackup: () => {
        const s = get();
        return {
          app: "MyLexicon",
          version: 1,
          exportedAt: now(),
          words: s.words,
          cards: s.cards,
          examples: s.examples,
          studySessions: s.studySessions,
          searchHistory: s.searchHistory,
          settings: s.settings,
        };
      },

      restoreBackup: (data, replace) =>
        set((s) => {
          if (replace) {
            return {
              words: data.words ?? [],
              cards: data.cards ?? [],
              examples: data.examples ?? [],
              studySessions: data.studySessions ?? [],
              searchHistory: data.searchHistory ?? [],
              settings: { ...DEFAULT_SETTINGS, ...data.settings },
            };
          }
          // Fusion : on ajoute sans écraser les existants (par id).
          const existingIds = new Set<string>();
          s.words.forEach((w) => existingIds.add(w.id));
          s.cards.forEach((c) => existingIds.add(c.id));
          s.examples.forEach((e) => existingIds.add(e.id));
          return {
            words: [...s.words, ...(data.words ?? []).filter((w) => !existingIds.has(w.id))],
            cards: [...s.cards, ...(data.cards ?? []).filter((c) => !existingIds.has(c.id))],
            examples: [
              ...s.examples,
              ...(data.examples ?? []).filter((e) => !existingIds.has(e.id)),
            ],
            studySessions: [...s.studySessions, ...(data.studySessions ?? [])],
            searchHistory: [...s.searchHistory, ...(data.searchHistory ?? [])].slice(0, 20),
            settings: { ...DEFAULT_SETTINGS, ...data.settings },
          };
        }),

      loadDemoData: () => {
        // Les données de démo sont chargées via un module dédié pour éviter
        // d'alourdir le store. On délègue à loadDemoIntoStore.
        // (implémenté dans demo-data.ts -> appelé par le composant Réglages)
      },

      clearAll: () =>
        set({
          words: [],
          cards: [],
          examples: [],
          studySessions: [],
          searchHistory: [],
          settings: DEFAULT_SETTINGS,
        }),
    }),
    {
      name: "mylexicon-store",
      storage: createJSONStorage(() => localStorage),
      version: 1,
    }
  )
);

// ----------------------------------------------------------------------------
// Sélecteurs utilitaires
// ----------------------------------------------------------------------------

/** Renvoie les cartes dues pour révision aujourd'hui. */
export function selectDueCards(state: LexiconState): Card[] {
  const t = now();
  return state.cards.filter((c) => c.nextReview <= t);
}

/** Renvoie les cartes marquées en erreur (errorCount > 0). */
export function selectErrorCards(state: LexiconState): Card[] {
  return state.cards.filter((c) => c.errorCount > 0);
}

/** Indique ce qui manque à une fiche pour être complète. */
export function missingForWord(
  word: Word,
  cards: Card[]
): { chunks: number; collocations: number; expressions: number } {
  const wordCards = cards.filter((c) => c.wordId === word.id);
  return {
    chunks: Math.max(0, 3 - wordCards.filter((c) => c.type === "chunk").length),
    collocations: Math.max(
      0,
      3 - wordCards.filter((c) => c.type === "collocation").length
    ),
    expressions: Math.max(
      0,
      3 - wordCards.filter((c) => c.type === "expression").length
    ),
  };
}
