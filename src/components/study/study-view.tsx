"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Layers,
  Sparkles,
  Target,
  RotateCcw,
  Volume2,
  Check,
  X,
  ChevronRight,
  Lightbulb,
  PencilLine,
  CalendarDays,
  AlertTriangle,
  Mic,
  Award,
  BookOpenText,
  Languages,
  Dices,
} from "lucide-react";
import { toast } from "sonner";

import type { Card } from "@/lib/types";
import { useLexicon, selectDueCards, selectErrorCards } from "@/lib/store";
import { speak } from "@/lib/speech";
import { listen, recognitionAvailable } from "@/lib/speech-recognition";
import { tolerantMatch } from "@/lib/search";
import { FALSE_FRIENDS, buildFalseFriendQuestion, type FalseFriend } from "@/lib/false-friends";
import {
  generateExercises,
  type ExerciseType,
  type Question,
} from "@/lib/exercises";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card as UICard } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SpeakButton } from "@/components/shared/speak-button";
import { EmptyState } from "@/components/shared/empty-state";
import { Confetti } from "@/components/shared/confetti";
import { StudyCard } from "@/components/study/study-card";
import { WordOfDayHero } from "@/components/study/word-of-day-hero";
import { ActiveReadingView } from "@/components/study/active-reading-view";
import { TopicSession } from "@/components/study/topic-session";
import { ProgressRing } from "@/components/shared/progress-ring";
import { Phonetic } from "@/components/shared/phonetic";

type Mode =
  | "home"
  | "flashcards"
  | "free-recall"
  | "exercises"
  | "today"
  | "errors"
  | "mini-text"
  | "false-friends-quiz"
  | "word-of-day"
  | "active-reading"
  | "reverse-translation"
  | "topic";

export function StudyView() {
  const state = useLexicon();
  const dueCards = selectDueCards(state);
  const errorCards = selectErrorCards(state);

  const [mode, setMode] = useState<Mode>("home");
  const [flashDirection, setFlashDirection] = useState<"en-fr" | "fr-en">("en-fr");
  const [exerciseTypes, setExerciseTypes] = useState<ExerciseType[]>([
    "fill-blanks",
    "qcm-expression",
    "scrambled",
  ]);
  const [exerciseCount, setExerciseCount] = useState(10);
  const [flashSource, setFlashSource] = useState<"due" | "all" | "errors">("due");
  const [flashWordId, setFlashWordId] = useState<string | undefined>(undefined);

  if (mode !== "home") {
    return (
      <SessionHost
        mode={mode}
        onExit={() => setMode("home")}
        flashDirection={flashDirection}
        flashSource={flashSource}
        flashWordId={flashWordId}
        exerciseTypes={exerciseTypes}
        exerciseCount={exerciseCount}
      />
    );
  }

  const dueCount = dueCards.length;
  const errorCount = errorCards.length;

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 bg-background/80 backdrop-blur sticky top-0 z-10 border-b">
        <h1 className="text-xl font-bold tracking-tight">Étudier</h1>
        <p className="text-xs text-muted-foreground">
          {dueCount} à réviser aujourd'hui · {errorCount} en erreur
        </p>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3 space-y-3">
        {/* Mot du jour */}
        <WordOfDayHero
          onStudy={(wordId) => {
            setFlashWordId(wordId);
            setMode("word-of-day");
          }}
        />

        {/* À réviser aujourd'hui */}
        <StudyCard
          icon={CalendarDays}
          title="À réviser aujourd'hui"
          description={
            dueCount === 0
              ? "Tout est à jour !"
              : `${dueCount} carte(s) due(s)`
          }
          accent="primary"
          count={dueCount}
          disabled={dueCount === 0}
          onClick={() => {
            if (dueCount === 0) {
              toast.info("Rien à réviser pour aujourd'hui 🎉");
              return;
            }
            setFlashSource("due");
            setMode("today");
          }}
        />

        {/* Mode erreurs */}
        {errorCount === 0 ? (
          <div className="rounded-xl border-2 border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white shrink-0">
              <Award className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-sm text-emerald-700 dark:text-emerald-300">
                Série parfaite !
              </p>
              <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80">
                Aucune erreur enregistrée. Continuez ainsi 💪
              </p>
            </div>
          </div>
        ) : (
          <StudyCard
            icon={AlertTriangle}
            title="Mes erreurs"
            description={`${errorCount} carte(s) à revoir`}
            accent="destructive"
            count={errorCount}
            onClick={() => {
              setFlashSource("errors");
              setMode("errors");
            }}
          />
        )}

        {/* Faux-amis (quiz dédié) */}
        <StudyCard
          icon={AlertTriangle}
          title="Quiz faux-amis"
          description="Évitez les pièges FR↔EN les plus courants"
          accent="amber"
          onClick={() => setMode("false-friends-quiz")}
        />

        {/* Défi traduction inverse */}
        <StudyCard
          icon={Languages}
          title="Défi traduction"
          description="Traduisez du français vers l'anglais (production active)"
          accent="violet"
          onClick={() => setMode("reverse-translation")}
        />

        {/* Flashcards */}
        <div>
          <StudyCard
            icon={Layers}
            title="Flashcards"
            description="Cartes dans les deux sens (EN↔FR)"
            accent="teal"
            onClick={() => setMode("flashcards")}
            footer={
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant={flashDirection === "en-fr" ? "default" : "outline"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlashDirection("en-fr");
                  }}
                >
                  EN → FR
                </Button>
                <Button
                  size="sm"
                  variant={flashDirection === "fr-en" ? "default" : "outline"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFlashDirection("fr-en");
                  }}
                >
                  FR → EN
                </Button>
                <Select
                  value={flashSource}
                  onValueChange={(v) => setFlashSource(v as typeof flashSource)}
                >
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="due">À réviser</SelectItem>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="errors">Erreurs</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            }
          />
        </div>

        {/* Rappel libre */}
        <StudyCard
          icon={Brain}
          title="Rappel libre"
          description="Écrivez de mémoire les chunks, collocations et expressions"
          accent="violet"
          onClick={() => setMode("free-recall")}
        />

        {/* Exercices */}
        <div>
          <StudyCard
            icon={Target}
            title="Exercices"
            description="Texte à trous, QCM, dictée, association…"
            accent="amber"
            onClick={() => setMode("exercises")}
            footer={
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["fill-blanks", "Texte à trous"],
                      ["collocation", "Collocations"],
                      ["scrambled", "Chunks mélangés"],
                      ["qcm-expression", "QCM expressions"],
                      ["matching", "Association"],
                      ["dictation", "Dictée"],
                      ["pronunciation", "Prononciation"],
                    ] as [ExerciseType, string][]
                  ).map(([t, label]) => (
                    <Badge
                      key={t}
                      variant={exerciseTypes.includes(t) ? "default" : "outline"}
                      className="cursor-pointer text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExerciseTypes((prev) =>
                          prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
                        );
                      }}
                    >
                      {label}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Questions :</span>
                  <div className="flex gap-1">
                    {[5, 10, 15, 20].map((n) => (
                      <Button
                        key={n}
                        size="sm"
                        variant={exerciseCount === n ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExerciseCount(n);
                        }}
                      >
                        {n}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>
            }
          />
        </div>

        {/* Mini-texte du jour */}
        <StudyCard
          icon={Sparkles}
          title="Mini-texte du jour"
          description="3 à 5 mots tirés au hasard pour écrire une phrase"
          accent="rose"
          onClick={() => setMode("mini-text")}
        />

        {/* Sujet aléatoire */}
        <StudyCard
          icon={Dices}
          title="Sujet aléatoire"
          description="Parlez ou écrivez en utilisant vos propres mots"
          accent="rose"
          onClick={() => setMode("topic")}
        />

        {/* Lecture active */}
        <StudyCard
          icon={BookOpenText}
          title="Lecture active"
          description="Collez un texte, repérez les mots connus et inconnus"
          accent="teal"
          onClick={() => setMode("active-reading")}
        />

        {state.cards.length === 0 && (
          <EmptyState
            icon={Brain}
            title="Aucune carte à étudier"
            description="Ajoutez d'abord des fiches avec des chunks, collocations et expressions."
          />
        )}
        <div className="h-24" />
      </div>
    </div>
  );
}

