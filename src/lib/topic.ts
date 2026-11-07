// ============================================================================
// Sujet aléatoire : choix des mots, sujets de secours hors ligne et
// détection des mots utilisés dans le texte de l'apprenant.
// ----------------------------------------------------------------------------

import type { Card, Word } from "./types";
import { DAY_MS } from "./sm2";

/**
 * Tire `count` mots de façon aléatoire, en favorisant ceux qui ont besoin
 * d'être retravaillés : maîtrise faible, cartes à réviser, ajoutés récemment.
 */
export function pickTopicWords(
  words: Word[],
  cards: Card[],
  count: number,
  exclude: Set<string> = new Set()
): Word[] {
  const now = Date.now();
  const pool = words
    .filter((w) => w.translation.trim() && !exclude.has(w.id))
    .map((w) => {
      const wc = cards.filter((c) => c.wordId === w.id);
      const avg = wc.length ? wc.reduce((s, c) => s + c.mastery, 0) / wc.length : 0;
      const due = wc.some((c) => c.nextReview <= now);
      const recent = now - w.createdAt < 7 * DAY_MS;
      return { w, weight: 1 + (5 - avg) + (due ? 2 : 0) + (recent ? 1 : 0) };
    });

  const picked: Word[] = [];
  while (picked.length < count && pool.length > 0) {
    const total = pool.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    const [chosen] = pool.splice(Math.min(idx, pool.length - 1), 1);
    picked.push(chosen.w);
  }
  return picked;
}

/** Sujets de secours (sans internet ou si l'IA est indisponible). */
export const FALLBACK_TOPICS: { en: string; fr: string }[] = [
  { en: "Describe a day when everything went wrong, and how you reacted.", fr: "Décrivez une journée où tout s'est mal passé, et comment vous avez réagi." },
  { en: "Tell the story of a decision you hesitated over for a long time.", fr: "Racontez une décision sur laquelle vous avez longtemps hésité." },
  { en: "Explain to a friend why you would (or would not) recommend your city.", fr: "Expliquez à un ami pourquoi vous recommanderiez (ou non) votre ville." },
  { en: "Describe someone who has influenced you, and what you learned from them.", fr: "Décrivez une personne qui vous a influencé et ce qu'elle vous a appris." },
  { en: "Talk about a time you had to convince someone to change their mind.", fr: "Parlez d'une fois où vous avez dû faire changer d'avis quelqu'un." },
  { en: "Imagine you are giving advice to a younger student. What do you tell them?", fr: "Imaginez que vous conseillez un étudiant plus jeune. Que lui dites-vous ?" },
  { en: "Describe a trip, real or imaginary, that you will never forget.", fr: "Décrivez un voyage, réel ou imaginaire, que vous n'oublierez jamais." },
  { en: "Tell a story about a mistake that taught you something important.", fr: "Racontez une erreur qui vous a appris quelque chose d'important." },
  { en: "Describe your ideal weekend and explain why it would be perfect.", fr: "Décrivez votre week-end idéal et expliquez pourquoi il serait parfait." },
  { en: "Talk about a skill you would like to master and how you would learn it.", fr: "Parlez d'une compétence que vous aimeriez maîtriser et de la façon de l'apprendre." },
  { en: "Describe a problem in your neighbourhood and suggest how to solve it.", fr: "Décrivez un problème de votre quartier et proposez une solution." },
  { en: "Tell the story of a meal or a celebration you remember very clearly.", fr: "Racontez un repas ou une fête dont vous vous souvenez très bien." },
  { en: "Explain a situation where being patient made a real difference.", fr: "Expliquez une situation où la patience a fait toute la différence." },
  { en: "Describe how technology has changed the way you study or work.", fr: "Décrivez comment la technologie a changé votre façon d'étudier ou de travailler." },
  { en: "Talk about a time when you helped someone, or someone helped you.", fr: "Parlez d'une fois où vous avez aidé quelqu'un, ou où quelqu'un vous a aidé." },
  { en: "Describe an object that has a special meaning for you and why.", fr: "Décrivez un objet qui a une signification particulière pour vous, et pourquoi." },
];

export function randomFallbackTopic(previousEn?: string): { en: string; fr: string } {
  const options = FALLBACK_TOPICS.filter((t) => t.en !== previousEn);
  return options[Math.floor(Math.random() * options.length)];
}

// ---------------------------------------------------------------------------
// Détection des mots utilisés (approximative, hors ligne)
// ---------------------------------------------------------------------------

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stemOf(token: string): string {
  return token.length >= 4 && token.endsWith("e") ? token.slice(0, -1) : token;
}

function tokenPattern(rawToken: string): string {
  const t = rawToken.toLowerCase().replace(/[’‘]/g, "'");
  if (t === "one's" || t === "someone's" || t === "somebody's") {
    return "(?:my|your|his|her|its|our|their|one's|someone's|somebody's)";
  }
  const stem = escapeRegex(stemOf(t));
  if (t.length <= 3) return `${stem}(?:s|es|ed|d|ing)?`;
  // accepte les terminaisons courantes : -s, -ed, -ing, -ly, -ness, -ment…
  return `${stem}[a-z]{0,5}`;
}

/**
 * Renvoie les identifiants des mots cibles que le texte semble contenir,
 * sous une forme proche (pluriel, conjugaison, adverbe…). C'est une estimation :
 * les formes irrégulières (go / went) ne sont pas reconnues ici, la correction
 * par l'IA les confirme.
 */
export function findUsedWords(text: string, targets: Word[]): Set<string> {
  const hay = text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9'\-\s]/g, " ");
  const found = new Set<string>();
  for (const w of targets) {
    const tokens = w.word
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (tokens.length === 0) continue;
    const pattern = tokens.map(tokenPattern).join("\\s+");
    try {
      if (new RegExp(`(?:^|\\s)${pattern}(?=\\s|$)`).test(hay)) found.add(w.id);
    } catch {
      /* motif invalide : on ignore ce mot */
    }
  }
  return found;
}
