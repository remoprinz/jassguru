import React from "react";
import {useAuthStore} from "@/store/authStore";
import {useGroupStore} from "@/store/groupStore";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"; // Assuming Shadcn UI path
import {Skeleton} from "@/components/ui/skeleton"; // Assuming Shadcn UI path
import {FirestoreGroup} from "@/types/group"; // Changed from jass to group

export const GroupSelector: React.FC = () => {
  // --- Use atomic selectors for Zustand state ---
  const user = useAuthStore((state) => state.user);
  const isGuest = useAuthStore((state) => state.isGuest);

  const userGroups = useGroupStore((state) => state.userGroups);
  const currentGroup = useGroupStore((state) => state.currentGroup);
  const status = useGroupStore((state) => state.status);
  const error = useGroupStore((state) => state.error);
  const setCurrentGroup = useGroupStore((state) => state.setCurrentGroup);
  // -----------------------------------------------

  // *** LOGGING ENTFERNT ***
  // console.log('[GroupSelector] Rendering - Status:', status, 'UserGroups Count:', userGroups.length, 'Current Group ID:', currentGroup?.id, 'Error:', error);

  const handleValueChange = (groupId: string) => {
    if (!groupId) {
      // console.log("GroupSelector: No group selected (potentially cleared).");
      return;
    }
    const selectedGroup: FirestoreGroup | undefined = userGroups.find((group) => group.id === groupId);
    if (selectedGroup) {
      // console.log("GroupSelector: Setting current group to:", selectedGroup.name);
      setCurrentGroup(selectedGroup);
    } else {
      console.warn(`GroupSelector: Selected group with ID ${groupId} not found in userGroups.`);
    }
  };

  // Only render selector if user is logged in and not a guest
  if (!user || isGuest) {
    // *** LOGGING ENTFERNT ***
    // console.log('[GroupSelector] Rendering: Not rendering because user is null or guest.');
    return null; // Or render a message like "Please login to select a group"
  }

  // --- Render based on status ---

  if (status === "loading") {
    // *** LOGGING ENTFERNT ***
    // console.log('[GroupSelector] Rendering: Skeleton (loading).');
    return <Skeleton className="h-10 w-full rounded-md" />; // Adjust size as needed
  }

  if (status === "error") {
    // *** LOGGING ENTFERNT ***
    // console.log('[GroupSelector] Rendering: Error message.');
    return <div className="text-red-500 text-sm">Fehler: {error || "Gruppen konnten nicht geladen werden."}</div>;
  }

  // If not loading or error, and no groups are found, show message/button
  if (userGroups.length === 0) {
    // *** LOGGING ENTFERNT ***
    // console.log('[GroupSelector] Rendering: No groups found message.');
    // Option 1: Simple message
    return <div className="text-muted-foreground text-sm">Du bist noch in keiner Gruppe.</div>;
    // Option 2: Button to create group (requires additional logic/component)
    // return <Button variant="outline" size="sm" onClick={() => {/* Open create group modal */}}>Gruppe erstellen</Button>;
  }

  // --- Render Select component if groups exist ---
  // *** LOGGING ENTFERNT ***
  // console.log('[GroupSelector] Rendering: Select dropdown with', userGroups.length, 'groups.');
  return (
    <div className="w-full"> {/* Or adjust container styling */}
      <Select
        value={currentGroup?.id ?? ""} // Use empty string if no group selected to match potential placeholder item
        onValueChange={handleValueChange}
      >
        <SelectTrigger className="w-full">
          {/* Display placeholder if no group is selected */}
          <SelectValue placeholder="Gruppe auswählen..." />
        </SelectTrigger>
        <SelectContent position="popper">
          {/* Optional: Add a placeholder/clear item if needed
           <SelectItem value="" disabled className="text-muted-foreground">
             Gruppe auswählen...
           </SelectItem>
           */}
          {userGroups.map((group) => (
            <SelectItem key={group.id} value={group.id}>
              {group.name}
            </SelectItem>
          ))}
          {/* Optional: Add action items like "Create new group..." */}
          {/*
          <SelectItem value="create_new" className="text-blue-600">
            Neue Gruppe erstellen...
          </SelectItem>
          */}
        </SelectContent>
      </Select>
    </div>
  );
};