// ============================================================================
// Hôte de session — route vers le bon mode.
// ============================================================================

function SessionHost({
  mode,
  onExit,
  flashDirection,
  flashSource,
  flashWordId,
  exerciseTypes,
  exerciseCount,
}: {
  mode: Mode;
  onExit: () => void;
  flashDirection: "en-fr" | "fr-en";
  flashSource: "due" | "all" | "errors";
  flashWordId?: string;
  exerciseTypes: ExerciseType[];
  exerciseCount: number;
}) {
  if (mode === "flashcards" || mode === "today" || mode === "errors" || mode === "word-of-day") {
    return (
      <FlashcardSession
        direction={flashDirection}
        source={mode === "today" ? "due" : mode === "errors" ? "errors" : flashSource}
        wordId={mode === "word-of-day" ? flashWordId : undefined}
        onExit={onExit}
      />
    );
  }
  if (mode === "free-recall") {
    return <FreeRecallSession onExit={onExit} />;
  }
  if (mode === "exercises") {
    return (
      <ExerciseSession
        types={exerciseTypes}
        count={exerciseCount}
        onExit={onExit}
      />
    );
  }
  if (mode === "mini-text") {
    return <MiniTextSession onExit={onExit} />;
  }
  if (mode === "false-friends-quiz") {
    return <FalseFriendsQuizSession onExit={onExit} />;
  }
  if (mode === "active-reading") {
    return <ActiveReadingView onExit={onExit} />;
  }
  if (mode === "reverse-translation") {
    return <ReverseTranslationSession onExit={onExit} />;
  }
  if (mode === "topic") {
    return <TopicSession onExit={onExit} />;
  }
  return null;
}

// ============================================================================
// Flashcards
// ============================================================================

