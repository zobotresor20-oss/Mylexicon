"use client";

import { useRef, useState } from "react";
import {
  Sparkles,
  Loader2,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  CircleAlert,
} from "lucide-react";
import { toast } from "sonner";

import { useLexicon } from "@/lib/store";
import {
  AiError,
  generateEntry,
  getAccessCode,
  parseWordList,
  saveGeneratedEntry,
  type GeneratedEntry,
} from "@/lib/ai";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Phonetic } from "@/components/shared/phonetic";
import { cn } from "@/lib/utils";

const MAX_WORDS = 20;
const PAUSE_MS = 1500;

type ItemStatus = "ready" | "saved" | "rejected" | "duplicate" | "error";

interface Item {
  id: string;
  word: string;
  status: ItemStatus;
  entry?: GeneratedEntry;
  error?: string;
  open?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function AiBatchDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const stopRef = useRef(false);

  function patch(id: string, change: Partial<Item>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...change } : it)));
  }

  async function start() {
    if (running) return;
    if (!getAccessCode()) {
      toast.error("Ajoutez d'abord votre code d'accès dans Réglages, section Assistant IA.");
      return;
    }
    let words = parseWordList(text);
    if (words.length === 0) {
      toast.error("Saisissez au moins un mot, un par ligne.");
      return;
    }
    if (words.length > MAX_WORDS) {
      toast.info(`Maximum ${MAX_WORDS} mots à la fois : les ${words.length - MAX_WORDS} derniers sont ignorés.`);
      words = words.slice(0, MAX_WORDS);
    }

    stopRef.current = false;
    setRunning(true);
    setItems([]);
    setProgress({ done: 0, total: words.length });

    const existing = new Set(
      useLexicon.getState().words.map((w) => w.word.toLowerCase().trim())
    );

    let done = 0;
    for (let i = 0; i < words.length; i++) {
      if (stopRef.current) break;
      const word = words[i];
      const id = `${Date.now()}-${i}`;

      // Un mot déjà présent n'est pas envoyé à l'IA : on économise le quota.
      if (existing.has(word.toLowerCase())) {
        setItems((prev) => [...prev, { id, word, status: "duplicate" }]);
        done++;
        setProgress({ done, total: words.length });
        continue;
      }

      try {
        const entry = await generateEntry(word);
        setItems((prev) => [...prev, { id, word, status: "ready", entry }]);
      } catch (err) {
        const e = err instanceof AiError ? err : new AiError("server", "Erreur inattendue.");
        setItems((prev) => [...prev, { id, word, status: "error", error: e.message }]);
        // Ces erreurs concernent toute la série : inutile de continuer.
        if (e.kind === "quota" || e.kind === "auth" || e.kind === "offline" || e.kind === "no-code") {
          toast.error(e.message);
          done++;
          setProgress({ done, total: words.length });
          break;
        }
      }
      done++;
      setProgress({ done, total: words.length });
      if (i < words.length - 1 && !stopRef.current) await sleep(PAUSE_MS);
    }
    setRunning(false);
  }

  function stop() {
    stopRef.current = true;
  }

  function validate(item: Item) {
    if (!item.entry) return;
    saveGeneratedEntry(item.entry);
    patch(item.id, { status: "saved" });
  }

  function validateAll() {
    const ready = items.filter((it) => it.status === "ready" && it.entry);
    for (const it of ready) saveGeneratedEntry(it.entry!);
    setItems((prev) =>
      prev.map((it) => (it.status === "ready" ? { ...it, status: "saved" } : it))
    );
    if (ready.length > 0) toast.success(`${ready.length} fiche(s) ajoutée(s) au dictionnaire.`);
  }

  function reset() {
    stopRef.current = true;
    setItems([]);
    setText("");
    setProgress({ done: 0, total: 0 });
    setRunning(false);
  }

  const readyCount = items.filter((it) => it.status === "ready").length;
  const savedCount = items.filter((it) => it.status === "saved").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto thin-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Ajouter plusieurs mots avec l'IA
          </DialogTitle>
          <DialogDescription>
            Collez vos mots du jour, un par ligne. L'IA prépare chaque fiche, vous
            vérifiez puis validez.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"stubborn\nreluctant\ndrag one's feet"}
            rows={5}
            disabled={running}
            className="text-base"
          />
          <div className="flex items-center gap-2">
            {running ? (
              <Button variant="outline" className="flex-1 h-10" onClick={stop}>
                <X className="h-4 w-4" /> Arrêter
              </Button>
            ) : (
              <Button className="flex-1 h-10" onClick={start} disabled={!text.trim()}>
                <Sparkles className="h-4 w-4" /> Préparer les fiches
              </Button>
            )}
            {items.length > 0 && !running && (
              <Button variant="ghost" className="h-10" onClick={reset}>
                Effacer
              </Button>
            )}
          </div>

          {running && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {progress.done} sur {progress.total} fiche(s) préparée(s)…
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Chaque mot est envoyé à Google pour générer la fiche. Les autres données
            restent sur votre appareil.
          </p>
        </div>

        {items.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {readyCount > 0
                  ? `${readyCount} fiche(s) à valider`
                  : savedCount > 0
                  ? `${savedCount} fiche(s) ajoutée(s)`
                  : "Résultat"}
              </p>
              {readyCount > 1 && (
                <Button size="sm" onClick={validateAll}>
                  <Check className="h-4 w-4" /> Tout valider
                </Button>
              )}
            </div>

            {items.map((it) => (
              <ResultRow
                key={it.id}
                item={it}
                onToggle={() => patch(it.id, { open: !it.open })}
                onValidate={() => validate(it)}
                onReject={() => patch(it.id, { status: "rejected" })}
              />
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResultRow({
  item,
  onToggle,
  onValidate,
  onReject,
}: {
  item: Item;
  onToggle: () => void;
  onValidate: () => void;
  onReject: () => void;
}) {
  const { entry } = item;

  if (item.status === "duplicate") {
    return (
      <div className="rounded-lg border p-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{item.word}</span> est déjà dans
        votre dictionnaire.
      </div>
    );
  }

  if (item.status === "error") {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <CircleAlert className="h-4 w-4 text-destructive shrink-0" />
          {item.word}
        </p>
        <p className="text-muted-foreground mt-0.5">{item.error}</p>
      </div>
    );
  }

  if (!entry) return null;

  const settled = item.status === "saved" || item.status === "rejected";

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 space-y-2",
        settled && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 min-w-0">
            <p className="vocab-word text-lg truncate">{entry.word}</p>
            <Phonetic value={entry.phonetic} />
          </div>
          <p className="text-sm text-muted-foreground break-words">{entry.translation}</p>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            <Badge variant="outline" className="capitalize">
              {entry.partOfSpeech}
            </Badge>
            <Badge variant="outline">{entry.chunks.length} chunks</Badge>
            <Badge variant="outline">{entry.collocations.length} collocations</Badge>
            <Badge variant="outline">{entry.expressions.length} expressions</Badge>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {item.status === "ready" ? (
            <>
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 text-destructive"
                onClick={onReject}
                aria-label={`Rejeter ${entry.word}`}
              >
                <X className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                className="h-8 w-8 bg-emerald-600 hover:bg-emerald-700"
                onClick={onValidate}
                aria-label={`Valider ${entry.word}`}
              >
                <Check className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">
              {item.status === "saved" ? "Ajoutée" : "Rejetée"}
            </span>
          )}
        </div>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        onClick={onToggle}
      >
        {item.open ? (
          <>
            <ChevronUp className="h-3.5 w-3.5" /> Masquer le détail
          </>
        ) : (
          <>
            <ChevronDown className="h-3.5 w-3.5" /> Voir le détail
          </>
        )}
      </Button>

      {item.open && (
        <div className="space-y-3 text-sm">
          {entry.context && <p className="text-muted-foreground">{entry.context}</p>}
          {entry.notes && (
            <p className="rounded-md bg-muted/50 p-2 text-xs">{entry.notes}</p>
          )}
          <Group title="Chunks" list={entry.chunks} />
          <Group title="Collocations" list={entry.collocations} />
          <Group title="Expressions" list={entry.expressions} />
        </div>
      )}
    </div>
  );
}

function Group({
  title,
  list,
}: {
  title: string;
  list: GeneratedEntry["chunks"];
}) {
  if (list.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      {list.map((el, i) => (
        <div key={i} className="rounded-md border p-2 space-y-0.5">
          <p className="font-medium break-words">
            {el.content}{" "}
            <span className="font-normal text-muted-foreground">— {el.translation}</span>
          </p>
          <p className="text-xs break-words">{el.example.content}</p>
          <p className="text-xs text-muted-foreground break-words">
            {el.example.translation}
          </p>
        </div>
      ))}
    </div>
  );
}
