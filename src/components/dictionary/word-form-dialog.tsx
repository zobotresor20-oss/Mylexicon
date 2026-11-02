"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, Pencil, Check, X, Sparkles, Loader2 } from "lucide-react";
import { v4 as uuid } from "uuid";
import { motion, AnimatePresence } from "framer-motion";

import type {
  Card,
  ElementType,
  Example,
  PartOfSpeech,
  Register,
  Word,
} from "@/lib/types";
import { useLexicon, type NewWordInput } from "@/lib/store";
import { findFalseFriend } from "@/lib/false-friends";
import { generateEntry, AiError } from "@/lib/ai";
import { normalizePhonetic } from "@/lib/phonetic";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SpeakButton } from "@/components/shared/speak-button";
import { ElementBadge } from "@/components/shared/badges";
import { toast } from "sonner";

const PARTS: PartOfSpeech[] = [
  "nom",
  "verbe",
  "adjectif",
  "adverbe",
  "préposition",
  "conjonction",
  "pronom",
  "déterminant",
  "interjection",
  "expression",
  "autre",
];

const REGISTERS: Register[] = [
  "familier",
  "courant",
  "soutenu",
  "professionnel",
  "académique",
  "technique",
];

const ELEMENT_TYPES: ElementType[] = ["chunk", "collocation", "expression"];

interface DraftCard {
  id: string; // temporaire
  type: ElementType;
  content: string;
  translation: string;
  isNew: boolean;
  existingId?: string; // si édition d'une carte existante
}

interface DraftExample {
  id: string;
  parentId: string; // id temporaire ou réel d'un mot/carte
  content: string;
  translation: string;
  isNew: boolean;
  existingId?: string;
}

