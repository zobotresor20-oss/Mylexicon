"use client";

import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Cadre commun des jeux : barre de titre avec retour, contenu défilant. */
export function GameShell({
  title,
  onExit,
  right,
  children,
}: {
  title: string;
  onExit: () => void;
  right?: React.ReactNode;
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
          {right}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto thin-scroll px-4 py-3">
        {children}
        <div className="h-24" />
      </div>
    </div>
  );
}
