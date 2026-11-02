"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  Plus,
  Trash2,
  Star,
  Volume2,
  MessageSquarePlus,
  Share2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

import type { Card, Example, Word } from "@/lib/types";
import { useLexicon } from "@/lib/store";
import { shareWord, clipboardAvailable } from "@/lib/share";
import { findFalseFriend } from "@/lib/false-friends";
import { findCognate } from "@/lib/cognates";
import { SpeakButton } from "@/components/shared/speak-button";
import { StatusBadge, ElementBadge, MasteryBar } from "@/components/shared/badges";
import { WordFormDialog } from "./word-form-dialog";
import { Phonetic } from "@/components/shared/phonetic";

export function WordDetailSheet({
  word,
  open,
  onOpenChange,
}: {
  word: Word | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { cards, examples, deleteWord, toggleFavorite, addExample, deleteExample, deleteCard, updateCard } =
    useLexicon();
  const [editOpen, setEditOpen] = useState(false);
  const [newExampleFor, setNewExampleFor] = useState<string | null>(null);
  const [newExContent, setNewExContent] = useState("");
  const [newExTrans, setNewExTrans] = useState("");

  if (!word) return null;

  const wordCards = cards.filter((c) => c.wordId === word.id);
  const wordExamples = examples.filter((e) => e.parentId === word.id);
  const falseFriend = findFalseFriend(word.word);
  const cognate = findCognate(word.word);

  const grouped: Record<Card["type"], Card[]> = {
    chunk: wordCards.filter((c) => c.type === "chunk"),
    collocation: wordCards.filter((c) => c.type === "collocation"),
    expression: wordCards.filter((c) => c.type === "expression"),
  };

  function examplesOf(parentId: string): Example[] {
    return examples.filter((e) => e.parentId === parentId);
  }

  function submitNewExample(parentId: string) {
    if (!newExContent.trim() || !newExTrans.trim()) {
      toast.error("Exemple et traduction sont obligatoires.");
      return;
    }
    const parentCard = wordCards.find((c) => c.id === parentId);
    addExample({
      wordId: word!.id,
      parentId,
      parentType: parentCard ? parentCard.type : "word",
      content: newExContent,
      translation: newExTrans,
      personal: true,
    });
    setNewExContent("");
    setNewExTrans("");
    setNewExampleFor(null);
    toast.success("Exemple ajouté.");
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto thin-scroll">
          <SheetHeader>
            <div className="flex items-start justify-between gap-2 pr-8">
              <div className="space-y-1">
                <SheetTitle className="flex items-center gap-2 text-2xl">
                  <span>{word.word}</span>
                  <Phonetic value={word.phonetic} className="text-base font-normal" />
                  <SpeakButton text={word.word} />
                </SheetTitle>
                <SheetDescription className="text-base text-foreground">
                  {word.translation}
                </SheetDescription>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <StatusBadge status={word.status} />
              <Badge variant="outline" className="capitalize">
                {word.partOfSpeech}
              </Badge>
              {word.register && (
                <Badge variant="outline" className="capitalize">
                  {word.register}
                </Badge>
              )}
            </div>
          </SheetHeader>

          {falseFriend && (
            <div className="mx-4 mt-3 rounded-xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold shrink-0">
                  !
                </span>
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Faux-ami — attention à la confusion
                </p>
              </div>
              <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                <span className="font-semibold">« {falseFriend.en} »</span> ne
                signifie pas « {falseFriend.frLookalike} » (FR).
              </p>
              <div className="grid grid-cols-1 gap-1 text-xs pt-1">
                <p className="text-emerald-700 dark:text-emerald-300">
                  <span className="font-semibold">✓ Vrai sens :</span>{" "}
                  {falseFriend.realMeaning}
                </p>
                <p className="text-rose-700 dark:text-rose-300">
                  <span className="font-semibold">✗ À ne pas confondre :</span>{" "}
                  « {falseFriend.frLookalike} » (FR) = {falseFriend.falseMeaning}
                </p>
              </div>
              {falseFriend.note && (
                <p className="text-[11px] text-muted-foreground italic pt-0.5 border-t border-amber-300/40 mt-1.5 pt-1.5">
                  💡 {falseFriend.note}
                </p>
              )}
            </div>
          )}

          {cognate && (
            <div className="mx-4 mt-3 rounded-xl border border-emerald-400/50 bg-emerald-50 dark:bg-emerald-950/30 p-3 flex items-start gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white text-xs font-bold shrink-0">
                ✓
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                  Cognate — mot facile
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                  « {cognate.en} » ressemble à « {cognate.fr} » (FR) et a le même sens :
                  vous l'apprenez plus vite.
                </p>
                {cognate.note && (
                  <p className="text-[11px] text-muted-foreground italic mt-1 pt-1 border-t border-emerald-300/40">
                    💡 {cognate.note}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4 px-4 pb-8">
            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" /> Modifier
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggleFavorite(word.id)}
              >
                <Star
                  className={
                    word.isFavorite
                      ? "h-4 w-4 fill-amber-400 text-amber-400"
                      : "h-4 w-4"
                  }
                />
                {word.isFavorite ? "Favori" : "Favori"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const result = await shareWord(word, wordCards);
                  if (result === "shared") toast.success("Fiche partagée.");
                  else if (result === "copied")
                    toast.success("Fiche copiée dans le presse-papier.");
                  else if (result === "failed" && !clipboardAvailable())
                    toast.error("Le partage n'est pas supporté sur cet appareil.");
                }}
              >
                <Share2 className="h-4 w-4" /> Partager
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive ml-auto"
                onClick={() => {
                  if (
                    confirm(
                      `Supprimer la fiche « ${word.word} » et tous ses éléments ? Cette action est irréversible.`
                    )
                  ) {
                    deleteWord(word.id);
                    toast.success("Fiche supprimée.");
                    onOpenChange(false);
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Supprimer
              </Button>
            </div>

            {word.context && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Contexte
                </p>
                <p className="text-sm mt-1">{word.context}</p>
              </div>
            )}

            {word.notes && (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Notes
                </p>
                <p className="text-sm mt-1 whitespace-pre-wrap">{word.notes}</p>
              </div>
            )}

            {word.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {word.tags.map((t) => (
                  <Badge key={t} variant="secondary" className="text-xs">
                    #{t}
                  </Badge>
                ))}
              </div>
            )}

            <Separator />

            {/* Éléments par type */}
            {(["chunk", "collocation", "expression"] as const).map((type) => (
              <div key={type} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ElementBadge type={type} />
                    <span className="text-xs text-muted-foreground">
                      {grouped[type].length}/3
                    </span>
                  </div>
                </div>
                {grouped[type].length === 0 && (
                  <p className="text-xs text-muted-foreground italic pl-1">
                    Aucun {type} pour l'instant.
                  </p>
                )}
                <div className="space-y-2">
                  {grouped[type].map((c) => (
                    <div
                      key={c.id}
                      className="rounded-lg border p-3 bg-card space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm break-words">
                            {c.content}
                          </p>
                          <p className="text-sm text-muted-foreground break-words">
                            {c.translation}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <SpeakButton text={c.content} size="sm" />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => {
                              if (confirm("Supprimer cet élément ?")) deleteCard(c.id);
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <MasteryBar level={c.mastery} />
                        <span className="text-xs text-muted-foreground">
                          {c.mastery === 0
                            ? "Nouveau"
                            : c.mastery >= 5
                            ? "Maîtrisé"
                            : `Niveau ${c.mastery}/5`}
                        </span>
                        {c.errorCount > 0 && (
                          <Badge variant="outline" className="text-xs text-destructive">
                            {c.errorCount} erreur(s)
                          </Badge>
                        )}
                      </div>
                      {/* Exemples */}
                      <div className="space-y-1.5">
                        {examplesOf(c.id).map((e) => (
                          <div
                            key={e.id}
                            className="rounded-md bg-muted/50 p-2 text-xs space-y-0.5"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <p className="break-words">
                                <span className="text-muted-foreground">EN:</span>{" "}
                                {e.content}
                              </p>
                              <div className="flex shrink-0 gap-0.5">
                                <SpeakButton text={e.content} size="sm" />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-destructive"
                                  onClick={() => deleteExample(e.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                            <p className="break-words">
                              <span className="text-muted-foreground">FR:</span>{" "}
                              {e.translation}
                            </p>
                            {e.personal && (
                              <Badge variant="outline" className="text-[10px] h-4">
                                Personnel
                              </Badge>
                            )}
                          </div>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() =>
                            setNewExampleFor(
                              newExampleFor === c.id ? null : c.id
                            )
                          }
                        >
                          <MessageSquarePlus className="h-3 w-3" />
                          {examplesOf(c.id).length === 0 ? "Ajouter un exemple" : "Autre exemple"}
                        </Button>
                        {newExampleFor === c.id && (
                          <div className="rounded-md border p-2 space-y-2">
                            <Input
                              value={newExContent}
                              onChange={(e) => setNewExContent(e.target.value)}
                              placeholder="phrase en anglais"
                              className="h-8 text-sm"
                            />
                            <Input
                              value={newExTrans}
                              onChange={(e) => setNewExTrans(e.target.value)}
                              placeholder="traduction française"
                              className="h-8 text-sm"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                className="h-7"
                                onClick={() => submitNewExample(c.id)}
                              >
                                Enregistrer
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7"
                                onClick={() => setNewExampleFor(null)}
                              >
                                Annuler
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <Separator />

            {/* Exemples rattachés au mot */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Exemples du mot</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    setNewExampleFor(
                      newExampleFor === word.id ? null : word.id
                    )
                  }
                >
                  <Plus className="h-3 w-3" /> Exemple
                </Button>
              </div>
              {wordExamples.map((e) => (
                <div key={e.id} className="rounded-md bg-muted/50 p-2 text-xs space-y-0.5">
                  <div className="flex items-start justify-between gap-1">
                    <p className="break-words">
                      <span className="text-muted-foreground">EN:</span> {e.content}
                    </p>
                    <div className="flex shrink-0 gap-0.5">
                      <SpeakButton text={e.content} size="sm" />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive"
                        onClick={() => deleteExample(e.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <p className="break-words">
                    <span className="text-muted-foreground">FR:</span> {e.translation}
                  </p>
                </div>
              ))}
              {newExampleFor === word.id && (
                <div className="rounded-md border p-2 space-y-2">
                  <Input
                    value={newExContent}
                    onChange={(e) => setNewExContent(e.target.value)}
                    placeholder="phrase en anglais"
                    className="h-8 text-sm"
                  />
                  <Input
                    value={newExTrans}
                    onChange={(e) => setNewExTrans(e.target.value)}
                    placeholder="traduction française"
                    className="h-8 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7" onClick={() => submitNewExample(word.id)}>
                      Enregistrer
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      onClick={() => setNewExampleFor(null)}
                    >
                      Annuler
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <WordFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingWord={word}
      />
    </>
  );
}
