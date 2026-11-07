"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  X,
  Lightbulb,
  Mic,
  Square,
  Sparkles,
  Loader2,
  Dices,
  RefreshCw,
  Languages,
  CircleAlert,
  Save,
} from "lucide-react";
import { toast } from "sonner";

import type { Word } from "@/lib/types";
import { useLexicon } from "@/lib/store";
import { AiError, generateTopic, reviewText, type ReviewResult } from "@/lib/ai";
import { findUsedWords, pickTopicWords, randomFallbackTopic } from "@/lib/topic";
import { listen, recognitionAvailable } from "@/lib/speech-recognition";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { SpeakButton } from "@/components/shared/speak-button";
import { Phonetic } from "@/components/shared/phonetic";

type Phase = "setup" | "play" | "result";

interface Topic {
  en: string;
  fr: string;
  hint: string;
  /** Vrai si le sujet vient de la liste de secours (sans lien avec les mots). */
  fallback: boolean;
}

const COUNTS = [3, 5, 8];

function Shell({
  title,
  onExit,
  children,
}: {
  title: string;
  onExit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2.5 bg-background/80 backdrop-blur sticky top-0 z-10 border-b">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onExit}
            aria-label="Retour"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold flex-1 truncate">{title}</h1>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3">
        {children}
        <div className="h-24" />
      </div>
    </div>
  );
}

