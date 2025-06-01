import React from "react";
import { useRouter } from 'next/router';
import { useAuthStore } from "@/store/authStore";
import { useTournamentStore } from "@/store/tournamentStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { TournamentInstance } from "@/types/tournament";

export const TournamentSelector: React.FC = () => {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);

  const userTournaments = useTournamentStore((state) => state.userTournamentInstances);
  const currentTournament = useTournamentStore((state) => state.currentTournamentInstance);
  const status = useTournamentStore((state) => state.status);
  const error = useTournamentStore((state) => state.error);
  const setCurrentTournament = useTournamentStore((state) => state.setCurrentTournamentInstance);

  const handleValueChange = (tournamentId: string) => {
    if (!tournamentId) {
      return;
    }
    const selectedTournament: TournamentInstance | undefined = userTournaments.find((tournament) => tournament.id === tournamentId);
    if (selectedTournament) {
      setCurrentTournament(selectedTournament);
      router.push(`/view/tournament/${selectedTournament.id}`);
    } else {
      console.warn(`TournamentSelector: Selected tournament with ID ${tournamentId} not found in userTournaments.`);
    }
  };

  if (!user || isGuest) {
    return null;
  }

  if (status === "loading-list") {
    return <Skeleton className="h-10 w-full rounded-md" />;
  }

  if (status === "error") {
    return <div className="text-red-500 text-sm">Fehler: {error || "Turniere konnten nicht geladen werden."}</div>;
  }

  if (userTournaments.length === 0) {
    return <div className="text-muted-foreground text-sm">Du nimmst an keinen Turnieren teil.</div>;
  }

  return (
    <div className="w-full">
      <Select
        value={currentTournament?.id ?? ""}
        onValueChange={handleValueChange}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Turnier auswählen..." />
        </SelectTrigger>
        <SelectContent position="popper">
          {userTournaments.map((tournament) => (
            <SelectItem key={tournament.id} value={tournament.id}>
              {tournament.name}
              {tournament.instanceDate && (
                <span className="ml-2 text-xs text-gray-400">
                  ({tournament.instanceDate instanceof Date
                    ? tournament.instanceDate.toLocaleDateString('de-CH')
                    : new Date((tournament.instanceDate as any)?.seconds * 1000).toLocaleDateString('de-CH')})
                </span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};