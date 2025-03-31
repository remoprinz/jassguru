// src/pages/groups/new.tsx
// Seite zum Erstellen einer neuen Jassgruppe

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/uiStore';
import { useGroupStore } from '@/store/groupStore';
import { createGroup, uploadGroupLogo } from '@/services/groupService';
import MainLayout from '@/components/layout/MainLayout';
import Header from '@/components/layout/Header';
import { Camera, X } from 'lucide-react';
import { FirestoreGroup } from '@/types/jass'; // Import FirestoreGroup type

// Zod Schema für die Formularvalidierung
const createGroupSchema = z.object({
  groupName: z.string()
    .min(3, 'Gruppenname muss mindestens 3 Zeichen lang sein')
    .max(50, 'Gruppenname darf maximal 50 Zeichen lang sein'),
});

type CreateGroupFormValues = z.infer<typeof createGroupSchema>;

const CreateGroupPage: React.FC = () => {
  const { user, status, isAuthenticated } = useAuthStore();
  const showNotification = useUIStore(state => state.showNotification);
  const loadUserGroups = useGroupStore(state => state.loadUserGroups);
  const setCurrentGroup = useGroupStore(state => state.setCurrentGroup);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // --- State and Ref for Logo --- 
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  // ------------------------------

  // Redirect, wenn nicht eingeloggt
  useEffect(() => {
    if (status !== 'loading' && !isAuthenticated()) {
      router.push('/auth/login');
    }
  }, [status, isAuthenticated, router]);

  // Cleanup effect for logo preview URL
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
    };
  }, [logoPreviewUrl]);

  const form = useForm<CreateGroupFormValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      groupName: '',
    },
  });

  // --- Logo Handling Functions (similar to profile page) ---
  const handleLogoFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (!file.type.startsWith('image/')) {
        showNotification({ message: 'Bitte Bilddatei wählen (JPEG, PNG, GIF).', type: 'error' });
        return;
      }
      const maxSizeInBytes = 2 * 1024 * 1024; // 2MB Limit for Logos
      if (file.size > maxSizeInBytes) {
        showNotification({ message: 'Logo ist zu groß (max. 2 MB).', type: 'error' });
        return;
      }
      const objectUrl = URL.createObjectURL(file);
      setLogoPreviewUrl(objectUrl);
      setSelectedLogoFile(file);
      setError(null); // Clear previous errors
    }
  };

  const handleLogoSelectClick = () => {
    logoFileInputRef.current?.click();
  };

  const handleCancelLogoSelection = () => {
    if (logoPreviewUrl) {
      URL.revokeObjectURL(logoPreviewUrl);
    }
    setSelectedLogoFile(null);
    setLogoPreviewUrl(null);
    if (logoFileInputRef.current) {
      logoFileInputRef.current.value = '';
    }
  };
  // --------------------------------------------------------

  const onSubmit = async (data: CreateGroupFormValues) => {
    if (!user) {
      setError("Benutzer nicht gefunden. Bitte erneut anmelden.");
      return;
    }

    setIsLoading(true);
    setError(null);
    let newGroup: FirestoreGroup | null = null; 

    try {
      // Step 1: Create the group document and get the full object
      console.log("CreateGroupPage: Attempting to create group document...");
      newGroup = await createGroup(user.uid, user.displayName, data.groupName);
      console.log(`CreateGroupPage: Group document ${newGroup?.id} created successfully.`);

      // Step 2: Upload logo if selected
      if (selectedLogoFile && newGroup?.id) { 
        console.log(`CreateGroupPage: Attempting to upload logo for group ${newGroup.id}...`);
        try {
          await uploadGroupLogo(newGroup.id, selectedLogoFile);
          console.log(`CreateGroupPage: Logo for group ${newGroup.id} uploaded successfully.`);
        } catch (logoError) {
          console.error("Fehler beim Hochladen des Gruppenlogos:", logoError);
          // Notify user, but don't block navigation (group exists)
          showNotification({
            message: `Gruppe erstellt, aber Logo-Upload fehlgeschlagen: ${logoError instanceof Error ? logoError.message : 'Unbekannter Fehler'}`,
            type: 'warning',
          }); 
          // Continue without logo error blocking the flow
        }
      }

      // Step 3: Update lastActiveGroupId in Firestore and set current group in store
      if (newGroup?.id) {
        console.log(`CreateGroupPage: Calling setCurrentGroup for new group ${newGroup.id}...`);
        setCurrentGroup(newGroup);
        console.log(`CreateGroupPage: setCurrentGroup für ${newGroup.id} aufgerufen.`);
      }

      // Step 4: Reload user groups and navigate
      console.log("CreateGroupPage: Reloading user groups...");
      await loadUserGroups(user.uid); // Reload to include the new group
      console.log("CreateGroupPage: User groups reloaded.");

      showNotification({
        message: `Gruppe "${data.groupName}" erfolgreich erstellt! ${selectedLogoFile ? '(Logo wird verarbeitet)' : ''}`,
        type: 'success',
      });
      router.push('/profile/groups'); // Navigate to the groups list page

    } catch (err) {
      console.error("Fehler beim Erstellen der Gruppe (onSubmit):");
      // Log the error before setting the state message
      if (err instanceof Error) {
           console.error(err.message);
           setError(err.message);
       } else {
           console.error("Ein unbekannter Fehler ist aufgetreten.", err);
           setError("Ein unbekannter Fehler ist aufgetreten.");
       }
      // If group creation failed, newGroup remains null, logo upload is skipped.
    } finally {
      setIsLoading(false);
    }
  };

  // Zeige Ladezustand an, während Auth-Status geprüft wird oder Benutzer noch nicht geladen
  if (status === 'loading' || !user) {
    return (
      <MainLayout>
        <div className="flex min-h-screen items-center justify-center bg-gray-900 text-white">
          <div>Laden...</div>
        </div>
      </MainLayout>
    );
  }

  // Rendere nichts, wenn der User nicht authentifiziert ist (Redirect wird im useEffect behandelt)
  if (!isAuthenticated()) {
      return null;
  }

  return (
    <MainLayout>
      <Header showBackButton={true} />
      <div className="flex flex-1 flex-col items-center bg-gray-900 p-4 pt-6 text-white">
        <div className="w-full max-w-md space-y-6">
          <h1 className="text-center text-2xl font-bold text-white mb-6">
            Neue Gruppe erstellen
          </h1>
          {error && (
            <div className="rounded-md border border-red-900 bg-red-900/20 p-3 text-center text-red-200">
              {error}
            </div>
          )}

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* --- Logo Selection UI --- */} 
              <FormItem className="flex flex-col items-center">
                <FormLabel className="text-gray-300 mb-2">Gruppenlogo (Optional)</FormLabel>
                <div className="relative">
                  <Avatar 
                    className="h-24 w-24 cursor-pointer border-2 border-gray-600 hover:border-gray-500 transition-colors"
                    onClick={handleLogoSelectClick}
                  >
                    <AvatarImage src={logoPreviewUrl ?? undefined} alt="Gruppenlogo Vorschau" className="object-cover" />
                    <AvatarFallback className="bg-gray-700 text-gray-400">
                      <Camera size={32} />
                    </AvatarFallback>
                  </Avatar>
                  {/* Cancel Button overlay */} 
                  {logoPreviewUrl && (
                    <button 
                      type="button" 
                      onClick={handleCancelLogoSelection} 
                      className="absolute -top-1 -right-1 z-10 rounded-full bg-red-600 p-1 text-white shadow-md hover:bg-red-700 transition-colors"
                      aria-label="Logo-Auswahl aufheben"
                      disabled={isLoading}
                    >
                       <X size={14} />
                    </button>
                  )}
                </div>
                 <input
                  type="file"
                  ref={logoFileInputRef}
                  onChange={handleLogoFileChange}
                  accept="image/jpeg, image/png, image/gif"
                  className="hidden"
                  disabled={isLoading}
                 />
                 <FormMessage className="text-red-300 mt-1" /> {/* For potential future logo validation errors */}
              </FormItem>
              {/* ------------------------ */} 

              <FormField
                control={form.control}
                name="groupName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-gray-300">Gruppenname</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Name deiner Jassgruppe"
                        type="text"
                        disabled={isLoading}
                        className="bg-gray-800 border-gray-700 text-white focus:border-gray-500"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-300" />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-md"
                disabled={isLoading}
              >
                {isLoading ? "Wird erstellt..." : "Gruppe erstellen"}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </MainLayout>
  );
};

export default CreateGroupPage;