export function TopicSession({ onExit }: { onExit: () => void }) {
  const words = useLexicon((s) => s.words);
  const cards = useLexicon((s) => s.cards);
  const accent = useLexicon((s) => s.settings.accent);
  const hidePhonetic = useLexicon((s) => !!s.settings.hidePhoneticInStudy);
  const addExample = useLexicon((s) => s.addExample);
  const addStudySession = useLexicon((s) => s.addStudySession);
  const recordDailyActivity = useLexicon((s) => s.recordDailyActivity);

  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(3);
  const [targets, setTargets] = useState<Word[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loadingTopic, setLoadingTopic] = useState(false);
  const [showFr, setShowFr] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [openWordId, setOpenWordId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [showCorrectedFr, setShowCorrectedFr] = useState(false);
  const [saveWordId, setSaveWordId] = useState("");
  const [saved, setSaved] = useState(false);
  const [micAvailable] = useState(() => recognitionAvailable());

  const startRef = useRef(0);
  const stopRef = useRef<(() => void) | null>(null);
  const baseRef = useRef("");

  const eligible = useMemo(() => words.filter((w) => w.translation.trim()), [words]);
  const usedIds = useMemo(() => findUsedWords(text, targets), [text, targets]);

  // Coupe le micro si on quitte l'écran.
  useEffect(() => {
    return () => stopRef.current?.();
  }, []);

  function stopDictation() {
    stopRef.current?.();
    stopRef.current = null;
    setListening(false);
  }

  async function drawTopic(nextTargets: Word[]) {
    setTargets(nextTargets);
    setLoadingTopic(true);
    setReview(null);
    setSaved(false);
    setShowFr(false);
    setShowHint(false);
    setOpenWordId(null);
    try {
      const t = await generateTopic(
        nextTargets.map((w) => ({ word: w.word, translation: w.translation }))
      );
      setTopic({ en: t.topicEn, fr: t.topicFr, hint: t.hintFr, fallback: false });
    } catch (err) {
      const fb = randomFallbackTopic(topic?.en);
      setTopic({ en: fb.en, fr: fb.fr, hint: "", fallback: true });
      const reason = err instanceof AiError ? err.message : "Sujet généré impossible.";
      toast.info(`${reason} Un sujet de secours est proposé.`);
    } finally {
      setLoadingTopic(false);
    }
  }

  async function start() {
    const picked = pickTopicWords(words, cards, count);
    if (picked.length === 0) return;
    stopDictation();
    startRef.current = Date.now();
    setText("");
    setPhase("play");
    await drawTopic(picked);
  }

  function replaceWord(id: string) {
    const exclude = new Set(targets.map((t) => t.id));
    const [fresh] = pickTopicWords(words, cards, 1, exclude);
    if (!fresh) {
      toast.info("Il n'y a pas d'autre mot disponible.");
      return;
    }
    // Un nouveau mot demande un nouveau sujet, pour qu'ils restent cohérents.
    void drawTopic(targets.map((t) => (t.id === id ? fresh : t)));
  }

  function toggleDictation() {
    if (listening) {
      stopDictation();
      return;
    }
    baseRef.current = text.trim();
    setListening(true);
    stopRef.current = listen({
      accent,
      onResult: (transcript, isFinal) => {
        const base = baseRef.current;
        const next = base ? `${base} ${transcript}` : transcript;
        setText(next);
        if (isFinal) baseRef.current = next;
      },
      onError: (err) => {
        setListening(false);
        toast.error(
          err === "not-allowed"
            ? "Microphone bloqué. Autorisez l'accès dans le navigateur."
            : err === "no-speech"
            ? "Aucune parole détectée. Réessayez."
            : `Erreur de reconnaissance : ${err}`
        );
      },
      onEnd: () => setListening(false),
    });
  }

  function finish() {
    stopDictation();
    setPhase("result");
    recordDailyActivity(0, usedIds.size);
    addStudySession({
      date: startRef.current,
      durationSec: Math.round((Date.now() - startRef.current) / 1000),
      correct: usedIds.size,
      total: targets.length,
      type: "topic",
    });
  }

  async function askReview() {
    setReviewing(true);
    try {
      const r = await reviewText({
        text: text.trim(),
        topicEn: topic?.en ?? "",
        words: targets.map((w) => ({ word: w.word, translation: w.translation })),
      });
      setReview(r);
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "La correction a échoué. Réessayez.");
    } finally {
      setReviewing(false);
    }
  }

  function saveAsExample() {
    const wordId = saveWordId || [...usedIds][0] || targets[0]?.id;
    if (!wordId) return;
    addExample({
      wordId,
      parentId: wordId,
      parentType: "word",
      content: (review?.corrected || text).trim(),
      translation: review?.correctedFr?.trim() || "(production personnelle)",
      personal: true,
    });
    setSaved(true);
    toast.success("Texte enregistré comme exemple sur la fiche.");
  }

  function restart() {
    stopDictation();
    setPhase("setup");
    setTopic(null);
    setTargets([]);
    setText("");
    setReview(null);
    setSaved(false);
  }

  const verdictFor = (w: Word) =>
    review?.words.find((r) => r.word.toLowerCase() === w.word.toLowerCase());

  // --- Pas assez de vocabulaire ---
  if (eligible.length < 3) {
    return (
      <Shell title="Sujet aléatoire" onExit={onExit}>
        <EmptyState
          icon={Dices}
          title="Pas assez de mots"
          description="Il faut au moins 3 fiches avec une traduction pour tirer un sujet."
        />
      </Shell>
    );
  }

  // --- Préparation ---
  if (phase === "setup") {
    return (
      <Shell title="Sujet aléatoire" onExit={onExit}>
        <div className="space-y-4">
          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-1">
            <p className="font-semibold">Un sujet fait avec vos propres mots</p>
            <p className="text-sm text-muted-foreground">
              L'application tire quelques mots de votre dictionnaire et invente un sujet
              qui vous oblige à les utiliser. Répondez à l'écrit ou à l'oral.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Nombre de mots à placer</p>
            <div className="flex gap-2">
              {COUNTS.map((n) => (
                <Button
                  key={n}
                  variant={count === n ? "default" : "outline"}
                  className="flex-1"
                  disabled={eligible.length < n}
                  onClick={() => setCount(n)}
                >
                  {n}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Les mots les moins maîtrisés, à réviser ou ajoutés récemment sont tirés en priorité.
            </p>
          </div>

          <Button className="w-full h-11" onClick={start}>
            <Dices className="h-4 w-4" /> Tirer un sujet
          </Button>
          <p className="text-xs text-muted-foreground">
            Le sujet est préparé par l'IA : il faut internet et votre code d'accès dans
            Réglages. Sans cela, un sujet de secours est proposé.
          </p>
        </div>
      </Shell>
    );
  }

  const openWord = targets.find((w) => w.id === openWordId) ?? null;
  const openWordCards = openWord
    ? cards.filter((c) => c.wordId === openWord.id).slice(0, 3)
    : [];

  // --- Résultat ---
  if (phase === "result") {
    return (
      <Shell title="Résultat" onExit={onExit}>
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border bg-card p-3">
            <p className="text-sm font-medium">Mots détectés dans votre texte</p>
            <Badge variant="outline" className="tabular-nums">
              {usedIds.size} / {targets.length}
            </Badge>
          </div>

          <div className="space-y-2">
            {targets.map((w) => {
              const v = verdictFor(w);
              const used = v ? v.used : usedIds.has(w.id);
              const good = v ? v.usedCorrectly : usedIds.has(w.id);
              return (
                <div key={w.id} className="rounded-lg border bg-card p-3 flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white",
                      good ? "bg-emerald-500" : used ? "bg-amber-500" : "bg-rose-500"
                    )}
                  >
                    {good ? (
                      <Check className="h-3 w-3" />
                    ) : used ? (
                      <CircleAlert className="h-3 w-3" />
                    ) : (
                      <X className="h-3 w-3" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium break-words">
                      {w.word}{" "}
                      <span className="font-normal text-muted-foreground">— {w.translation}</span>
                    </p>
                    {v?.note && <p className="text-xs text-muted-foreground mt-0.5">{v.note}</p>}
                    {!v && !used && (
                      <p className="text-xs text-muted-foreground mt-0.5">Non utilisé.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rounded-xl border bg-card p-3 space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Votre texte</p>
            <p className="text-sm whitespace-pre-wrap break-words">{text}</p>
          </div>

          {!review ? (
            <div className="space-y-1.5">
              <Button className="w-full h-11" onClick={askReview} disabled={reviewing}>
                {reviewing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Correction en cours…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Corriger avec l'IA
                  </>
                )}
              </Button>
              <p className="text-xs text-muted-foreground">
                L'IA corrige la grammaire, juge l'emploi de chaque mot (les formes
                irrégulières comprises) et propose une version naturelle.
              </p>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-3"
            >
              {review.feedback && (
                <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-3">
                  <p className="text-sm">{review.feedback}</p>
                </div>
              )}

              {review.mistakes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">À corriger</p>
                  {review.mistakes.map((m, i) => (
                    <div key={i} className="rounded-lg border p-2.5 space-y-0.5 text-sm">
                      <p className="break-words">
                        <span className="text-rose-600 dark:text-rose-400 line-through">
                          {m.original}
                        </span>{" "}
                        →{" "}
                        <span className="text-emerald-700 dark:text-emerald-300 font-medium">
                          {m.fixed}
                        </span>
                      </p>
                      {m.explanation && (
                        <p className="text-xs text-muted-foreground">{m.explanation}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="rounded-xl border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Version corrigée</p>
                  <SpeakButton text={review.corrected} size="sm" />
                </div>
                <p className="text-sm whitespace-pre-wrap break-words">{review.corrected}</p>
                {review.correctedFr && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      onClick={() => setShowCorrectedFr((v) => !v)}
                    >
                      <Languages className="h-3.5 w-3.5" />
                      {showCorrectedFr ? "Masquer la traduction" : "Voir la traduction"}
                    </Button>
                    {showCorrectedFr && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">
                        {review.correctedFr}
                      </p>
                    )}
                  </>
                )}
              </div>
            </motion.div>
          )}

          {/* Enregistrer comme exemple */}
          <div className="rounded-xl border p-3 space-y-2">
            <p className="text-sm font-medium">
              {review ? "Garder la version corrigée" : "Garder mon texte"} comme exemple
            </p>
            {!review && (
              <p className="text-xs text-muted-foreground">
                Ce texte n'est pas corrigé : il peut contenir des erreurs.
              </p>
            )}
            <div className="flex gap-2">
              <Select
                value={saveWordId || [...usedIds][0] || targets[0]?.id || ""}
                onValueChange={setSaveWordId}
                disabled={saved}
              >
                <SelectTrigger className="flex-1 h-9">
                  <SelectValue placeholder="Fiche" />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.word}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                className="h-9"
                onClick={saveAsExample}
                disabled={saved}
              >
                <Save className="h-4 w-4" /> {saved ? "Enregistré" : "Enregistrer"}
              </Button>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={onExit}>
              Retour
            </Button>
            <Button className="flex-1" onClick={restart}>
              <RefreshCw className="h-4 w-4" /> Nouveau sujet
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  // --- Jeu ---
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Shell title="Sujet aléatoire" onExit={onExit}>
      <div className="space-y-3">
        {/* Sujet */}
        <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent p-4 space-y-2">
          {loadingTopic ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Préparation du sujet…
            </p>
          ) : topic ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-semibold leading-snug break-words">{topic.en}</p>
                <SpeakButton text={topic.en} size="sm" />
              </div>
              {topic.fallback && (
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  Sujet de secours : essayez d'y placer vos mots.
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {topic.fr && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowFr((v) => !v)}
                  >
                    <Languages className="h-3.5 w-3.5" />
                    {showFr ? "Masquer le français" : "Voir en français"}
                  </Button>
                )}
                {topic.hint && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowHint((v) => !v)}
                  >
                    <Lightbulb className="h-3.5 w-3.5" />
                    {showHint ? "Masquer l'astuce" : "Une astuce"}
                  </Button>
                )}
              </div>
              {showFr && topic.fr && (
                <p className="text-sm text-muted-foreground break-words">{topic.fr}</p>
              )}
              {showHint && topic.hint && (
                <p className="text-sm text-muted-foreground break-words">💡 {topic.hint}</p>
              )}
            </>
          ) : null}
        </div>

        {/* Mots à placer */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Mots à placer</p>
            <span className="text-xs text-muted-foreground tabular-nums">
              {usedIds.size} / {targets.length} utilisés
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {targets.map((w) => {
              const used = usedIds.has(w.id);
              return (
                <button
                  key={w.id}
                  onClick={() => setOpenWordId((id) => (id === w.id ? null : w.id))}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                    used
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                      : "bg-card hover:border-primary/40",
                    openWordId === w.id && "ring-2 ring-primary/40"
                  )}
                >
                  {used && <Check className="h-3.5 w-3.5" />}
                  {w.word}
                </button>
              );
            })}
          </div>

          {openWord && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-lg border bg-card p-3 space-y-1.5 text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium break-words">
                    {openWord.word}{" "}
                    {!hidePhonetic && <Phonetic value={openWord.phonetic} />}
                  </p>
                  <p className="text-muted-foreground">{openWord.translation}</p>
                </div>
                <SpeakButton text={openWord.word} size="sm" />
              </div>
              {openWordCards.length > 0 && (
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {openWordCards.map((c) => (
                    <li key={c.id} className="break-words">
                      • {c.content} — {c.translation}
                    </li>
                  ))}
                </ul>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => replaceWord(openWord.id)}
                disabled={loadingTopic}
              >
                <RefreshCw className="h-3.5 w-3.5" /> Remplacer ce mot
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Remplacer un mot prépare aussi un nouveau sujet.
              </p>
            </motion.div>
          )}
        </div>

        {/* Réponse */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Votre réponse</p>
            <span className="text-xs text-muted-foreground tabular-nums">{wordCount} mots</span>
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your answer here… or tap the microphone and speak."
            rows={8}
            className="text-base leading-relaxed"
            disabled={listening}
          />
          <div className="flex gap-2">
            {micAvailable ? (
              <Button
                type="button"
                variant={listening ? "default" : "outline"}
                className={cn("flex-1 h-11", listening && "bg-rose-500 hover:bg-rose-600")}
                onClick={toggleDictation}
              >
                {listening ? (
                  <>
                    <Square className="h-4 w-4" /> Arrêter la dictée
                  </>
                ) : (
                  <>
                    <Mic className="h-4 w-4" /> Parler
                  </>
                )}
              </Button>
            ) : (
              <p className="flex-1 text-xs text-muted-foreground self-center">
                La dictée vocale n'est pas disponible sur ce navigateur : écrivez votre réponse.
              </p>
            )}
            <Button
              variant="outline"
              className="h-11"
              onClick={() => drawTopic(targets)}
              disabled={loadingTopic || listening}
            >
              <RefreshCw className="h-4 w-4" /> Autre sujet
            </Button>
          </div>
          {listening && (
            <p className="text-xs text-muted-foreground">
              Écoute en cours… parlez, puis marquez une pause. Vous pouvez relancer pour
              continuer votre texte.
            </p>
          )}
          <Button
            className="w-full h-11"
            onClick={finish}
            disabled={text.trim().length < 10 || loadingTopic}
          >
            <Check className="h-4 w-4" /> Terminer
          </Button>
        </div>
      </div>
    </Shell>
  );
}