function FlashcardSession({
  direction,
  source,
  wordId,
  onExit,
}: {
  direction: "en-fr" | "fr-en";
  source: "due" | "all" | "errors";
  /** Si fourni, limite la session aux cartes de ce mot. */
  wordId?: string;
  onExit: () => void;
}) {
  const state = useLexicon();
  const reviewCard = useLexicon((s) => s.reviewCard);
  const recordDailyActivity = useLexicon((s) => s.recordDailyActivity);
  const addStudySession = useLexicon((s) => s.addStudySession);
  const hidePhonetic = useLexicon((s) => !!s.settings.hidePhoneticInStudy);

  const queue = useMemo<Card[]>(() => {
    let list: Card[];
    if (source === "due") list = selectDueCards(state);
    else if (source === "errors") list = selectErrorCards(state);
    else list = state.cards;
    if (wordId) list = list.filter((c) => c.wordId === wordId);
    return [...list].sort((a, b) => a.nextReview - b.nextReview);
  }, []);

  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const startTime = useMemo(() => Date.now(), []);

  if (queue.length === 0) {
    return (
      <SessionShell title="Flashcards" onExit={onExit}>
        <EmptyState
          icon={Layers}
          title="Aucune carte"
          description="Aucune carte ne correspond à cette sélection."
        />
      </SessionShell>
    );
  }

  const card = queue[idx];
  const word = state.words.find((w) => w.id === card.wordId);
  const frontEn = direction === "en-fr";
  const frontText = frontEn ? card.content : card.translation;
  const backText = frontEn ? card.translation : card.content;

  function answer(quality: number) {
    reviewCard(card.id, quality);
    const ok = quality >= 3;
    setTotal((t) => t + 1);
    if (ok) setCorrect((c) => c + 1);
    setFlipped(false);
    if (idx + 1 >= queue.length) {
      setDone(true);
      const duration = Math.round((Date.now() - startTime) / 1000);
      recordDailyActivity(0, total + 1);
      addStudySession({
        date: startTime,
        durationSec: duration,
        correct: ok ? correct + 1 : correct,
        total: total + 1,
        type: "flashcards",
      });
    } else {
      setTimeout(() => setIdx((i) => i + 1), 200);
    }
  }

  if (done) {
    return (
      <SessionShell title="Flashcards" onExit={onExit}>
        <ResultScreen
          correct={correct}
          total={total}
          onExit={onExit}
          onRetry={() => {
            setIdx(0);
            setFlipped(false);
            setCorrect(0);
            setTotal(0);
            setDone(false);
          }}
        />
      </SessionShell>
    );
  }

  return (
    <SessionShell
      title="Flashcards"
      onExit={onExit}
      progress={((idx + 1) / queue.length) * 100}
      progressLabel={`${idx + 1} / ${queue.length}`}
      questionKey={idx}
    >
      <div className="flex-1 flex flex-col">
        <div className="flex items-center justify-center gap-2 mb-3">
          <Badge variant="outline" className="capitalize">
            {card.type}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {frontEn ? "Anglais → Français" : "Français → Anglais"}
          </span>
        </div>

        {/* Carte retournable */}
        <div
          className="flex-1 flex items-center justify-center perspective-1000"
          style={{ perspective: "1000px" }}
        >
          <div
            role="button"
            tabIndex={0}
            className="relative w-full h-64 cursor-pointer rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setFlipped((f) => !f)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFlipped((f) => !f);
              }
            }}
            style={{ transformStyle: "preserve-3d" }}
          >
            <motion.div
              className="absolute inset-0"
              animate={{ rotateY: flipped ? 180 : 0 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Recto */}
              <div
                className="absolute inset-0 rounded-2xl border-2 bg-card flex flex-col items-center justify-center p-6 text-center"
                style={{ backfaceVisibility: "hidden" }}
              >
                <p className="text-2xl font-bold break-words">{frontText}</p>
                {frontEn && (
                  <div className="mt-3">
                    <SpeakButton text={card.content} size="sm" />
                  </div>
                )}
                <p className="absolute bottom-3 text-xs text-muted-foreground">
                  Touchez pour retourner
                </p>
              </div>
              {/* Verso */}
              <div
                className="absolute inset-0 rounded-2xl border-2 border-primary/40 bg-primary/5 flex flex-col items-center justify-center p-6 text-center"
                style={{
                  backfaceVisibility: "hidden",
                  transform: "rotateY(180deg)",
                }}
              >
                <p className="text-2xl font-bold break-words">{backText}</p>
                {word && (
                  <p className="text-xs text-muted-foreground mt-2">
                    fiche : {word.word} — {word.translation}
                  </p>
                )}
                {word && !hidePhonetic && (
                  <Phonetic value={word.phonetic} className="mt-1" />
                )}
                {!frontEn && (
                  <div className="mt-3">
                    <SpeakButton text={card.content} size="sm" />
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Boutons d'auto-évaluation */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button
            variant="outline"
            className="h-12 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => answer(1)}
          >
            <X className="h-4 w-4" /> Je ne le savais pas
          </Button>
          <Button
            className="h-12 bg-emerald-600 hover:bg-emerald-700"
            onClick={() => answer(4)}
          >
            <Check className="h-4 w-4" /> Je le savais
          </Button>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 text-xs"
          onClick={() => setFlipped((f) => !f)}
        >
          <Lightbulb className="h-3 w-3" /> Retourner la carte
        </Button>
      </div>
    </SessionShell>
  );
}

// ============================================================================
// Rappel libre
// ============================================================================

function FreeRecallSession({ onExit }: { onExit: () => void }) {
  const { words, cards, examples } = useLexicon();
  const hidePhonetic = useLexicon((s) => !!s.settings.hidePhoneticInStudy);
  const addExample = useLexicon((s) => s.addExample);
  const addStudySession = useLexicon((s) => s.addStudySession);

  const [idx, setIdx] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [chunksText, setChunksText] = useState("");
  const [collocationsText, setCollocationsText] = useState("");
  const [expressionsText, setExpressionsText] = useState("");
  const [correct, setCorrect] = useState(0);
  const [total, setTotal] = useState(0);
  const [done, setDone] = useState(false);
  const startTime = useMemo(() => Date.now(), []);

  // Choisit des mots qui ont au moins 3 chunks.
  const queue = useMemo(
    () =>
      words.filter(
        (w) => cards.filter((c) => c.wordId === w.id && c.type === "chunk").length >= 3
      ),
    [words, cards]
  );

  if (queue.length === 0) {
    return (
      <SessionShell title="Rappel libre" onExit={onExit}>
        <EmptyState
          icon={Brain}
          title="Pas assez de fiches"
          description="Il faut au moins une fiche complète (3 chunks minimum) pour le rappel libre."
        />
      </SessionShell>
    );
  }

  const word = queue[idx];
  const wordCards = cards.filter((c) => c.wordId === word.id);

  function check() {
    const userChunks = chunksText.split("\n").map((s) => s.trim()).filter(Boolean);
    const userCollocations = collocationsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const userExpressions = expressionsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const realChunks = wordCards.filter((c) => c.type === "chunk");
    const realCollocations = wordCards.filter((c) => c.type === "collocation");
    const realExpressions = wordCards.filter((c) => c.type === "expression");

    let hits = 0;
    [...userChunks, ...userCollocations, ...userExpressions].forEach((u) => {
      const found = wordCards.find(
        (c) => tolerantMatch(c.content, u) > 0.7 || tolerantMatch(c.translation, u) > 0.7
      );
      if (found) hits++;
    });
    setCorrect((c) => c + hits);
    setTotal((t) => t + realChunks.length + realCollocations.length + realExpressions.length);
    setShowAnswer(true);
  }

  function next() {
    if (idx + 1 >= queue.length) {
      setDone(true);
      addStudySession({
        date: startTime,
        durationSec: Math.round((Date.now() - startTime) / 1000),
        correct,
        total,
        type: "free-recall",
      });
    } else {
      setIdx((i) => i + 1);
      setChunksText("");
      setCollocationsText("");
      setExpressionsText("");
      setShowAnswer(false);
    }
  }

  if (done) {
    return (
      <SessionShell title="Rappel libre" onExit={onExit}>
        <ResultScreen
          correct={correct}
          total={total}
          onExit={onExit}
          onRetry={() => {
            setIdx(0);
            setCorrect(0);
            setTotal(0);
            setDone(false);
            setShowAnswer(false);
            setChunksText("");
            setCollocationsText("");
            setExpressionsText("");
          }}
        />
      </SessionShell>
    );
  }

  return (
    <SessionShell
      title="Rappel libre"
      onExit={onExit}
      progress={((idx + 1) / queue.length) * 100}
      progressLabel={`${idx + 1} / ${queue.length}`}
      questionKey={idx}
    >
      <div className="space-y-3">
        <div className="rounded-xl border-2 bg-primary/5 p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Mot à rappeler
          </p>
          <p className="text-2xl font-bold mt-1">{word.word}</p>
          {!hidePhonetic && <Phonetic value={word.phonetic} className="block" />}
          <p className="text-sm text-muted-foreground">{word.translation}</p>
          <div className="mt-2">
            <SpeakButton text={word.word} />
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Écrivez de mémoire les chunks, collocations et expressions que vous
          connaissez pour ce mot. Un par ligne.
        </p>

        <div className="space-y-2">
          <div>
            <Label2>Chunks</Label2>
            <Textarea
              value={chunksText}
              onChange={(e) => setChunksText(e.target.value)}
              placeholder="un chunk par ligne…"
              rows={3}
              disabled={showAnswer}
            />
          </div>
          <div>
            <Label2>Collocations</Label2>
            <Textarea
              value={collocationsText}
              onChange={(e) => setCollocationsText(e.target.value)}
              placeholder="une collocation par ligne…"
              rows={3}
              disabled={showAnswer}
            />
          </div>
          <div>
            <Label2>Expressions</Label2>
            <Textarea
              value={expressionsText}
              onChange={(e) => setExpressionsText(e.target.value)}
              placeholder="une expression par ligne…"
              rows={3}
              disabled={showAnswer}
            />
          </div>
        </div>

        {!showAnswer ? (
          <Button className="w-full h-11" onClick={check}>
            <Check className="h-4 w-4" /> Comparer avec ma fiche
          </Button>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border p-3 bg-card space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Votre fiche :
              </p>
              {(["chunk", "collocation", "expression"] as const).map((type) => (
                <div key={type}>
                  <p className="text-xs capitalize font-medium">{type}s :</p>
                  {wordCards
                    .filter((c) => c.type === type)
                    .map((c) => {
                      const userInput = [
                        ...chunksText.split("\n"),
                        ...collocationsText.split("\n"),
                        ...expressionsText.split("\n"),
                      ];
                      const found = userInput.some(
                        (u) =>
                          tolerantMatch(c.content, u) > 0.7 ||
                          tolerantMatch(c.translation, u) > 0.7
                      );
                      return (
                        <div
                          key={c.id}
                          className={cn(
                            "flex items-center gap-2 text-sm py-0.5",
                            found ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"
                          )}
                        >
                          {found ? (
                            <Check className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <X className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span className="break-words">{c.content}</span>
                          <span className="text-xs">— {c.translation}</span>
                        </div>
                      );
                    })}
                </div>
              ))}
            </div>
            <Button className="w-full h-11" onClick={next}>
              {idx + 1 >= queue.length ? "Terminer" : "Mot suivant"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </SessionShell>
  );
}

// ============================================================================
// Exercices
// ============================================================================

function ExerciseSession({
  types,
  count,
  onExit,
}: {
  types: ExerciseType[];
  count: number;
  onExit: () => void;
}) {
  const state = useLexicon();
  const reviewCard = useLexicon((s) => s.reviewCard);
  const recordDailyActivity = useLexicon((s) => s.recordDailyActivity);
  const addStudySession = useLexicon((s) => s.addStudySession);

  const questions = useMemo<Question[]>(() => {
    if (types.length === 0) return [];
    return generateExercises(state.words, state.cards, state.examples, {
      types,
      count,
      wordIds: [],
    });
  }, []);

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [hintLevel, setHintLevel] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const startTime = useMemo(() => Date.now(), []);

  if (questions.length === 0) {
    return (
      <SessionShell title="Exercices" onExit={onExit}>
        <EmptyState
          icon={Target}
          title="Impossible de générer des exercices"
          description="Sélectionnez au moins un type d'exercice et assurez-vous d'avoir assez de fiches."
        />
      </SessionShell>
    );
  }

  const q = questions[idx];

  function check() {
    let ok = false;
    if (q.type === "qcm-expression") {
      ok = selectedChoice === q.answer;
    } else if (q.type === "matching") {
      // Validation simple : on considère validé quand l'utilisateur a soumis.
      ok = true;
    } else if (q.type === "dictation" || q.type === "pronunciation") {
      ok = tolerantMatch(q.answer, answer) > 0.7;
    } else {
      ok = tolerantMatch(q.answer, answer) > 0.7;
    }
    setWasCorrect(ok);
    setRevealed(true);
    if (ok) setCorrect((c) => c + 1);
    // Met à jour la carte associée si on peut la retrouver.
    const card = state.cards.find((c) => c.content === q.answer || c.id.startsWith(q.id.replace(/-.*$/, "")));
    if (card) reviewCard(card.id, ok ? 4 : 1);
  }

  function next() {
    if (idx + 1 >= questions.length) {
      setDone(true);
      recordDailyActivity(0, questions.length);
      addStudySession({
        date: startTime,
        durationSec: Math.round((Date.now() - startTime) / 1000),
        correct,
        total: questions.length,
        type: "exercises",
      });
    } else {
      setIdx((i) => i + 1);
      setAnswer("");
      setSelectedChoice(null);
      setRevealed(false);
      setHintLevel(0);
    }
  }

  if (done) {
    return (
      <SessionShell title="Exercices" onExit={onExit}>
        <ResultScreen
          correct={correct}
          total={questions.length}
          onExit={onExit}
          onRetry={() => {
            setIdx(0);
            setAnswer("");
            setSelectedChoice(null);
            setRevealed(false);
            setHintLevel(0);
            setCorrect(0);
            setDone(false);
          }}
        />
      </SessionShell>
    );
  }

  return (
    <SessionShell
      title="Exercices"
      onExit={onExit}
      progress={((idx + 1) / questions.length) * 100}
      progressLabel={`${idx + 1} / ${questions.length}`}
      questionKey={idx}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="capitalize">
            {labelForType(q.type)}
          </Badge>
          {q.audio && <SpeakButton text={q.audio} />}
          {q.type === "dictation" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => q.audio && speak(q.audio, state.settings.accent)}
            >
              <Volume2 className="h-4 w-4" /> Réécouter
            </Button>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-base whitespace-pre-line break-words">{q.prompt}</p>
        </div>

        {/* Zone de réponse selon le type */}
        {q.type === "qcm-expression" && q.choices ? (
          <div className="space-y-2">
            {q.choices.map((c) => (
              <button
                key={c}
                disabled={revealed}
                onClick={() => setSelectedChoice(c)}
                className={cn(
                  "w-full text-left rounded-lg border p-3 text-sm transition-all",
                  selectedChoice === c
                    ? "border-primary bg-primary/10"
                    : "hover:border-primary/40",
                  revealed && c === q.answer
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                    : "",
                  revealed &&
                    selectedChoice === c &&
                    c !== q.answer
                    ? "border-destructive bg-destructive/10"
                    : ""
                )}
              >
                {c}
              </button>
            ))}
          </div>
        ) : q.type === "matching" && q.pairs ? (
          <MatchingExercise pairs={q.pairs} />
        ) : q.type === "pronunciation" ? (
          <PronunciationExercise
            target={q.answer}
            disabled={revealed}
            onResult={(transcript) => setAnswer(transcript)}
          />
        ) : (
          <Input
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Votre réponse…"
            disabled={revealed}
            className="h-11"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !revealed) check();
            }}
          />
        )}

        {/* Indice progressif */}
        {!revealed && hintLevel < 3 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              setHintLevel((h) => h + 1);
              if (hintLevel === 0) toast.info(`Indice : ${q.hint}`);
              else if (hintLevel === 1)
                toast.info(`Indice : ${q.answer.length} caractères`);
              else toast.info(`Indice : ${q.answer.slice(0, Math.ceil(q.answer.length / 2))}…`);
            }}
          >
            <Lightbulb className="h-3 w-3" /> Indice ({hintLevel}/3)
          </Button>
        )}

        {/* Correction */}
        {revealed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-lg border p-3",
              wasCorrect
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                : "border-destructive bg-destructive/5"
            )}
          >
            <p className="flex items-center gap-2 font-medium">
              {wasCorrect ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <X className="h-4 w-4 text-destructive" />
              )}
              {wasCorrect ? "Correct !" : "Pas tout à fait…"}
            </p>
            <p className="text-sm mt-1 break-words">
              <span className="text-muted-foreground">Réponse :</span> {q.answer}
            </p>
            {q.answerTranslation && q.answerTranslation !== q.answer && (
              <p className="text-sm text-muted-foreground break-words">
                {q.answerTranslation}
              </p>
            )}
          </motion.div>
        )}

        {!revealed ? (
          <Button className="w-full h-11" onClick={check} disabled={q.type === "qcm-expression" && !selectedChoice}>
            <Check className="h-4 w-4" /> Valider
          </Button>
        ) : (
          <Button className="w-full h-11" onClick={next}>
            {idx + 1 >= questions.length ? "Terminer" : "Question suivante"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </SessionShell>
  );
}

function MatchingExercise({ pairs }: { pairs: { left: string; right: string }[] }) {
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [matched, setMatched] = useState<Record<string, string>>({});
  const lefts = pairs.map((p) => p.left);
  const rights = [...pairs.map((p) => p.right)].sort(() => Math.random() - 0.5);

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-2">
        {lefts.map((l) => (
          <button
            key={l}
            onClick={() => setSelectedLeft(l)}
            disabled={l in matched}
            className={cn(
              "w-full text-left rounded-lg border p-2 text-sm transition-all",
              selectedLeft === l ? "border-primary bg-primary/10" : "",
              l in matched ? "opacity-40" : "hover:border-primary/40"
            )}
          >
            {l}
          </button>
        ))}
      </div>
      <div className="space-y-2">
        {rights.map((r) => {
          const usedBy = Object.entries(matched).find(([, v]) => v === r)?.[0];
          return (
            <button
              key={r}
              onClick={() => {
                if (selectedLeft) {
                  setMatched((m) => ({ ...m, [selectedLeft]: r }));
                  setSelectedLeft(null);
                }
              }}
              disabled={!!usedBy}
              className={cn(
                "w-full text-left rounded-lg border p-2 text-sm transition-all",
                usedBy ? "opacity-40 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400" : "hover:border-primary/40"
              )}
            >
              {r}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// Mini-texte du jour
// ============================================================================

function MiniTextSession({ onExit }: { onExit: () => void }) {
  const { words, addExample, cards } = useLexicon();
  const picked = useMemo(() => {
    const shuffled = [...words].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(5, Math.max(3, shuffled.length)));
  }, [words]);

  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);

  if (picked.length < 3) {
    return (
      <SessionShell title="Mini-texte du jour" onExit={onExit}>
        <EmptyState
          icon={Sparkles}
          title="Pas assez de mots"
          description="Ajoutez au moins 3 fiches pour utiliser le mini-texte du jour."
        />
      </SessionShell>
    );
  }

  function saveAsExample() {
    if (!text.trim()) return;
    // Sauvegarde la production comme exemple rattaché au premier mot.
    const firstWord = picked[0];
    addExample({
      wordId: firstWord.id,
      parentId: firstWord.id,
      parentType: "word",
      content: text.trim(),
      translation: "(production personnelle)",
      personal: true,
    });
    setSaved(true);
    toast.success("Votre phrase a été sauvegardée comme exemple.");
  }

  return (
    <SessionShell title="Mini-texte du jour" onExit={onExit}>
      <div className="space-y-3">
        <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">
            Vos mots du jour
          </p>
          <div className="flex flex-wrap gap-2">
            {picked.map((w) => (
              <span
                key={w.id}
                className="inline-flex items-center gap-1 rounded-full bg-background border px-3 py-1 text-sm font-medium"
              >
                {w.word}
                <SpeakButton text={w.word} size="sm" />
              </span>
            ))}
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Écrivez une phrase personnelle qui utilise ces mots.
        </p>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Your sentence in English…"
          rows={4}
        />

        {saved ? (
          <div className="rounded-lg border border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-600" />
            Phrase sauvegardée comme exemple sur la fiche « {picked[0].word} ».
          </div>
        ) : (
          <Button
            className="w-full h-11"
            onClick={saveAsExample}
            disabled={!text.trim()}
          >
            <PencilLine className="h-4 w-4" /> Sauvegarder comme exemple
          </Button>
        )}
      </div>
    </SessionShell>
  );
}

// ============================================================================
// Composants utilitaires de session
// ============================================================================

function SessionShell({
  title,
  onExit,
  progress,
  progressLabel,
  questionKey,
  children,
}: {
  title: string;
  onExit: () => void;
  progress?: number;
  progressLabel?: string;
  /** Clé de la question courante pour animer la transition entre questions. */
  questionKey?: string | number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2.5 bg-background/80 backdrop-blur sticky top-0 z-10 border-b">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onExit}>
            <RotateCcw className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-bold flex-1 truncate">{title}</h1>
          {progressLabel && (
            <span className="text-xs text-muted-foreground tabular-nums mr-1">
              {progressLabel}
            </span>
          )}
          {progress !== undefined && (
            <ProgressRing progress={progress} size={34} />
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3">
        <AnimatePresence mode="wait">
          <motion.div
            key={questionKey ?? "default"}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: 0.18 }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
        <div className="h-24" />
      </div>
    </div>
  );
}

function ResultScreen({
  correct,
  total,
  onExit,
  onRetry,
}: {
  correct: number;
  total: number;
  onExit: () => void;
  onRetry: () => void;
}) {
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const isGreat = pct >= 70;
  const message = isGreat
    ? pct === 100
      ? "Sans faute, bravo ! 🏆"
      : "Excellent travail ! 🎉"
    : pct >= 40
    ? "Continue, tu progresses ! 💪"
    : "Ne lâche rien, recommence ! 🌱";
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 gap-5">
      {isGreat && <Confetti fire={1} />}
      <motion.div
        initial={{ scale: 0, rotate: -10 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className={cn(
          "flex h-28 w-28 items-center justify-center rounded-full text-4xl font-bold relative",
          isGreat
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            : pct >= 40
            ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
            : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
        )}
      >
        {pct}%
        {isGreat && (
          <motion.span
            initial={{ scale: 0, y: 10 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: 0.3, type: "spring" }}
            className="absolute -top-2 -right-2 text-2xl"
          >
            {pct === 100 ? "🏆" : "⭐"}
          </motion.span>
        )}
      </motion.div>
      <div className="space-y-1">
        <p className="font-bold text-xl vocab-word">{message}</p>
        <p className="text-sm text-muted-foreground">
          {correct} bonne(s) réponse(s) sur {total}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onExit}>
          Retour
        </Button>
        <Button onClick={onRetry}>
          <RotateCcw className="h-4 w-4" /> Recommencer
        </Button>
      </div>
    </div>
  );
}

function Label2({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-muted-foreground">{children}</label>
  );
}

// ============================================================================
// Prononciation : reconnaissance vocale avec retour visuel
// ============================================================================

function PronunciationExercise({
  target,
  disabled,
  onResult,
}: {
  target: string;
  disabled: boolean;
  onResult: (transcript: string) => void;
}) {
  const accent = useLexicon((s) => s.settings.accent);
  const rate = useLexicon((s) => s.settings.speechRate);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported] = useState(() => recognitionAvailable());
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);

  const score = useMemo(() => {
    if (!transcript) return 0;
    return Math.round(tolerantMatch(target, transcript) * 100);
  }, [transcript, target]);

  function toggleListening() {
    if (disabled || !supported) return;
    if (listening) {
      stopRef.current?.();
      setListening(false);
      return;
    }
    setError(null);
    setTranscript("");
    const stop = listen({
      accent,
      onResult: (text, isFinal) => {
        setTranscript(text);
        onResult(text);
        if (isFinal) {
          setListening(false);
        }
      },
      onError: (err) => {
        setListening(false);
        setError(
          err === "not-allowed"
            ? "Microphone bloqué. Autorisez l'accès dans le navigateur."
            : err === "no-speech"
            ? "Aucune parole détectée. Réessayez."
            : `Erreur de reconnaissance : ${err}`
        );
      },
      onEnd: () => setListening(false),
    });
    stopRef.current = stop;
    setListening(true);
  }

  useEffect(() => {
    return () => stopRef.current?.();
  }, []);

  if (!supported) {
    return (
      <div className="rounded-lg border border-amber-400/50 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm space-y-2">
        <p className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          Reconnaissance vocale non supportée
        </p>
        <p className="text-muted-foreground">
          Votre navigateur ne supporte pas la reconnaissance vocale. Utilisez
          Chrome ou Safari, ou saisissez manuellement :
        </p>
        <Input
          value={transcript}
          onChange={(e) => {
            setTranscript(e.target.value);
            onResult(e.target.value);
          }}
          disabled={disabled}
          placeholder="Saisissez votre réponse…"
          className="h-11"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col items-center gap-3 py-2">
        <motion.button
          type="button"
          disabled={disabled}
          onClick={toggleListening}
          whileTap={{ scale: 0.92 }}
          className={cn(
            "relative flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition-colors",
            listening
              ? "bg-rose-500 shadow-rose-500/40"
              : "bg-primary shadow-primary/30",
            disabled && "opacity-50"
          )}
          aria-label={listening ? "Arrêter l'enregistrement" : "Parler"}
        >
          {listening && (
            <>
              <span className="absolute inset-0 rounded-full bg-rose-500/40 animate-ping" />
              <span className="absolute inset-0 rounded-full bg-rose-500/20 animate-pulse" />
            </>
          )}
          <Mic className="h-8 w-8 relative" />
        </motion.button>
        <p className="text-xs text-muted-foreground">
          {listening ? "Écoute en cours… parlez maintenant" : "Touchez pour parler"}
        </p>
      </div>

      {error && (
        <p className="text-xs text-destructive text-center">{error}</p>
      )}

      {transcript && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border p-3 bg-card space-y-2"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              Vous avez dit :
            </span>
            <Badge
              variant="outline"
              className={cn(
                "tabular-nums",
                score >= 70
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300"
                  : score >= 40
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 border-rose-300"
              )}
            >
              {score}%
            </Badge>
          </div>
          <p className="text-sm break-words">"{transcript}"</p>
        </motion.div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full text-xs"
        onClick={() => speak(target, accent, rate)}
        disabled={disabled}
      >
        <Volume2 className="h-3.5 w-3.5" /> Réécouter le modèle
      </Button>
    </div>
  );
}

// ============================================================================
// Quiz faux-amis : QCM sur le vrai sens vs le faux sens
// ============================================================================

interface FFQuestion {
  ff: FalseFriend;
  prompt: string;
  answer: string;
  choices: string[];
  note: string;
}

function FalseFriendsQuizSession({ onExit }: { onExit: () => void }) {
  const recordDailyActivity = useLexicon((s) => s.recordDailyActivity);
  const addStudySession = useLexicon((s) => s.addStudySession);

  // Génère un quiz mélangé de 10 faux-amis aléatoires.
  const questions = useMemo<FFQuestion[]>(() => {
    const pool = [...FALSE_FRIENDS].filter((f) => f.falseMeaning && f.falseMeaning !== "—");
    // Mélange et prend 10.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const selected = pool.slice(0, 10);
    // Distracteurs génériques tirés d'autres faux-amis.
    const allMeanings = FALSE_FRIENDS.map((f) => f.realMeaning);
    return selected.map((ff) => {
      const distractors: string[] = [];
      const used = new Set([ff.realMeaning, ff.falseMeaning]);
      while (distractors.length < 2) {
        const cand = allMeanings[Math.floor(Math.random() * allMeanings.length)];
        if (!used.has(cand) && !distractors.includes(cand)) {
          distractors.push(cand);
          used.add(cand);
        }
      }
      const q = buildFalseFriendQuestion(ff, distractors);
      return { ff, ...q };
    });
  }, []);

  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(false);
  const startTime = useMemo(() => Date.now(), []);

  if (questions.length === 0) {
    return (
      <SessionShell title="Quiz faux-amis" onExit={onExit}>
        <EmptyState
          icon={AlertTriangle}
          title="Aucun faux-ami disponible"
          description="La base de faux-amis est vide."
        />
      </SessionShell>
    );
  }

  const q = questions[idx];

  function check() {
    if (!selected) return;
    const ok = selected === q.answer;
    setRevealed(true);
    if (ok) setCorrect((c) => c + 1);
  }

  function next() {
    if (idx + 1 >= questions.length) {
      setDone(true);
      recordDailyActivity(0, questions.length);
      addStudySession({
        date: startTime,
        durationSec: Math.round((Date.now() - startTime) / 1000),
        correct,
        total: questions.length,
        type: "false-friends",
      });
    } else {
      setIdx((i) => i + 1);
      setSelected(null);
      setRevealed(false);
    }
  }

  if (done) {
    return (
      <SessionShell title="Quiz faux-amis" onExit={onExit}>
        <ResultScreen
          correct={correct}
          total={questions.length}
          onExit={onExit}
          onRetry={() => {
            setIdx(0);
            setSelected(null);
            setRevealed(false);
            setCorrect(0);
            setDone(false);
          }}
        />
      </SessionShell>
    );
  }

  return (
    <SessionShell
      title="Quiz faux-amis"
      onExit={onExit}
      progress={((idx + 1) / questions.length) * 100}
      progressLabel={`${idx + 1} / ${questions.length}`}
      questionKey={idx}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-700">
            <AlertTriangle className="h-3 w-3" />
            Faux-ami
          </Badge>
          <SpeakButton text={q.ff.en} />
        </div>

        <div className="rounded-xl border-2 border-amber-400/40 bg-gradient-to-br from-amber-50 to-amber-100/30 dark:from-amber-950/30 dark:to-amber-900/10 p-4 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">
            Que signifie réellement ce mot ?
          </p>
          <p className="vocab-word text-3xl font-bold mt-1">{q.ff.en}</p>
          <p className="text-xs text-muted-foreground mt-1">
            (ressemble à « {q.ff.frLookalike} » en français)
          </p>
        </div>

        <div className="space-y-2">
          {q.choices.map((c) => {
            const isAnswer = c === q.answer;
            const isSelected = selected === c;
            return (
              <button
                key={c}
                disabled={revealed}
                onClick={() => setSelected(c)}
                className={cn(
                  "w-full text-left rounded-lg border p-3 text-sm transition-all",
                  !revealed && isSelected && "border-primary bg-primary/10",
                  !revealed && !isSelected && "hover:border-primary/40",
                  revealed && isAnswer && "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20",
                  revealed && isSelected && !isAnswer && "border-destructive bg-destructive/10"
                )}
              >
                {c}
              </button>
            );
          })}
        </div>

        {revealed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-lg border p-3 space-y-1.5",
              selected === q.answer
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                : "border-destructive bg-destructive/5"
            )}
          >
            <p className="flex items-center gap-2 font-medium text-sm">
              {selected === q.answer ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <X className="h-4 w-4 text-destructive" />
              )}
              {selected === q.answer ? "Correct !" : "Le piège !"}
            </p>
            <p className="text-sm">
              <span className="text-muted-foreground">Vrai sens :</span>{" "}
              <span className="font-medium text-emerald-700 dark:text-emerald-300">{q.answer}</span>
            </p>
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive">À éviter :</span> « {q.ff.frLookalike} » (FR) = {q.ff.falseMeaning}
            </p>
            {q.note && (
              <p className="text-xs text-muted-foreground italic border-t border-current/10 pt-1.5 mt-1">
                💡 {q.note}
              </p>
            )}
          </motion.div>
        )}

        {!revealed ? (
          <Button className="w-full h-11" onClick={check} disabled={!selected}>
            <Check className="h-4 w-4" /> Valider
          </Button>
        ) : (
          <Button className="w-full h-11" onClick={next}>
            {idx + 1 >= questions.length ? "Terminer" : "Question suivante"}
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </SessionShell>
  );
}

// ============================================================================
// Défi traduction inverse : prompt FR → utilisateur écrit la traduction EN
// ============================================================================

interface RTQuestion {
  id: string;
  /** Phrase en français à traduire. */
  promptFr: string;
  /** Phrase en anglais attendue. */
  answerEn: string;
  /** Mot d'origine pour contexte. */
  wordLabel: string;
  wordTranslation: string;
}

function ReverseTranslationSession({ onExit }: { onExit: () => void }) {
  const { examples, words, recordDailyActivity, addStudySession } = useLexicon();
  const accent = useLexicon((s) => s.settings.accent);
  const rate = useLexicon((s) => s.settings.speechRate);

  // Construit 10 questions à partir des exemples (qui ont une traduction FR).
  const questions = useMemo<RTQuestion[]>(() => {
    const wordMap = new Map(words.map((w) => [w.id, w]));
    const pool = examples
      .filter((e) => e.translation && e.translation !== "(production personnelle)")
      .map((e) => ({
        id: e.id,
        promptFr: e.translation,
        answerEn: e.content,
        wordLabel: wordMap.get(e.wordId)?.word ?? "",
        wordTranslation: wordMap.get(e.wordId)?.translation ?? "",
      }));
    // Mélange et prend 10.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, 10);
  }, [examples, words]);

  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(false);
  const [wasCorrect, setWasCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [done, setDone] = useState(false);
  const startTime = useMemo(() => Date.now(), []);

  if (questions.length === 0) {
    return (
      <SessionShell title="Défi traduction" onExit={onExit}>
        <EmptyState
          icon={Languages}
          title="Pas assez d'exemples"
          description="Ajoutez des phrases d'exemple avec traduction pour utiliser ce mode."
        />
      </SessionShell>
    );
  }

  const q = questions[idx];

  function check() {
    const ok = tolerantMatch(q.answerEn, answer) > 0.7;
    setWasCorrect(ok);
    setRevealed(true);
    if (ok) setScore((s) => s + 1);
  }

  function next() {
    if (idx + 1 >= questions.length) {
      setDone(true);
      recordDailyActivity(0, questions.length);
      addStudySession({
        date: startTime,
        durationSec: Math.round((Date.now() - startTime) / 1000),
        correct: score,
        total: questions.length,
        type: "reverse-translation",
      });
    } else {
      setIdx((i) => i + 1);
      setAnswer("");
      setRevealed(false);
      setWasCorrect(false);
    }
  }

  if (done) {
    return (
      <SessionShell title="Défi traduction" onExit={onExit}>
        <ResultScreen
          correct={score}
          total={questions.length}
          onExit={onExit}
          onRetry={() => {
            setIdx(0);
            setAnswer("");
            setRevealed(false);
            setWasCorrect(false);
            setScore(0);
            setDone(false);
          }}
        />
      </SessionShell>
    );
  }

  return (
    <SessionShell
      title="Défi traduction"
      onExit={onExit}
      progress={((idx + 1) / questions.length) * 100}
      progressLabel={`${idx + 1} / ${questions.length}`}
      questionKey={idx}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Badge variant="outline" className="gap-1 bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200 border-violet-300 dark:border-violet-700">
            <Languages className="h-3 w-3" />
            FR → EN
          </Badge>
          {q.wordLabel && (
            <span className="text-xs text-muted-foreground">
              fiche : {q.wordLabel}
            </span>
          )}
        </div>

        {/* Prompt en français */}
        <div className="rounded-xl border-2 border-violet-400/40 bg-gradient-to-br from-violet-50 to-violet-100/30 dark:from-violet-950/30 dark:to-violet-900/10 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">
            Traduisez en anglais
          </p>
          <p className="text-base font-medium leading-relaxed break-words">
            {q.promptFr}
          </p>
        </div>

        {/* Saisie */}
        <Input
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Your translation in English…"
          disabled={revealed}
          className="h-12 text-base"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !revealed) check();
          }}
        />

        {/* Correction */}
        {revealed && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "rounded-lg border p-3 space-y-1.5",
              wasCorrect
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                : "border-destructive bg-destructive/5"
            )}
          >
            <p className="flex items-center gap-2 font-medium text-sm">
              {wasCorrect ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <X className="h-4 w-4 text-destructive" />
              )}
              {wasCorrect ? "Bien traduit !" : "Presque…"}
            </p>
            <p className="text-sm break-words">
              <span className="text-muted-foreground">Traduction attendue :</span>{" "}
              <span className="font-medium">{q.answerEn}</span>
            </p>
            {!wasCorrect && answer.trim() && (
              <p className="text-xs text-muted-foreground break-words">
                Votre proposition : « {answer} »
              </p>
            )}
          </motion.div>
        )}

        {!revealed ? (
          <Button className="w-full h-11" onClick={check} disabled={!answer.trim()}>
            <Check className="h-4 w-4" /> Valider
          </Button>
        ) : (
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full h-10"
              onClick={() => speak(q.answerEn, accent, rate)}
            >
              <Volume2 className="h-4 w-4" /> Écouter la phrase
            </Button>
            <Button className="w-full h-11" onClick={next}>
              {idx + 1 >= questions.length ? "Terminer" : "Question suivante"}
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </SessionShell>
  );
}

function labelForType(t: ExerciseType): string {
  switch (t) {
    case "fill-blanks":
      return "Texte à trous";
    case "collocation":
      return "Collocation";
    case "scrambled":
      return "Chunk mélangé";
    case "qcm-expression":
      return "QCM expression";
    case "matching":
      return "Association";
    case "dictation":
      return "Dictée";
    case "pronunciation":
      return "Prononciation";
  }
}
