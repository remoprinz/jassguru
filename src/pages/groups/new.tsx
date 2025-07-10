// src/pages/groups/new.tsx
// Seite zum Erstellen einer neuen Jassgruppe

"use client";

import React, {useState, useEffect, useRef, useCallback} from "react";
import {useRouter} from "next/router";
import {useForm} from "react-hook-form";
import {zodResolver} from "@hookform/resolvers/zod";
import * as z from "zod";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {Avatar, AvatarFallback, AvatarImage} from "@/components/ui/avatar";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {useGroupStore} from "@/store/groupStore";
import {uploadGroupLogo} from "@/services/groupService";
import MainLayout from "@/components/layout/MainLayout";
import {Camera, X, ArrowLeft} from "lucide-react";
import type { FirestoreGroup } from "@/types/jass";
import imageCompression from "browser-image-compression";
import ImageCropModal from "@/components/ui/ImageCropModal";
import { getFunctions, httpsCallable } from "firebase/functions";

// Zod Schema für die Formularvalidierung
const createGroupSchema = z.object({
  groupName: z.string()
    .min(3, "Gruppenname muss mindestens 3 Zeichen lang sein")
    .max(50, "Gruppenname darf maximal 50 Zeichen lang sein"),
});

type CreateGroupFormValues = z.infer<typeof createGroupSchema>;

