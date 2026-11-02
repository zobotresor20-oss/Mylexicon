// ============================================================================
// Assistant IA : génération de fiches de vocabulaire.
// Le navigateur n'a jamais la clé Gemini : il appelle la route /api/generate,
// qui vérifie le code d'accès puis interroge Gemini côté serveur.
// ----------------------------------------------------------------------------

import type { PartOfSpeech, Register } from "./types";
import { useLexicon } from "./store";

export interface GeneratedElement {
  content: string;
  translation: string;
  example: { content: string; translation: string };
}

export interface GeneratedEntry {
  word: string;
  translation: string;
  phonetic: string;
  partOfSpeech: PartOfSpeech;
  register: Register | "";
  context: string;
  notes: string;
  tags: string[];
  chunks: GeneratedElement[];
  collocations: GeneratedElement[];
  expressions: GeneratedElement[];
}

export type AiErrorKind =
  | "no-code"
  | "offline"
  | "auth"
  | "quota"
  | "not-english"
  | "server"
  | "network";

export class AiError extends Error {
  kind: AiErrorKind;
  constructor(kind: AiErrorKind, message: string) {
    super(message);
    this.kind = kind;
  }
}

// Le code d'accès reste dans un espace séparé : il ne doit jamais apparaître
// dans les sauvegardes JSON exportées.
const CODE_KEY = "mylexicon-ai-code";

export function getAccessCode(): string {
  try {
    return localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function setAccessCode(code: string): void {
  try {
    if (code) localStorage.setItem(CODE_KEY, code);
    else localStorage.removeItem(CODE_KEY);
  } catch {
    /* stockage indisponible */
  }
}

async function callApi(payload: Record<string, unknown>): Promise<Response> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    throw new AiError(
      "offline",
      "Pas de connexion internet. La génération par l'IA demande d'être en ligne."
    );
  }
  try {
    return await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new AiError("network", "Impossible de joindre le serveur. Vérifiez votre connexion.");
  }
}

async function readError(res: Response): Promise<AiError> {
  let kind: AiErrorKind = "server";
  let message = "Une erreur est survenue. Réessayez.";
  try {
    const data = await res.json();
    if (data?.error) message = String(data.error);
    if (
      data?.kind === "auth" ||
      data?.kind === "quota" ||
      data?.kind === "not-english"
    ) {
      kind = data.kind;
    }
  } catch {
    /* corps illisible */
  }
  if (res.status === 401) kind = "auth";
  if (res.status === 429) kind = "quota";
  return new AiError(kind, message);
}

/** Vérifie le code d'accès sans consommer de quota Gemini. */
export async function checkAccessCode(code: string): Promise<void> {
  const res = await callApi({ action: "check", code });
  if (!res.ok) throw await readError(res);
}

/** Demande à l'IA la fiche complète d'un mot ou d'une expression. */
export async function generateEntry(word: string): Promise<GeneratedEntry> {
  const code = getAccessCode();
  if (!code) {
    throw new AiError(
      "no-code",
      "Ajoutez d'abord votre code d'accès dans Réglages, section Assistant IA."
    );
  }
  // La transcription phonétique suit l'accent choisi dans les Réglages.
  const accent = useLexicon.getState().settings.accent;
  const res = await callApi({ word, code, accent });
  if (!res.ok) throw await readError(res);
  const data = await res.json();
  return data.entry as GeneratedEntry;
}

/** Enregistre une fiche générée (mot, éléments et exemples) dans le dictionnaire. */
export function saveGeneratedEntry(entry: GeneratedEntry): string {
  const s = useLexicon.getState();
  const wordId = s.addWord({
    word: entry.word,
    translation: entry.translation,
    phonetic: entry.phonetic,
    partOfSpeech: entry.partOfSpeech,
    context: entry.context,
    register: entry.register,
    notes: entry.notes,
    tags: Array.from(new Set([...entry.tags, "ia"])),
  });
  const groups = [
    ["chunk", entry.chunks],
    ["collocation", entry.collocations],
    ["expression", entry.expressions],
  ] as const;
  for (const [type, list] of groups) {
    for (const el of list) {
      const cardId = s.addCard({
        wordId,
        type,
        content: el.content,
        translation: el.translation,
      });
      s.addExample({
        wordId,
        parentId: cardId,
        parentType: type,
        content: el.example.content,
        translation: el.example.translation,
      });
    }
  }
  return wordId;
}

/** Découpe une liste collée (une entrée par ligne, ou séparées par , ou ;). */
export function parseWordList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n;,]+/)) {
    const w = part.replace(/\s+/g, " ").trim().slice(0, 80);
    if (!w) continue;
    const key = w.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}