export function WordFormDialog({
  open,
  onOpenChange,
  editingWord,
  prefillWord,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editingWord?: Word | null;
  /** Pré-remplit le champ mot lors d'une création (ex: depuis la recherche). */
  prefillWord?: string;
  onSaved?: (wordId: string) => void;
}) {
  const { cards, examples, addWord, updateWord, addCard, updateCard, deleteCard, addExample, updateExample, deleteExample } =
    useLexicon();

  // Champs du mot.
  const [word, setWord] = useState("");
  const [translation, setTranslation] = useState("");
  const [phonetic, setPhonetic] = useState("");
  const [partOfSpeech, setPartOfSpeech] = useState<PartOfSpeech>("nom");
  const [register, setRegister] = useState<Register | "">("courant");
  const [context, setContext] = useState("");
  const [notes, setNotes] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const [draftCards, setDraftCards] = useState<DraftCard[]>([]);
  const [draftExamples, setDraftExamples] = useState<DraftExample[]>([]);
  const [aiLoading, setAiLoading] = useState(false);

  // Initialise le formulaire à l'ouverture (synchronisation prop -> état local
  // du formulaire). Pattern légitime pour un dialogue réutilisable.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return;
    if (editingWord) {
      setWord(editingWord.word);
      setTranslation(editingWord.translation);
      setPhonetic(editingWord.phonetic ?? "");
      setPartOfSpeech(editingWord.partOfSpeech);
      setRegister(editingWord.register);
      setContext(editingWord.context);
      setNotes(editingWord.notes);
      setTags(editingWord.tags);
      const existingCards = cards
        .filter((c) => c.wordId === editingWord.id)
        .map((c) => ({
          id: c.id,
          type: c.type,
          content: c.content,
          translation: c.translation,
          isNew: false,
          existingId: c.id,
        }));
      setDraftCards(existingCards);
      const existingExamples = examples
        .filter((e) => e.wordId === editingWord.id)
        .map((e) => ({
          id: e.id,
          parentId: e.parentId,
          content: e.content,
          translation: e.translation,
          isNew: false,
          existingId: e.id,
        }));
      setDraftExamples(existingExamples);
    } else {
      setWord(prefillWord ?? "");
      setTranslation("");
      setPhonetic("");
      setPartOfSpeech("nom");
      setRegister("courant");
      setContext("");
      setNotes("");
      setTags([]);
      setDraftCards([]);
      setDraftExamples([]);
    }
    setTagInput("");
  }, [open, editingWord, cards, examples, prefillWord]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Remplit tout le formulaire à partir de la fiche générée par l'IA.
  async function handleGenerate() {
    const w = word.trim();
    if (!w) {
      toast.error("Saisissez d'abord le mot en anglais.");
      return;
    }
    if (
      (translation.trim() || draftCards.length > 0) &&
      !confirm("Remplacer le contenu actuel du formulaire par la fiche générée ?")
    )
      return;
    setAiLoading(true);
    try {
      const entry = await generateEntry(w);
      setWord(entry.word);
      setTranslation(entry.translation);
      setPhonetic(entry.phonetic ?? "");
      setPartOfSpeech(entry.partOfSpeech);
      setRegister(entry.register);
      setContext(entry.context);
      setNotes(entry.notes);
      setTags(Array.from(new Set([...entry.tags, "ia"])));
      const cardsOut: DraftCard[] = [];
      const examplesOut: DraftExample[] = [];
      const groups = [
        ["chunk", entry.chunks],
        ["collocation", entry.collocations],
        ["expression", entry.expressions],
      ] as const;
      for (const [type, list] of groups) {
        for (const el of list) {
          const id = uuid();
          cardsOut.push({ id, type, content: el.content, translation: el.translation, isNew: true });
          examplesOut.push({
            id: uuid(),
            parentId: id,
            content: el.example.content,
            translation: el.example.translation,
            isNew: true,
          });
        }
      }
      setDraftCards(cardsOut);
      setDraftExamples(examplesOut);
      toast.success("Fiche préparée : vérifiez-la, corrigez si besoin, puis enregistrez.");
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "La génération a échoué. Réessayez.");
    } finally {
      setAiLoading(false);
    }
  }

  function addTag() {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
    setTagInput("");
  }

  function addDraftCard(type: ElementType) {
    const id = uuid();
    setDraftCards([
      ...draftCards,
      { id, type, content: "", translation: "", isNew: true },
    ]);
  }

  function updateDraftCard(id: string, patch: Partial<DraftCard>) {
    setDraftCards(draftCards.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  function removeDraftCard(id: string) {
    setDraftCards(draftCards.filter((c) => c.id !== id));
    // Supprime aussi les exemples rattachés (en brouillon).
    setDraftExamples(draftExamples.filter((e) => e.parentId !== id));
  }

  function addDraftExample(parentId: string) {
    const id = uuid();
    setDraftExamples([
      ...draftExamples,
      { id, parentId, content: "", translation: "", isNew: true },
    ]);
  }

  function updateDraftExample(id: string, patch: Partial<DraftExample>) {
    setDraftExamples(draftExamples.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  function removeDraftExample(id: string) {
    setDraftExamples(draftExamples.filter((e) => e.id !== id));
  }

  // Compteurs par type.
  const counts = {
    chunk: draftCards.filter((c) => c.type === "chunk").length,
    collocation: draftCards.filter((c) => c.type === "collocation").length,
    expression: draftCards.filter((c) => c.type === "expression").length,
  };
  const isComplete =
    counts.chunk >= 3 && counts.collocation >= 3 && counts.expression >= 3;

  function handleSave() {
    if (!word.trim()) {
      toast.error("Le mot anglais est obligatoire.");
      return;
    }
    if (!translation.trim()) {
      toast.error("La traduction française est obligatoire.");
      return;
    }
    // Vérifie que chaque carte a sa traduction.
    for (const c of draftCards) {
      if (c.content.trim() && !c.translation.trim()) {
        toast.error(`Traduction manquante pour : ${c.content}`);
        return;
      }
      if (!c.content.trim() && c.translation.trim()) {
        toast.error(`Contenu manquant pour : ${c.translation}`);
        return;
      }
    }
    for (const e of draftExamples) {
      if (e.content.trim() && !e.translation.trim()) {
        toast.error(`Traduction manquante pour l'exemple : ${e.content}`);
        return;
      }
    }

    const input: NewWordInput = {
      word,
      translation,
      phonetic: normalizePhonetic(phonetic),
      partOfSpeech,
      register: register || "",
      context,
      notes,
      tags,
    };

    let wordId: string;
    if (editingWord) {
      updateWord(editingWord.id, input);
      wordId = editingWord.id;
    } else {
      wordId = addWord(input);
    }

    // Gère les cartes.
    for (const dc of draftCards) {
      if (!dc.content.trim()) continue;
      if (dc.isNew) {
        const newCardId = addCard({
          wordId,
          type: dc.type,
          content: dc.content,
          translation: dc.translation,
        });
        // Ajoute les exemples rattachés (brouillon) à la nouvelle carte.
        const childEx = draftExamples.filter(
          (e) => e.parentId === dc.id && e.content.trim()
        );
        for (const e of childEx) {
          addExample({
            wordId,
            parentId: newCardId,
            parentType: dc.type,
            content: e.content,
            translation: e.translation,
          });
        }
      } else if (dc.existingId) {
        updateCard(dc.existingId, {
          content: dc.content,
          translation: dc.translation,
        });
      }
    }
    // Supprime les cartes existantes retirées.
    if (editingWord) {
      const existingCardIds = cards
        .filter((c) => c.wordId === editingWord.id)
        .map((c) => c.id);
      const keptIds = draftCards
        .filter((c) => c.existingId)
        .map((c) => c.existingId!);
      for (const id of existingCardIds) {
        if (!keptIds.includes(id)) deleteCard(id);
      }
    }

    // Gère les exemples rattachés au mot (parentId === wordId).
    for (const e of draftExamples) {
      if (!e.content.trim()) continue;
      if (e.parentId !== wordId && e.parentId !== "new-word") continue; // les autres sont traités avec leur carte
      if (e.isNew) {
        addExample({
          wordId,
          parentId: wordId,
          parentType: "word",
          content: e.content,
          translation: e.translation,
        });
      } else if (e.existingId) {
        updateExample(e.existingId, {
          content: e.content,
          translation: e.translation,
        });
      }
    }
    // Supprime les exemples existants retirés.
    if (editingWord) {
      const existingExIds = examples
        .filter((e) => e.wordId === editingWord.id)
        .map((e) => e.id);
      const keptExIds = draftExamples
        .filter((e) => e.existingId)
        .map((e) => e.existingId!);
      for (const id of existingExIds) {
        if (!keptExIds.includes(id)) deleteExample(id);
      }
    }

    toast.success(editingWord ? "Fiche mise à jour." : "Fiche ajoutée.");
    onSaved?.(wordId);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto thin-scroll">
        <DialogHeader>
          <DialogTitle>
            {editingWord ? "Modifier la fiche" : "Nouvelle fiche"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Section mot */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wf-word">Mot (anglais) *</Label>
              <div className="flex gap-2">
                <Input
                  id="wf-word"
                  value={word}
                  onChange={(e) => setWord(e.target.value)}
                  placeholder="ex : stubborn"
                  autoFocus
                />
                {word.trim() && <SpeakButton text={word} />}
              </div>
              {!editingWord && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full h-9 border-primary/40 text-primary"
                  onClick={handleGenerate}
                  disabled={aiLoading || !word.trim()}
                >
                  {aiLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Préparation de la fiche…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" /> Remplir la fiche avec l'IA
                    </>
                  )}
                </Button>
              )}
              {word.trim() && findFalseFriend(word) && (
                <div className="rounded-md border border-amber-400/60 bg-amber-50 dark:bg-amber-950/40 p-2 text-xs space-y-1">
                  <p className="font-semibold text-amber-800 dark:text-amber-200 flex items-center gap-1">
                    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold">
                      !
                    </span>
                    Faux-ami détecté
                  </p>
                  <p className="text-amber-700 dark:text-amber-300">
                    « {word.trim()} » ne signifie pas « {findFalseFriend(word)?.frLookalike} ».
                    Vrai sens : <span className="font-medium">{findFalseFriend(word)?.realMeaning}</span>.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wf-trans">Traduction française *</Label>
              <Input
                id="wf-trans"
                value={translation}
                onChange={(e) => setTranslation(e.target.value)}
                placeholder="ex : têtu, obstiné"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-phonetic">Prononciation (phonétique)</Label>
            <Input
              id="wf-phonetic"
              value={phonetic}
              onChange={(e) => setPhonetic(e.target.value)}
              placeholder="ex : ˈstʌbərn"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
            />
            <p className="text-[11px] text-muted-foreground">
              Alphabet phonétique international, sans les barres obliques. Remplie par
              l'IA selon l'accent choisi dans les Réglages, et modifiable.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nature grammaticale</Label>
              <Select
                value={partOfSpeech}
                onValueChange={(v) => setPartOfSpeech(v as PartOfSpeech)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Registre</Label>
              <Select
                value={register || "aucun"}
                onValueChange={(v) =>
                  setRegister(v === "aucun" ? "" : (v as Register))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aucun">—</SelectItem>
                  {REGISTERS.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-context">Contexte d'utilisation</Label>
            <Textarea
              id="wf-context"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Situation, registre, nuances…"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-notes">Notes personnelles</Label>
            <Textarea
              id="wf-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Vos remarques, astuces de mémorisation…"
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="wf-tags">Étiquettes</Label>
            <div className="flex gap-2">
              <Input
                id="wf-tags"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag();
                  }
                }}
                placeholder="ex : caractère, et Entrée"
              />
              <Button type="button" variant="secondary" onClick={addTag}>
                Ajouter
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <Badge
                    key={t}
                    variant="secondary"
                    className="cursor-pointer gap-1"
                    onClick={() => setTags(tags.filter((x) => x !== t))}
                  >
                    {t}
                    <X className="h-3 w-3" />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Statut complétude */}
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">
                Statut :{" "}
                {isComplete ? (
                  <span className="text-emerald-600 dark:text-emerald-400">Complète</span>
                ) : (
                  <span className="text-amber-600 dark:text-amber-400">Incomplète</span>
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                Chunks {counts.chunk}/3 · Collocations {counts.collocation}/3 · Expressions{" "}
                {counts.expression}/3
              </span>
            </div>
            {!isComplete && (
              <p className="text-xs text-muted-foreground mt-1">
                Il manque :{" "}
                {[
                  counts.chunk < 3 && `${3 - counts.chunk} chunk(s)`,
                  counts.collocation < 3 && `${3 - counts.collocation} collocation(s)`,
                  counts.expression < 3 && `${3 - counts.expression} expression(s)`,
                ]
                  .filter(Boolean)
                  .join(", ")}
                . La fiche sera enregistrée incomplète.
              </p>
            )}
          </div>

          {/* Chunks / Collocations / Expressions */}
          {ELEMENT_TYPES.map((type) => (
            <div key={type} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ElementBadge type={type} />
                  <span className="text-xs text-muted-foreground">
                    {counts[type]}/3 minimum
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => addDraftCard(type)}
                  className="h-8"
                >
                  <Plus className="h-4 w-4" /> Ajouter
                </Button>
              </div>
              <AnimatePresence initial={false}>
                {draftCards
                  .filter((c) => c.type === type)
                  .map((c) => (
                    <motion.div
                      key={c.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="rounded-lg border p-3 space-y-2 bg-card"
                    >
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Input
                          value={c.content}
                          onChange={(e) =>
                            updateDraftCard(c.id, { content: e.target.value })
                          }
                          placeholder={`${type} (anglais)`}
                        />
                        <Input
                          value={c.translation}
                          onChange={(e) =>
                            updateDraftCard(c.id, { translation: e.target.value })
                          }
                          placeholder="traduction française"
                        />
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          {c.content.trim() && <SpeakButton text={c.content} />}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => addDraftExample(c.id)}
                          >
                            <Plus className="h-3 w-3" /> Exemple
                          </Button>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeDraftCard(c.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {/* Exemples rattachés à cette carte (brouillon) */}
                      {draftExamples
                        .filter((e) => e.parentId === c.id)
                        .map((e) => (
                          <div
                            key={e.id}
                            className="rounded-md bg-muted/50 p-2 space-y-2"
                          >
                            <Input
                              value={e.content}
                              onChange={(ev) =>
                                updateDraftExample(e.id, { content: ev.target.value })
                              }
                              placeholder="phrase d'exemple (anglais)"
                              className="h-8 text-sm"
                            />
                            <div className="flex gap-2">
                              <Input
                                value={e.translation}
                                onChange={(ev) =>
                                  updateDraftExample(e.id, {
                                    translation: ev.target.value,
                                  })
                                }
                                placeholder="traduction française"
                                className="h-8 text-sm"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => removeDraftExample(e.id)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))}
                    </motion.div>
                  ))}
              </AnimatePresence>
            </div>
          ))}

          {/* Exemples rattachés au mot */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Exemples du mot</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8"
                onClick={() => addDraftExample(editingWord?.id ?? "new-word")}
              >
                <Plus className="h-4 w-4" /> Exemple
              </Button>
            </div>
            <AnimatePresence initial={false}>
              {draftExamples
                .filter(
                  (e) => e.parentId === (editingWord?.id ?? "new-word")
                )
                .map((e) => (
                  <motion.div
                    key={e.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-lg border p-2 space-y-2 bg-card"
                  >
                    <Input
                      value={e.content}
                      onChange={(ev) =>
                        updateDraftExample(e.id, { content: ev.target.value })
                      }
                      placeholder="phrase d'exemple (anglais)"
                      className="h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Input
                        value={e.translation}
                        onChange={(ev) =>
                          updateDraftExample(e.id, { translation: ev.target.value })
                        }
                        placeholder="traduction française"
                        className="h-8 text-sm"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive"
                        onClick={() => removeDraftExample(e.id)}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSave}>
            <Check className="h-4 w-4" />
            {editingWord ? "Enregistrer" : "Ajouter la fiche"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