const CreateGroupPage: React.FC = () => {
  const {user, status, isAuthenticated} = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const setPageCta = useUIStore((state) => state.setPageCta);
  const resetPageCta = useUIStore((state) => state.resetPageCta);
  const addUserGroup = useGroupStore((state) => state.addUserGroup);
  const setCurrentGroup = useGroupStore((state) => state.setCurrentGroup);
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- State and Ref for Logo ---
  const [selectedLogoFile, setSelectedLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoFileInputRef = useRef<HTMLInputElement>(null);
  
  // --- Crop Tool State (wie in index.tsx) ---
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  // ------------------------------

  // Redirect, wenn nicht eingeloggt
  useEffect(() => {
    if (status !== "loading" && !isAuthenticated()) {
      router.push("/auth/login");
    }
  }, [status, isAuthenticated, router]);

  // Header Konfiguration
  useEffect(() => {
    const setHeaderConfig = useUIStore.getState().setHeaderConfig;
    setHeaderConfig({
      title: "", // Titel aus Header entfernt
      showBackButton: false, // Eigenen Back-Button verwenden
      showProfileButton: true,
    });
    return () => {
      const resetHeaderConfig = useUIStore.getState().setHeaderConfig; // Aufruf der Funktion, um den Header zurückzusetzen
      resetHeaderConfig(null);
    };
  }, []);

  // Cleanup effect for logo preview URL
  useEffect(() => {
    return () => {
      if (logoPreviewUrl) {
        URL.revokeObjectURL(logoPreviewUrl);
      }
      if (imageToCrop) {
        URL.revokeObjectURL(imageToCrop);
      }
    };
  }, [logoPreviewUrl, imageToCrop]);

  const form = useForm<CreateGroupFormValues>({
    resolver: zodResolver(createGroupSchema),
    defaultValues: {
      groupName: "",
    },
  });

  // --- Logo Handling Functions (mit Crop Tool wie in index.tsx) ---
  const handleLogoFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      const originalFile = files[0];
      if (!originalFile.type.startsWith("image/")) {
        showNotification({message: "Bitte wählen Sie eine Bilddatei (JPEG oder PNG).", type: "error"});
        return;
      }
      const initialMaxSizeInBytes = 5 * 1024 * 1024; // 5MB initial limit
      if (originalFile.size > initialMaxSizeInBytes) {
        showNotification({message: "Die Datei ist zu groß (max. 5 MB).", type: "error"});
        return;
      }

      setError(null);
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
      setLogoPreviewUrl(null);
      setSelectedLogoFile(null);

      const objectUrl = URL.createObjectURL(originalFile);
      setImageToCrop(objectUrl);
      setCropModalOpen(true);
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
      logoFileInputRef.current.value = "";
    }
  };

  // --- Crop Complete Handler (wie in index.tsx) ---
  const handleCropComplete = async (croppedImageBlob: Blob | null) => {
    setCropModalOpen(false);
    if (imageToCrop) {
      URL.revokeObjectURL(imageToCrop);
      setImageToCrop(null);
    }

    if (!croppedImageBlob) {
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      setIsUploading(false);
      return;
    }

    setIsUploading(true);

    const options = {
      maxSizeMB: 0.2,
      maxWidthOrHeight: 1024,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.8,
    };

    try {
      const compressedBlob = await imageCompression(new File([croppedImageBlob], "cropped_logo.jpg", {type: "image/jpeg"}), options);

      const finalPreviewUrl = URL.createObjectURL(compressedBlob);
      setLogoPreviewUrl(finalPreviewUrl);
      setSelectedLogoFile(new File([compressedBlob], "group_logo.jpg", {type: "image/jpeg"}));
      setIsUploading(false);
    } catch (compressionError) {
      console.error("Fehler bei der Komprimierung des zugeschnittenen Gruppenlogos:", compressionError);
      showNotification({message: "Fehler bei der Bildkomprimierung.", type: "error"});
      setSelectedLogoFile(null);
      setLogoPreviewUrl(null);
      if (logoFileInputRef.current) logoFileInputRef.current.value = "";
      setIsUploading(false);
    }
  };
  // --------------------------------------------------------

  // --- onSubmit Funktion HIERHIN VERSCHOBEN UND MIT useCallback GEWRAPPT --- 
  const onSubmit = useCallback(async (data: CreateGroupFormValues) => {
    if (!user) {
      setError("Benutzer nicht gefunden. Bitte erneut anmelden.");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Step 1: Create the group using Cloud Function
      if (process.env.NODE_ENV === 'development') {
        console.log("CreateGroupPage: Attempting to create group via Cloud Function...");
      }
      
      const functions = getFunctions(undefined, 'europe-west1');
      const createNewGroupFn = httpsCallable(functions, 'createNewGroup');
      const result = await createNewGroupFn({ 
        name: data.groupName,
        description: "Willkommen in unserer Jassrunde!",
        isPublic: true 
      });
      
      const cloudFunctionResponse = result.data as { success: boolean; groupId: string; playerDocId: string };
      
      if (!cloudFunctionResponse.success || !cloudFunctionResponse.groupId) {
        throw new Error("Gruppe konnte nicht erstellt werden");
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log(`CreateGroupPage: Group ${cloudFunctionResponse.groupId} created successfully via Cloud Function.`);
      }

      // Step 2: Upload logo if selected
      if (selectedLogoFile && cloudFunctionResponse.groupId) {
        console.log(`CreateGroupPage: Attempting to upload logo for group ${cloudFunctionResponse.groupId}...`);
        try {
          await uploadGroupLogo(cloudFunctionResponse.groupId, selectedLogoFile);
          console.log(`CreateGroupPage: Logo for group ${cloudFunctionResponse.groupId} uploaded successfully.`);
        } catch (logoError) {
          console.error("Fehler beim Hochladen des Gruppenlogos:", logoError);
          showNotification({
            message: "Gruppe erfolgreich erstellt! Das Gruppenbild konnte nicht hochgeladen werden - kein Problem, du kannst es später in den Gruppeneinstellungen hinzufügen.",
            type: "success",
            actions: [
              {
                label: "Verstanden",
                onClick: () => {},
              },
            ],
          });
        }
      }

      showNotification({
        message: `Deine Jassgruppe "${data.groupName}" wurde erfolgreich erstellt! Nimm als erstes die individuellen Jass-Einstellungen von deiner Jassrunde vor.`,
        type: "success",
        image: "/welcome-guru.png",
      });
      
      // Lade die neue Gruppe direkt in den Store und navigiere dann
      try {
        const { fetchCurrentGroup } = useGroupStore.getState();
        await fetchCurrentGroup(cloudFunctionResponse.groupId);
        router.push(`/groups/settings?groupId=${cloudFunctionResponse.groupId}`);
      } catch (groupLoadError) {
        console.warn("Gruppe konnte nicht direkt geladen werden, verwende Fallback-Navigation:", groupLoadError);
        // Fallback: Navigiere trotzdem, Settings-Seite hat eigenen Fallback
        setTimeout(() => {
          router.push(`/groups/settings?groupId=${cloudFunctionResponse.groupId}`);
        }, 1000);
      }
      
    } catch (err) {
      console.error("Fehler beim Erstellen der Gruppe (onSubmit):", err);
      if (err instanceof Error) {
        console.error(err.message);
        setError(err.message);
      } else {
        console.error("Ein unbekannter Fehler ist aufgetreten.", err);
        setError("Ein unbekannter Fehler ist aufgetreten.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, selectedLogoFile, router, showNotification]);
  // --------------------------------------------------------

  // CTA-Button konfigurieren (kommt NACH onSubmit)
  useEffect(() => {
    setPageCta({
      isVisible: true,
      text: "Gruppe erstellen",
      // Verwende form.handleSubmit(onSubmitCallback) - onSubmit ist jetzt stabil
      onClick: () => form.handleSubmit(onSubmit)(),
      loading: isLoading,
      disabled: isLoading || !form.formState.isValid,
      variant: "default", // Grün
    });

    return () => {
      resetPageCta();
    };
    // Abhängigkeit von form.handleSubmit entfernt, da es von react-hook-form stabilisiert wird
    // onSubmit ist jetzt durch useCallback stabilisiert
  }, [isLoading, form.formState.isValid, setPageCta, resetPageCta, onSubmit]);

  // Zeige Ladezustand an, während Auth-Status geprüft wird oder Benutzer noch nicht geladen
  if (status === "loading" || !user) {
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

  const handleGoBack = () => {
    router.back();
  };

  return (
    <MainLayout>
      <div className="flex flex-1 flex-col items-center bg-gray-900 p-4 text-white relative">
        {/* Back Button */}
        <Button
          variant="ghost"
          onClick={handleGoBack}
          className="absolute top-14 left-4 text-white hover:bg-gray-700 p-3 sm:top-8"
          aria-label="Zurück"
        >
          <ArrowLeft size={28} />
        </Button>

        <div className="w-full max-w-md space-y-6 pt-16 sm:pt-10">
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
                <FormLabel className="text-gray-300 mb-2">Gruppenlogo (kann später hochgeladen werden)</FormLabel>
                <div className="relative">
                  <Avatar
                    className={`h-24 w-24 border-2 border-gray-600 transition-colors ${isUploading ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:border-gray-500'}`}
                    onClick={!isUploading ? handleLogoSelectClick : undefined}
                  >
                    <AvatarImage src={logoPreviewUrl ?? undefined} alt="Gruppenlogo Vorschau" className="object-cover" />
                    <AvatarFallback className="bg-gray-700 text-gray-400">
                      {isUploading ? (
                        <div className="flex flex-col items-center">
                          <div className="h-6 w-6 rounded-full border-2 border-white border-t-transparent animate-spin mb-1"></div>
                          <span className="text-xs">Verarbeite...</span>
                        </div>
                      ) : (
                        <Camera size={32} />
                      )}
                    </AvatarFallback>
                  </Avatar>
                  {/* Cancel Button overlay */}
                  {logoPreviewUrl && (
                    <button
                      type="button"
                      onClick={handleCancelLogoSelection}
                      className="absolute -top-1 -right-1 z-10 rounded-full bg-red-600 p-1 text-white shadow-md hover:bg-red-700 transition-colors"
                      aria-label="Logo-Auswahl aufheben"
                      disabled={isLoading || isUploading}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
                <input
                  type="file"
                  ref={logoFileInputRef}
                  onChange={handleLogoFileChange}
                  accept="image/jpeg, image/jpg, image/png, image/webp, image/gif, image/heic, image/heif"
                  className="hidden"
                  disabled={isLoading || isUploading}
                />
                <FormMessage className="text-red-300 mt-1" /> {/* For potential future logo validation errors */}
              </FormItem>
              {/* ------------------------ */}

              <FormField
                control={form.control}
                name="groupName"
                render={({field}) => (
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
            </form>
          </Form>
        </div>
      </div>

      {/* ✅ IMAGE CROP MODAL */}
      <ImageCropModal
        isOpen={cropModalOpen}
        onClose={() => handleCropComplete(null)}
        imageSrc={imageToCrop}
        onCropComplete={handleCropComplete}
      />

    </MainLayout>
  );
};

export default CreateGroupPage;
