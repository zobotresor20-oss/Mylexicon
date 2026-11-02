"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Settings as SettingsIcon,
  Palette,
  Volume2,
  Type,
  Target,
  Bell,
  Database,
  Download,
  Upload,
  FileSpreadsheet,
  Trash2,
  Sparkles,
  Moon,
  Sun,
  Monitor,
  AlertTriangle,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { useLexicon } from "@/lib/store";
import { buildDemoBackup } from "@/lib/demo-data";
import { exportCsv, downloadFile } from "@/lib/export";
import { parseCsv, exportAnkiCloze } from "@/lib/csv-import-export";
import { speak } from "@/lib/speech";
import { AiError, checkAccessCode, getAccessCode, setAccessCode } from "@/lib/ai";
import type { Accent, BackupData } from "@/lib/types";
import { Card as UICard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function SettingsView() {
  const {
    settings,
    updateSettings,
    buildBackup,
    restoreBackup,
    clearAll,
    words,
    cards,
    examples,
    addWord,
  } = useLexicon();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);
  const csvImportRef = useRef<HTMLInputElement>(null);
  const [restoreMode, setRestoreMode] = useState<"replace" | "merge">("merge");
  const [exportStatusFilter, setExportStatusFilter] = useState<string>("all");
  const [exportTagFilter, setExportTagFilter] = useState<string>("all");
  const [aiCode, setAiCode] = useState("");
  const [aiChecking, setAiChecking] = useState(false);

  useEffect(() => {
    setAiCode(getAccessCode());
  }, []);

  async function handleSaveAiCode() {
    const code = aiCode.trim();
    setAccessCode(code);
    if (!code) {
      toast.info("Code supprimé de cet appareil.");
      return;
    }
    setAiChecking(true);
    try {
      await checkAccessCode(code);
      toast.success("Code valide : l'assistant IA est prêt.");
    } catch (err) {
      toast.error(err instanceof AiError ? err.message : "Vérification impossible.");
    } finally {
      setAiChecking(false);
    }
  }

  // Mots filtrés selon les filtres d'export.
  const filteredWordsForExport = useMemo(() => {
    let list = words;
    if (exportStatusFilter !== "all") {
      list = list.filter((w) => w.status === exportStatusFilter);
    }
    if (exportTagFilter !== "all") {
      list = list.filter((w) => w.tags.includes(exportTagFilter));
    }
    return list;
  }, [words, exportStatusFilter, exportTagFilter]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    words.forEach((w) => w.tags.forEach((t) => set.add(t)));
    return Array.from(set).sort();
  }, [words]);

  function handleExportJson() {
    const date = new Date().toISOString().slice(0, 10);
    if (exportStatusFilter === "all" && exportTagFilter === "all") {
      // Sauvegarde complète.
      const data = buildBackup();
      const json = JSON.stringify(data, null, 2);
      downloadFile(`mylexicon-${date}.json`, json, "application/json");
      toast.success("Sauvegarde complète exportée.");
    } else {
      // Export filtré (mots + cartes + exemples liés).
      const wIds = new Set(filteredWordsForExport.map((w) => w.id));
      const data = {
        app: "MyLexicon",
        version: 1,
        exportedAt: Date.now(),
        words: filteredWordsForExport,
        cards: cards.filter((c) => wIds.has(c.wordId)),
        examples: examples.filter((e) => wIds.has(e.wordId)),
        settings,
      };
      const json = JSON.stringify(data, null, 2);
      const suffix =
        exportStatusFilter !== "all" ? `-${exportStatusFilter}` : "";
      const tagSuffix =
        exportTagFilter !== "all" ? `-${exportTagFilter}` : "";
      downloadFile(
        `mylexicon-filtre${suffix}${tagSuffix}-${date}.json`,
        json,
        "application/json"
      );
      toast.success(
        `Export filtré : ${filteredWordsForExport.length} fiche(s).`
      );
    }
  }

  function handleExportCsv() {
    if (filteredWordsForExport.length === 0) {
      toast.error("Aucune fiche à exporter avec ces filtres.");
      return;
    }
    const wIds = new Set(filteredWordsForExport.map((w) => w.id));
    const csv = exportCsv(
      filteredWordsForExport,
      cards.filter((c) => wIds.has(c.wordId)),
      examples.filter((e) => wIds.has(e.wordId))
    );
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`mylexicon-dictionnaire-${date}.csv`, csv, "text/csv;charset=utf-8");
    toast.success(
      `CSV exporté : ${filteredWordsForExport.length} fiche(s).`
    );
  }

  function handleCsvImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const content = reader.result as string;
        const { rows, errors } = parseCsv(content);
        if (rows.length === 0) {
          toast.error(
            errors.length > 0
              ? `Aucune ligne valide. ${errors[0]}`
              : "Aucune ligne trouvée dans le fichier."
          );
          return;
        }
        if (
          !confirm(
            `Importer ${rows.length} fiche(s) depuis le fichier CSV ? ${
              errors.length > 0 ? `(${errors.length} ligne(s) ignorée(s))` : ""
            }`
          )
        )
          return;
        let added = 0;
        let skipped = 0;
        for (const row of rows) {
          const exists = words.some(
            (x) => x.word.toLowerCase() === row.word.toLowerCase()
          );
          if (exists) {
            skipped++;
            continue;
          }
          addWord({
            word: row.word,
            translation: row.translation,
            partOfSpeech: row.partOfSpeech ?? "autre",
            context: row.context ?? "",
            register: "",
            notes: row.notes ?? "",
            tags: row.tags ?? [],
          });
          added++;
        }
        toast.success(
          `${added} fiche(s) importée(s)${
            skipped ? `, ${skipped} ignorée(s) (déjà présentes)` : ""
          }.`
        );
      } catch {
        toast.error("Impossible de lire le fichier CSV.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleExportAnki() {
    if (examples.length === 0) {
      toast.error("Aucun exemple à exporter.");
      return;
    }
    const text = exportAnkiCloze(
      filteredWordsForExport.length > 0 ? filteredWordsForExport : words,
      examples
    );
    const date = new Date().toISOString().slice(0, 10);
    downloadFile(`mylexicon-anki-${date}.txt`, text, "text/plain;charset=utf-8");
    toast.success("Export Anki (Cloze) généré.");
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as BackupData;
        if (data.app !== "MyLexicon") {
          toast.error("Ce fichier n'est pas une sauvegarde MyLexicon.");
          return;
        }
        const confirmed =
          restoreMode === "replace"
            ? confirm(
                "⚠️ Restauration en mode REMPLACEMENT : toutes vos données actuelles seront effacées et remplacées par celles du fichier. Continuer ?"
              )
            : confirm(
                "Restauration en mode FUSION : les données du fichier seront ajoutées à vos données actuelles (sans doublons). Continuer ?"
              );
        if (!confirmed) return;
        restoreBackup(data, restoreMode === "replace");
        toast.success("Données restaurées avec succès.");
      } catch {
        toast.error("Fichier invalide ou corrompu.");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleLoadDemo() {
    const confirmed = confirm(
      "Charger les données de démonstration ? Elles seront ajoutées (fusion) à vos données actuelles. Vous pourrez les supprimer individuellement."
    );
    if (!confirmed) return;
    const demo = buildDemoBackup();
    restoreBackup(demo, false);
    toast.success("Données de démonstration chargées.");
  }

  function handleClearAll() {
    clearAll();
    toast.success("Toutes les données ont été effacées.");
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pt-3 pb-2 bg-background/80 backdrop-blur sticky top-0 z-10 border-b">
        <h1 className="text-xl font-bold tracking-tight">Réglages</h1>
        <p className="text-xs text-muted-foreground">Préférences et sauvegarde</p>
      </div>

      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3 space-y-4">
        {/* Apparence */}
        <Section title="Apparence" icon={Palette}>
          <Row label="Thème">
            <div className="flex gap-1.5">
              <ThemeButton active={theme === "light"} onClick={() => setTheme("light")}>
                <Sun className="h-3.5 w-3.5" /> Clair
              </ThemeButton>
              <ThemeButton active={theme === "dark"} onClick={() => setTheme("dark")}>
                <Moon className="h-3.5 w-3.5" /> Sombre
              </ThemeButton>
              <ThemeButton active={theme === "system"} onClick={() => setTheme("system")}>
                <Monitor className="h-3.5 w-3.5" /> Auto
              </ThemeButton>
            </div>
          </Row>
          <Row label="Taille de police">
            <div className="flex items-center gap-3 w-48">
              <span className="text-xs text-muted-foreground">A</span>
              <Slider
                value={[settings.fontScale]}
                min={0.85}
                max={1.3}
                step={0.05}
                onValueChange={([v]) => updateSettings({ fontScale: v })}
              />
              <span className="text-base text-muted-foreground">A</span>
            </div>
          </Row>
        </Section>

        {/* Prononciation */}
        <Section title="Prononciation" icon={Volume2}>
          <Row label="Accent">
            <Select
              value={settings.accent}
              onValueChange={(v) => updateSettings({ accent: v as Accent })}
            >
              <SelectTrigger className="w-44 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="britannique">Britannique 🇬🇧</SelectItem>
                <SelectItem value="américain">Américain 🇺🇸</SelectItem>
              </SelectContent>
            </Select>
          </Row>
          <Row label="Masquer la phonétique pendant l'étude">
            <Switch
              checked={!!settings.hidePhoneticInStudy}
              onCheckedChange={(v) => updateSettings({ hidePhoneticInStudy: v })}
            />
          </Row>
          <p className="text-xs text-muted-foreground px-1">
            La transcription phonétique générée par l'IA suit l'accent choisi ci-dessus.
          </p>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-normal">Vitesse d'élocution</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {settings.speechRate.toFixed(2)}×
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Lent</span>
              <Slider
                value={[settings.speechRate]}
                min={0.5}
                max={1.3}
                step={0.05}
                onValueChange={([v]) => updateSettings({ speechRate: v })}
                className="flex-1"
              />
              <span className="text-xs text-muted-foreground">Rapide</span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs w-full"
              onClick={() => speak("Hello, this is a sample sentence.", settings.accent, settings.speechRate)}
            >
              <Volume2 className="h-3 w-3" /> Tester la prononciation
            </Button>
          </div>
        </Section>

        {/* Objectifs */}
        <Section title="Objectif quotidien" icon={Target}>
          <Row label="Nouveaux mots / jour">
            <Input
              type="number"
              min={0}
              max={50}
              value={settings.dailyNewWordsGoal}
              onChange={(e) =>
                updateSettings({ dailyNewWordsGoal: Math.max(0, Number(e.target.value)) })
              }
              className="w-20 h-9"
            />
          </Row>
          <Row label="Révisions / jour">
            <Input
              type="number"
              min={0}
              max={200}
              value={settings.dailyReviewsGoal}
              onChange={(e) =>
                updateSettings({ dailyReviewsGoal: Math.max(0, Number(e.target.value)) })
              }
              className="w-20 h-9"
            />
          </Row>
        </Section>

        {/* Rappel quotidien */}
        <Section title="Rappel quotidien" icon={Bell}>
          <Row label="Activer la notification">
            <Switch
              checked={settings.reminderEnabled}
              onCheckedChange={(v) => {
                updateSettings({ reminderEnabled: v });
                if (v) requestNotificationPermission();
              }}
            />
          </Row>
          {settings.reminderEnabled && (
            <Row label="Heure du rappel">
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={settings.reminderHour}
                  onChange={(e) =>
                    updateSettings({
                      reminderHour: Math.min(23, Math.max(0, Number(e.target.value))),
                    })
                  }
                  className="w-14 h-9 text-center"
                />
                <span>:</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={settings.reminderMinute}
                  onChange={(e) =>
                    updateSettings({
                      reminderMinute: Math.min(59, Math.max(0, Number(e.target.value))),
                    })
                  }
                  className="w-14 h-9 text-center"
                />
              </div>
            </Row>
          )}
          <p className="text-xs text-muted-foreground px-1">
            ⚠️ Les notifications locales dépendent du navigateur et de l'appareil.
            L'application doit rester ouverte pour recevoir le rappel.
          </p>
        </Section>

        {/* Assistant IA */}
        <Section title="Assistant IA" icon={Sparkles}>
          <p className="text-xs text-muted-foreground px-1">
            L'assistant prépare les fiches à votre place : vous tapez un mot, vous
            vérifiez, vous enregistrez. Saisissez le code d'accès défini dans Vercel
            (variable ACCESS_CODE).
          </p>
          <Row label="Code d'accès">
            <Input
              type="password"
              autoComplete="off"
              value={aiCode}
              onChange={(e) => setAiCode(e.target.value)}
              className="w-44 h-9"
            />
          </Row>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={handleSaveAiCode}
            disabled={aiChecking}
          >
            <Sparkles className="h-4 w-4" />{" "}
            {aiChecking ? "Vérification…" : "Enregistrer et vérifier le code"}
          </Button>
          <p className="text-xs text-muted-foreground px-1">
            Lors d'une génération, le mot saisi est envoyé à Google (Gemini). Aucune
            autre donnée n'est transmise, et le code n'est jamais inclus dans vos
            sauvegardes.
          </p>
        </Section>

        {/* Sauvegarde et export */}
        <Section title="Sauvegarde et export" icon={Database}>
          <p className="text-xs text-muted-foreground px-1">
            Vos données restent uniquement sur cet appareil. Exportez régulièrement
            une sauvegarde pour éviter toute perte.
          </p>

          {/* Filtres d'export */}
          <div className="rounded-lg border p-3 space-y-2 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground">
              Filtres d'export ({filteredWordsForExport.length} fiche(s) sélectionnée(s))
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Statut</label>
                <Select
                  value={exportStatusFilter}
                  onValueChange={(v) => setExportStatusFilter(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="incomplete">Incomplètes</SelectItem>
                    <SelectItem value="complete">Complètes</SelectItem>
                    <SelectItem value="learning">En apprentissage</SelectItem>
                    <SelectItem value="mastered">Maîtrisées</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Étiquette</label>
                <Select
                  value={exportTagFilter}
                  onValueChange={(v) => setExportTagFilter(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
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
            </div>
          </div>

          <div className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={handleExportJson}>
              <Download className="h-4 w-4" />{" "}
              {exportStatusFilter === "all" && exportTagFilter === "all"
                ? "Exporter une sauvegarde (JSON)"
                : `Exporter filtré (JSON) — ${filteredWordsForExport.length}`}
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={handleExportCsv}>
              <FileSpreadsheet className="h-4 w-4" />{" "}
              {exportStatusFilter === "all" && exportTagFilter === "all"
                ? "Exporter le dictionnaire (CSV)"
                : `Exporter filtré (CSV) — ${filteredWordsForExport.length}`}
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={handleExportAnki}>
              <Download className="h-4 w-4" /> Exporter pour Anki (Cloze)
            </Button>
          </div>

          {/* Import CSV externe */}
          <div className="rounded-lg border p-3 space-y-2 bg-muted/40">
            <p className="text-sm font-medium">Importer un fichier CSV</p>
            <p className="text-xs text-muted-foreground">
              Format attendu : <code className="text-[10px] bg-background px-1 py-0.5 rounded">mot;traduction;nature;contexte;notes;étiquettes</code>
              {" "}— les colonnes optionnelles peuvent être vides, les étiquettes séparées par |.
            </p>
            <input
              ref={csvImportRef}
              type="file"
              accept=".csv,text/csv,text/plain"
              className="hidden"
              onChange={handleCsvImport}
            />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => csvImportRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Choisir un fichier CSV…
            </Button>
          </div>

          <div className="rounded-lg border p-3 space-y-2 bg-muted/40">
            <p className="text-sm font-medium">Restaurer depuis un fichier</p>
            <Row label="Mode de restauration" compact>
              <Select
                value={restoreMode}
                onValueChange={(v) => setRestoreMode(v as "replace" | "merge")}
              >
                <SelectTrigger className="w-40 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Fusion (sûr)</SelectItem>
                  <SelectItem value="replace">Remplacement</SelectItem>
                </SelectContent>
              </Select>
            </Row>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" /> Choisir un fichier JSON…
            </Button>
            {restoreMode === "replace" && (
              <p className="text-xs text-destructive flex items-start gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Le remplacement effacera toutes vos données actuelles.
              </p>
            )}
          </div>
        </Section>

        {/* Données de démo */}
        <Section title="Données" icon={Sparkles}>
          <Button variant="outline" className="w-full justify-start" onClick={handleLoadDemo}>
            <Sparkles className="h-4 w-4" /> Charger les données de démonstration
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full justify-start text-destructive">
                <Trash2 className="h-4 w-4" /> Tout effacer
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Tout effacer ?</AlertDialogTitle>
                <AlertDialogDescription>
                  Cette action est irréversible. Toutes vos fiches, éléments,
                  exemples et votre progression seront définitivement supprimés.
                  Pensez à exporter une sauvegarde au préalable.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Annuler</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleClearAll}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Oui, tout effacer
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </Section>

        <div className="text-center text-xs text-muted-foreground py-2">
          MyLexicon · Fonctionne hors ligne · Vos données restent sur votre appareil (seul le mot saisi est envoyé à l'IA lors d'une génération).
        </div>
        <div className="h-4" />
      </div>
    </div>
  );
}

// --- Sous-composants ---

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <UICard className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 text-primary" />
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <div className="space-y-3">{children}</div>
    </UICard>
  );
}

function Row({
  label,
  children,
  compact,
}: {
  label: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 ${compact ? "" : "py-0.5"}`}
    >
      <Label className="text-sm font-normal">{label}</Label>
      {children}
    </div>
  );
}

function ThemeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      className="h-8 text-xs gap-1"
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    toast.info("Les notifications ne sont pas supportées par ce navigateur.");
    return;
  }
  if (Notification.permission === "default") {
    Notification.requestPermission().then((p) => {
      if (p === "granted") {
        toast.success("Notifications activées.");
      } else {
        toast.info("Notifications refusées.");
      }
    });
  }
}
