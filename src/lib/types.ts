// ============================================================================
// MyLexicon — Types du modèle de données
// Dictionnaire personnel anglais <-> français, 100 % local.
// ============================================================================

/** Nature grammaticale d'un mot. */
export type PartOfSpeech =
  | "nom"
  | "verbe"
  | "adjectif"
  | "adverbe"
  | "préposition"
  | "conjonction"
  | "pronom"
  | "déterminant"
  | "interjection"
  | "expression"
  | "autre";

/** Registre / contexte d'utilisation. */
export type Register =
  | "familier"
  | "courant"
  | "soutenu"
  | "professionnel"
  | "académique"
  | "technique";

/** Statut de complétude d'une fiche. */
export type WordStatus = "incomplete" | "complete" | "learning" | "mastered";

/** Type d'élément rattaché à un mot. */
export type ElementType = "chunk" | "collocation" | "expression";

/** Direction d'une carte pour les flashcards. */
export type CardDirection = "en-fr" | "fr-en";

/** Accent de prononciation. */
export type Accent = "britannique" | "américain";

// ----------------------------------------------------------------------------
// Cartes : chunks, collocations, expressions.
// Toutes partagent la même structure + champs SM-2 pour la répétition espacée.
// ----------------------------------------------------------------------------

export interface Card {
  id: string;
  wordId: string;
  type: ElementType;
  content: string; // anglais
  translation: string; // français (obligatoire)
  /** Niveau de maîtrise 0 (nouveau) -> 5 (maîtrisé). */
  mastery: number;
  // --- Champs de l'algorithme SM-2 ---
  easeFactor: number; // facteur de difficulté, >= 1.3
  interval: number; // intervalle en jours
  repetitions: number; // nombre de répétitions réussies consécutives
  lastReviewed: number | null; // timestamp ms
  nextReview: number; // timestamp ms, prochain rappel
  /** Nombre de fois où l'élément a été raté (mode "mes erreurs"). */
  errorCount: number;
  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------------------------
// Phrase d'exemple. Rattachée à un mot ou à l'un de ses éléments.
// N'a pas de fiche propre.
// ----------------------------------------------------------------------------

export type ExampleParentType = "word" | "chunk" | "collocation" | "expression";

export interface Example {
  id: string;
  wordId: string;
  parentId: string; // id du mot ou de l'élément
  parentType: ExampleParentType;
  content: string; // anglais
  translation: string; // français (obligatoire)
  /** Vrai si c'est une production personnelle de l'utilisateur. */
  personal: boolean;
  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------------------------
// Fiche de mot — élément central du dictionnaire.
// ----------------------------------------------------------------------------

export interface Word {
  id: string;
  word: string; // anglais
  translation: string; // français (obligatoire)
  /** Transcription phonétique (API), sans barres obliques. Facultative. */
  phonetic?: string;
  partOfSpeech: PartOfSpeech;
  context: string; // situation / registre libre
  register: Register | "";
  notes: string; // notes personnelles
  tags: string[]; // étiquettes libres
  status: WordStatus;
  isFavorite: boolean;
  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------------------------
// Suivi d'étude.
// ----------------------------------------------------------------------------

export interface StudySession {
  id: string;
  date: number; // timestamp de début
  durationSec: number;
  correct: number;
  total: number;
  type: string; // "flashcards" | "fill-blanks" | ...
}

export interface SearchHistoryEntry {
  id: string;
  query: string;
  timestamp: number;
}

// ----------------------------------------------------------------------------
// Réglages.
// ----------------------------------------------------------------------------

export interface Settings {
  theme: "light" | "dark" | "system";
  accent: Accent;
  fontScale: number; // 0.85 -> 1.3
  speechRate: number; // 0.5 -> 1.3 (vitesse de prononciation)
  /** Masquer la phonétique pendant l'étude (flashcards, rappel libre). */
  hidePhoneticInStudy?: boolean;
  dailyNewWordsGoal: number;
  dailyReviewsGoal: number;
  reminderEnabled: boolean;
  reminderHour: number; // 0-23
  reminderMinute: number; // 0-59
  /** Date du jour (YYYY-MM-DD) pour calculer la série et l'objectif. */
  lastActiveDay: string;
  streak: number;
  newWordsToday: number;
  reviewsToday: number;
  /** Date (YYYY-MM-DD) du dernier calcul des compteurs quotidiens. */
  dailyCountersDate: string;
}

// ----------------------------------------------------------------------------
// Résultat de recherche.
// ----------------------------------------------------------------------------

export interface SearchResult {
  kind: "word" | "chunk" | "collocation" | "expression" | "example";
  id: string;
  wordId: string;
  /** Texte anglais correspondant. */
  textEn: string;
  /** Texte français correspondant. */
  textFr: string;
  /** Mot d'origine (pour affichage). */
  wordLabel: string;
  wordTranslation: string;
  score: number; // pertinence
}

// ----------------------------------------------------------------------------
// Format d'export JSON (sauvegarde manuelle).
// ----------------------------------------------------------------------------

export interface BackupData {
  app: "MyLexicon";
  version: number;
  exportedAt: number;
  words: Word[];
  cards: Card[];
  examples: Example[];
  studySessions: StudySession[];
  searchHistory: SearchHistoryEntry[];
  settings: Settings;
}
