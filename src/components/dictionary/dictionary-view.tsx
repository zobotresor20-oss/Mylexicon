"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  BookOpen,
  Filter,
  Search,
  Star,
  ArrowDownUp,
  Plus,
  CircleAlert,
  CheckSquare,
  Square,
  Tag,
  Trash2,
  X,
  ListChecks,
  Sparkles,
} from "lucide-react";

import type { PartOfSpeech, Word, WordStatus } from "@/lib/types";
import { useLexicon, missingForWord } from "@/lib/store";
import { isFalseFriend } from "@/lib/false-friends";
import { isCognate } from "@/lib/cognates";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ClickableCard } from "@/components/shared/clickable-card";
import { OnboardingEmpty } from "@/components/dictionary/onboarding-empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { SpeakButton } from "@/components/shared/speak-button";
import { StatusBadge } from "@/components/shared/badges";
import { EmptyState } from "@/components/shared/empty-state";
import { WordFormDialog } from "./word-form-dialog";
import { WordDetailSheet } from "./word-detail-sheet";
import { Phonetic } from "@/components/shared/phonetic";
import { AiBatchDialog } from "./ai-batch-dialog";

type SortKey = "recent" | "alpha" | "status" | "review";

export function DictionaryView({ onOpenAdd }: { onOpenAdd: () => void }) {
  const { words, cards, examples, updateWord, deleteWord } = useLexicon();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<WordStatus | "all">("all");
  const [partFilter, setPartFilter] = useState<PartOfSpeech | "all">("all");
  const [tagFilter, setTagFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("recent");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [smartFilter, setSmartFilter] = useState<
    "all" | "no-examples" | "never-reviewed" | "no-translation"
  >("all");

  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagInput, setTagInput] = useState("");

  const [selectedWord, setSelectedWord] = useState<Word | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    words.forEach((w) => w.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [words]);

  const filtered = useMemo(() => {
    let list = words;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (w) =>
          w.word.toLowerCase().includes(q) ||
          w.translation.toLowerCase().includes(q) ||
          w.notes.toLowerCase().includes(q) ||
          w.context.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== "all") list = list.filter((w) => w.status === statusFilter);
    if (partFilter !== "all") list = list.filter((w) => w.partOfSpeech === partFilter);
    if (tagFilter !== "all") list = list.filter((w) => w.tags.includes(tagFilter));
    if (favoritesOnly) list = list.filter((w) => w.isFavorite);

    // Filtres intelligents.
    if (smartFilter !== "all") {
      list = list.filter((w) => {
        const wordCards = cards.filter((c) => c.wordId === w.id);
        const wordExamples = examples.filter(
          (e) => e.wordId === w.id || wordCards.some((c) => c.id === e.parentId)
        );
        if (smartFilter === "no-examples") return wordExamples.length === 0;
        if (smartFilter === "no-translation") return !w.translation.trim();
        if (smartFilter === "never-reviewed")
          return wordCards.length > 0 && wordCards.every((c) => c.lastReviewed === null);
        return true;
      });
    }

    const sorted = [...list];
    if (sortKey === "recent") sorted.sort((a, b) => b.createdAt - a.createdAt);
    else if (sortKey === "alpha") sorted.sort((a, b) => a.word.localeCompare(b.word));
    else if (sortKey === "status") {
      const order: Record<WordStatus, number> = {
        incomplete: 0,
        complete: 1,
        learning: 2,
        mastered: 3,
      };
      sorted.sort((a, b) => order[a.status] - order[b.status]);
    } else if (sortKey === "review") {
      // Mots dont les cartes sont dues en premier (nextReview minimum).
      const nextDue = (w: Word) => {
        const ws = cards.filter((c) => c.wordId === w.id);
        if (ws.length === 0) return Number.MAX_SAFE_INTEGER;
        return Math.min(...ws.map((c) => c.nextReview));
      };
      sorted.sort((a, b) => nextDue(a) - nextDue(b));
    }
    return sorted;
  }, [words, query, statusFilter, partFilter, tagFilter, sortKey, favoritesOnly, cards, examples, smartFilter]);

  const stats = useMemo(() => {
    const incomplete = words.filter((w) => w.status === "incomplete").length;
    return {
      total: words.length,
      incomplete,
    };
  }, [words]);

  function openWord(w: Word) {
    setSelectedWord(w);
    setDetailOpen(true);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedIds(new Set(filtered.map((w) => w.id)));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function exitBulkMode() {
    setBulkMode(false);
    setSelectedIds(new Set());
    setTagInput("");
  }

  function bulkAddTag() {
    const tag = tagInput.trim().toLowerCase();
    if (!tag) return;
    let count = 0;
    for (const id of selectedIds) {
      const w = words.find((x) => x.id === id);
      if (w && !w.tags.includes(tag)) {
        updateWord(id, { tags: [...w.tags, tag] });
        count++;
      }
    }
    toast.success(`${count} fiche(s) étiquetée(s) « #${tag} ».`);
    setTagInput("");
  }

  function bulkDelete() {
    if (selectedIds.size === 0) return;
    if (
      !confirm(
        `Supprimer ${selectedIds.size} fiche(s) et tous leurs éléments ? Cette action est irréversible.`
      )
    )
      return;
    let count = 0;
    for (const id of selectedIds) {
      deleteWord(id);
      count++;
    }
    toast.success(`${count} fiche(s) supprimée(s).`);
    exitBulkMode();
  }

  return (
    <div className="flex flex-col h-full">
      {/* En-tête */}
      <div className="px-4 pt-3 pb-2 space-y-3 bg-background/80 backdrop-blur sticky top-0 z-10 border-b">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Dictionnaire</h1>
            <p className="text-xs text-muted-foreground">
              {stats.total} fiche(s) · {stats.incomplete} incomplète(s)
            </p>
          </div>
          <div className="flex gap-1.5">
            <Button
              variant={bulkMode ? "default" : "outline"}
              size="sm"
              onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
              aria-label="Mode sélection multiple"
            >
              <ListChecks className="h-4 w-4" />
              {bulkMode ? "Terminer" : "Sélectionner"}
            </Button>
            {!bulkMode && (
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setBatchOpen(true)}
                aria-label="Ajouter plusieurs mots avec l'IA"
              >
                <Sparkles className="h-4 w-4" />
              </Button>
            )}
            {!bulkMode && (
              <Button size="sm" onClick={onOpenAdd}>
                <Plus className="h-4 w-4" /> Fiche
              </Button>
            )}
          </div>
        </div>

        {/* Barre d'actions en masse */}
        {bulkMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="rounded-lg border-2 border-primary/40 bg-primary/5 p-2.5 space-y-2"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium">
                {selectedIds.size} sélectionnée(s)
              </span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAllVisible}>
                <CheckSquare className="h-3 w-3" /> Tout
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={clearSelection}>
                <Square className="h-3 w-3" /> Aucun
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-destructive ml-auto"
                onClick={bulkDelete}
                disabled={selectedIds.size === 0}
              >
                <Trash2 className="h-3 w-3" /> Supprimer
              </Button>
            </div>
            <div className="flex gap-1.5">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    bulkAddTag();
                  }
                }}
                placeholder="étiquette à ajouter…"
                className="h-8 text-xs"
                disabled={selectedIds.size === 0}
              />
              <Button
                size="sm"
                className="h-8 text-xs"
                onClick={bulkAddTag}
                disabled={selectedIds.size === 0 || !tagInput.trim()}
              >
                <Tag className="h-3 w-3" /> Étiqueter
              </Button>
            </div>
          </motion.div>
        )}

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filtrer dans le dictionnaire…"
              className="pl-9 h-9"
            />
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <Filter className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 space-y-3" align="end">
              <p className="text-sm font-medium">Filtres</p>
              <div className="space-y-1.5">
                <Label className="text-xs">Statut</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as WordStatus | "all")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="incomplete">Incomplète</SelectItem>
                    <SelectItem value="complete">Complète</SelectItem>
                    <SelectItem value="learning">En apprentissage</SelectItem>
                    <SelectItem value="mastered">Maîtrisée</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Nature</Label>
                <Select
                  value={partFilter}
                  onValueChange={(v) => setPartFilter(v as PartOfSpeech | "all")}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    <SelectItem value="nom">Nom</SelectItem>
                    <SelectItem value="verbe">Verbe</SelectItem>
                    <SelectItem value="adjectif">Adjectif</SelectItem>
                    <SelectItem value="adverbe">Adverbe</SelectItem>
                    <SelectItem value="préposition">Préposition</SelectItem>
                    <SelectItem value="expression">Expression</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Étiquette</Label>
                <Select
                  value={tagFilter}
                  onValueChange={(v) => setTagFilter(v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Toutes</SelectItem>
                    {allTags.map((t) => (
                      <SelectItem key={t} value={t}>
                        #{t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant={favoritesOnly ? "default" : "outline"}
                size="sm"
                className="w-full"
                onClick={() => setFavoritesOnly((v) => !v)}
              >
                <Star
                  className={
                    favoritesOnly ? "h-4 w-4 fill-current" : "h-4 w-4"
                  }
                />
                Favoris uniquement
              </Button>
              <div className="space-y-1.5 pt-2 border-t">
                <Label className="text-xs">Filtres intelligents</Label>
                <Select
                  value={smartFilter}
                  onValueChange={(v) =>
                    setSmartFilter(v as typeof smartFilter)
                  }
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Aucun</SelectItem>
                    <SelectItem value="no-examples">Sans exemples</SelectItem>
                    <SelectItem value="never-reviewed">Jamais révisées</SelectItem>
                    <SelectItem value="no-translation">Sans traduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex items-center gap-2">
          <ArrowDownUp className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-8 w-40 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">Plus récentes</SelectItem>
              <SelectItem value="alpha">Alphabétique</SelectItem>
              <SelectItem value="status">Par statut</SelectItem>
              <SelectItem value="review">À réviser</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Liste */}
      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3 space-y-2">
        {filtered.length === 0 ? (
          words.length === 0 ? (
            <OnboardingEmpty onAdd={onOpenAdd} />
          ) : (
            <EmptyState
              icon={BookOpen}
              title="Aucun résultat"
              description="Aucune fiche ne correspond à ces filtres."
            />
          )
        ) : (
          <AnimatePresence mode="popLayout">
          {filtered.map((w, i) => {
            const missing = missingForWord(w, cards);
            const missingParts: string[] = [];
            if (missing.chunks > 0) missingParts.push(`${missing.chunks} chunk(s)`);
            if (missing.collocations > 0)
              missingParts.push(`${missing.collocations} collocation(s)`);
            if (missing.expressions > 0)
              missingParts.push(`${missing.expressions} expression(s)`);
            const wordCards = cards.filter((c) => c.wordId === w.id);
            const isFF = isFalseFriend(w.word);
            const isCog = isCognate(w.word);
            // Maîtrise moyenne des cartes du mot (0-100%).
            const masteryPct =
              wordCards.length > 0
                ? Math.round(
                    (wordCards.reduce((s, c) => s + c.mastery, 0) /
                      (wordCards.length * 5)) *
                      100
                  )
                : 0;
            const hasMastery = wordCards.length > 0 && masteryPct > 0;
            const isSelected = selectedIds.has(w.id);

            return (
              <ClickableCard
                key={w.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.01, 0.1) }}
                onClick={() => (bulkMode ? toggleSelect(w.id) : openWord(w))}
                className={cn("p-4", bulkMode && isSelected && "ring-2 ring-primary")}
              >
                {bulkMode && (
                  <div className="absolute top-3 right-3 z-10">
                    {isSelected ? (
                      <CheckSquare className="h-5 w-5 text-primary" />
                    ) : (
                      <Square className="h-5 w-5 text-muted-foreground/60" />
                    )}
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="vocab-word text-lg truncate group-hover:text-primary transition-colors">
                        {w.word}
                      </h3>
                      <Phonetic value={w.phonetic} className="shrink" />
                      {w.isFavorite && (
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400 shrink-0" />
                      )}
                      {isFF && (
                        <span
                          title="Faux-ami — attention à la confusion"
                          className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold shrink-0"
                        >
                          ⚠
                        </span>
                      )}
                      {isCog && (
                        <span
                          title="Cognate — mot facile, ressemblant au français"
                          className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-white text-[9px] font-bold shrink-0"
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground/80 truncate mt-0.5 leading-relaxed">
                      {w.translation}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <SpeakButton text={w.word} />
                  </div>
                </div>
                <div className="flex items-center gap-1.5 mt-3 flex-wrap">
                  <StatusBadge status={w.status} />
                  <Badge variant="outline" className="text-xs capitalize">
                    {w.partOfSpeech}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {wordCards.length} élément(s)
                  </Badge>
                  {isFF && (
                    <Badge
                      variant="outline"
                      className="text-xs gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200 border-amber-300 dark:border-amber-700"
                    >
                      Faux-ami
                    </Badge>
                  )}
                  {isCog && (
                    <Badge
                      variant="outline"
                      className="text-xs gap-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 border-emerald-300 dark:border-emerald-700"
                    >
                      Cognate
                    </Badge>
                  )}
                  {hasMastery && (
                    <span
                      title={`Maîtrise moyenne : ${masteryPct}%`}
                      className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-muted-foreground"
                    >
                      <span className="relative inline-flex h-1.5 w-10 overflow-hidden rounded-full bg-muted">
                        <span
                          className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                          style={{ width: `${masteryPct}%` }}
                        />
                      </span>
                      {masteryPct}%
                    </span>
                  )}
                  {w.status === "incomplete" && missingParts.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <CircleAlert className="h-3 w-3" />
                      manque {missingParts.join(", ")}
                    </span>
                  )}
                </div>
              </ClickableCard>
            );
          })}
          </AnimatePresence>
        )}
        <div className="h-24" />
      </div>

      <AiBatchDialog open={batchOpen} onOpenChange={setBatchOpen} />

      <WordDetailSheet
        word={selectedWord}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}
