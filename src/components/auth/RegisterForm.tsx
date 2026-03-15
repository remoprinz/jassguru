"use client";

import {useState, useEffect} from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import {useAuthStore} from "@/store/authStore";
import {useUIStore} from "@/store/uiStore";
import {Alert, AlertDescription} from "@/components/ui/alert";
import {useRouter} from "next/router";
import Image from "next/image";
import { getTournamentToken, getGroupToken } from "@/utils/tokenStorage"; // Token-Storage-Helper importieren
import { authLogger } from "@/utils/logger"; // Logger importieren

// Schema für die Registrierung
const registerSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen lang sein"),
  displayName: z.string().min(2, "Name muss mindestens 2 Zeichen lang sein").max(50, "Name darf maximal 50 Zeichen lang sein"),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const {register, loginWithGoogle, status, error, clearError} = useAuthStore();
  const showNotification = useUIStore((state) => state.showNotification);
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const router = useRouter();

  // ✅ Error-State beim ersten Laden der Komponente leeren
  useEffect(() => {
    clearError();
  }, [clearError]);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      displayName: "",
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    clearError();
    try {
      await register(data.email, data.password, data.displayName);

      // Prüfen, ob ein Einladungs-Token vorhanden ist
      const tournamentToken = getTournamentToken();
      const groupToken = getGroupToken();
      
      // ✅ EINLADUNGS-FLOW: Bei vorhandenem Token direkt zu /join navigieren
      // Die Cloud Function setzt nach Token-Einlösung emailVerified auf true
      // Dadurch muss der User nicht auf die E-Mail-Bestätigung warten
      if (tournamentToken || groupToken) {
        const successMessage = tournamentToken 
          ? "Registrierung erfolgreich! Du wirst jetzt zum Turnier weitergeleitet..."
          : "Registrierung erfolgreich! Du wirst jetzt zur Gruppe weitergeleitet...";
        
        showNotification({
          type: "success",
          message: successMessage,
        });
        
        authLogger.info("Token vorhanden, navigiere direkt zu /join:", { tournamentToken, groupToken });
        
        // Kurze Verzögerung für bessere UX (User sieht Erfolgsmeldung)
        setTimeout(() => {
          if (tournamentToken) {
            router.push(`/join?tournamentToken=${tournamentToken}`);
          } else if (groupToken) {
            router.push(`/join?token=${groupToken}`);
          }
        }, 500);
        
        form.reset();
        return;
      }

      // ✅ STANDARD-FLOW: Ohne Token muss E-Mail bestätigt werden
      const successMessage = "Registrierung erfolgreich! Prüfe deine Email (auch Spam-Ordner), um die Registrierung abzuschliessen.";

      const notificationId = showNotification({
        type: "success",
        message: successMessage,
        preventClose: true,
        actions: [
          {
            label: "Verstanden",
            onClick: () => {
              useUIStore.getState().removeNotification(notificationId);
              router.push("/auth/login");
            }
          }
        ]
      });

      form.reset();
    } catch (err) {
      authLogger.error("Registrierungsfehler im Formular:", err);
    }
  };

  const handleGoogleRegister = async () => {
    clearError();
    try {
      await loginWithGoogle();
      
      // Google-User sind automatisch verifiziert, daher direkt navigieren
      const loggedInUser = useAuthStore.getState().user;
      
      // Prüfe auf Einladungs-Tokens
      const tournamentToken = getTournamentToken();
      const groupToken = getGroupToken();
      
      // ✅ EINLADUNGS-FLOW: Bei vorhandenem Token direkt zu /join
      if (tournamentToken || groupToken) {
        authLogger.info("Token vorhanden (Google), navigiere zu /join:", { tournamentToken, groupToken });
        
        setTimeout(() => {
          if (tournamentToken) {
            router.push(`/join?tournamentToken=${tournamentToken}`);
          } else if (groupToken) {
            router.push(`/join?token=${groupToken}`);
          }
        }, 500);
        return;
      }
      
      // ✅ STANDARD-FLOW: Ohne Token zur Startseite
      if (loggedInUser && !loggedInUser.emailVerified) {
        // Seltener Edge-Case: Google-User aber E-Mail nicht verifiziert
        const googleNotificationId = showNotification({
          type: "warning",
          message: "Bitte bestätige deine E-Mail-Adresse. Prüfe dein Postfach (auch Spam-Ordner).",
          preventClose: true,
          actions: [
            {
              label: "Verstanden",
              onClick: () => {
                useUIStore.getState().removeNotification(googleNotificationId);
                router.push("/auth/login");
              }
            }
          ]
        });
      } else {
        // Standard-Navigation zur Startseite
        setTimeout(() => {
          authLogger.debug("Navigation zur Startseite (Google):", useAuthStore.getState().status);
          router.push("/start");
        }, 500);
      }
      
    } catch (error) {
      authLogger.error("Google-Registrierungsfehler:", error);
    }
  };

  return (
    <div className="w-full space-y-4">
      {error && (
        <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="displayName"
              render={({field}) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Dein Jassname"
                      type="text"
                      disabled={form.formState.isSubmitting}
                      className="bg-gray-800 border-gray-700 text-white focus:border-gray-500"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-300" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({field}) => (
                <FormItem>
                  <FormLabel className="text-gray-300">E-Mail</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="deine.email@beispiel.ch"
                      type="email"
                      disabled={form.formState.isSubmitting}
                      className="bg-gray-800 border-gray-700 text-white focus:border-gray-500"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-300" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({field}) => (
                <FormItem>
                  <FormLabel className="text-gray-300">Passwort</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        placeholder="••••••••"
                        type={showPassword ? "text" : "password"}
                        disabled={form.formState.isSubmitting}
                        className="bg-gray-800 border-gray-700 text-white pr-20 focus:border-gray-500 [&[type=password]]:tracking-widest"
                        {...field}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? "Verbergen" : "Anzeigen"}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage className="text-red-300" />
                </FormItem>
              )}
            />

            <div className="flex items-start space-x-3 py-2">
              <Checkbox 
                id="terms" 
                checked={agreedToTerms} 
                onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                className="mt-0.5 border-2 border-gray-500 data-[state=checked]:bg-green-600 data-[state=checked]:border-green-600 h-5 w-5 rounded-none"
              />
              <div className="grid gap-1.5 leading-none">
                <label
                  htmlFor="terms"
                  className="text-sm font-light text-gray-300 peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                >
                  Ich akzeptiere die{' '}
                  <Link 
                    href="/agb" 
                    className="font-medium underline hover:text-white" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    Nutzungsbedingungen
                  </Link>
                  {' '}und habe die{' '}
                  <Link 
                    href="/datenschutz" 
                    className="font-medium underline hover:text-white" 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    Datenschutzerklärung
                  </Link>
                  {' '}gelesen.
                </label>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-md"
              disabled={form.formState.isSubmitting || !agreedToTerms}
            >
              {form.formState.isSubmitting ? "Registrierung läuft..." : "Registrieren"}
            </Button>
          </form>
        </Form>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-gray-800 px-2 text-gray-400">
              oder
            </span>
          </div>
        </div>

        <Button
          variant="outline"
          className="w-full bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 font-medium h-12 rounded-md flex items-center justify-center"
          onClick={handleGoogleRegister}
          disabled={form.formState.isSubmitting || !agreedToTerms}
        >
          <Image
            src="/google-logo.svg"
            alt="Google Logo"
            width={18}
            height={18}
            className="mr-3"
          />
          Mit Google fortfahren
        </Button>
      </>
    </div>
  );
}
