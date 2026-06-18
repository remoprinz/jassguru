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
import {useAuthStore} from "@/store/authStore";
import {Alert, AlertDescription} from "@/components/ui/alert";
import Link from "next/link";
import {useRouter} from "next/router";
import Image from "next/image";
import {FaApple} from "react-icons/fa";
import { getTournamentToken, getGroupToken } from "@/utils/tokenStorage";
import { authLogger } from "@/utils/logger";

const loginSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
  password: z.string().min(6, "Passwort muss mindestens 6 Zeichen lang sein"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const {login, loginWithGoogle, loginWithApple, status, error, clearError} = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isEmailLoginSubmitting, setIsEmailLoginSubmitting] = useState(false); // 🚀 NEU: Separater State für Email-Login
  const [isGoogleLoginSubmitting, setIsGoogleLoginSubmitting] = useState(false); // 🚀 NEU: Separater State für Google-Login
  const [isAppleLoginSubmitting, setIsAppleLoginSubmitting] = useState(false); // 🍎 Separater State für Apple-Login
  const router = useRouter();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // ✅ Error-State beim ersten Laden der Komponente leeren
  useEffect(() => {
    clearError();
  }, [clearError]);

  // Aktueller E-Mail-Wert, um ihn an den "Passwort vergessen/setzen"-Link
  // weiterzureichen (JVS-Beitritte landen so vorbefüllt auf der Reset-Seite).
  const emailValue = form.watch("email");

  const onSubmit = async (data: LoginFormValues) => {
    setIsEmailLoginSubmitting(true); // 🚀 Nur Email-Login Loading aktivieren
    clearError();
    try {
      await login(data.email, data.password);

      const loggedInUser = useAuthStore.getState().user;

      if (loggedInUser) {
        // Login erfolgreich → immer in die App navigieren. E-Mail-Verifizierung
        // wird bewusst NICHT erzwungen (kein blockierendes Dead-End). Der Mailversand
        // via Custom-Domain (noreply@jassguru.ch) ist inzwischen aktiv; eine sanfte,
        // nicht-blockierende Verifizierungs-Erinnerung könnte hier künftig rein.
        setTimeout(() => {
          authLogger.debug("Verzögerte Navigation: Status=", useAuthStore.getState().status);

          const tournamentToken = getTournamentToken();
          const groupToken = getGroupToken();

          if (tournamentToken) {
            authLogger.info("Turniertoken im Storage gefunden, leite zu /join weiter:", tournamentToken);
            router.push(`/join?tournamentToken=${tournamentToken}`);
          } else if (groupToken) {
            authLogger.info("Gruppentoken im Storage gefunden, leite zu /join weiter:", groupToken);
            router.push(`/join?token=${groupToken}`);
          } else {
            router.push("/start");
          }
        }, 500);
      } else {
        throw new Error("Benutzerdaten nach Login nicht verfügbar.");
      }
    } catch (err) {
      authLogger.error("Login-Fehler im Formular:", err);
    } finally {
      setIsEmailLoginSubmitting(false); // 🚀 Email-Login Loading zurücksetzen
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoginSubmitting(true); // 🚀 Nur Google-Login Loading aktivieren
    clearError();
    try {
      await loginWithGoogle();
      setTimeout(() => {
        authLogger.debug("Verzögerte Navigation (Google): Status=", useAuthStore.getState().status);
        
        const tournamentToken = getTournamentToken();
        const groupToken = getGroupToken();
            
        if (tournamentToken) {
          authLogger.info("Turniertoken im Storage gefunden (Google), leite zu /join weiter:", tournamentToken);
          router.push(`/join?tournamentToken=${tournamentToken}`);
        } else if (groupToken) {
          authLogger.info("Gruppentoken im Storage gefunden (Google), leite zu /join weiter:", groupToken);
          router.push(`/join?token=${groupToken}`);
        } else {
          router.push("/start");
        }
      }, 500);
    } catch (error) {
      authLogger.error("Google login error:", error);
    } finally {
      setIsGoogleLoginSubmitting(false); // 🚀 Google-Login Loading zurücksetzen
    }
  };

  const handleAppleLogin = async () => {
    setIsAppleLoginSubmitting(true);
    clearError();
    try {
      await loginWithApple();
      setTimeout(() => {
        authLogger.debug("Verzögerte Navigation (Apple): Status=", useAuthStore.getState().status);

        const tournamentToken = getTournamentToken();
        const groupToken = getGroupToken();

        if (tournamentToken) {
          router.push(`/join?tournamentToken=${tournamentToken}`);
        } else if (groupToken) {
          router.push(`/join?token=${groupToken}`);
        } else {
          router.push("/start");
        }
      }, 500);
    } catch (error) {
      authLogger.error("Apple login error:", error);
    } finally {
      setIsAppleLoginSubmitting(false);
    }
  };

  const isAnyLoading = status === "loading" || isEmailLoginSubmitting || isGoogleLoginSubmitting || isAppleLoginSubmitting; // 🚀 Globaler Loading-State für Disabled-Status

  return (
    <div className="w-full space-y-4">
      {error && (
        <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
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
                    disabled={isAnyLoading}
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
                      disabled={isAnyLoading}
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

          <Button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-md"
            disabled={isAnyLoading}
          >
            {isEmailLoginSubmitting ? (
              <div className="flex items-center justify-center">
                <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></div>
                Anmeldung läuft...
              </div>
            ) : (
              "Anmelden"
            )}
          </Button>
        </form>
      </Form>

      {/* Google-Login — im Web/PWA via signInWithPopup, in Capacitor-App
          via signInWithRedirect (Popup vom WKWebView blockiert) */}
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

      {/* Apple-Login — HIG: über Google platziert, gleich prominent.
          Web/PWA via signInWithPopup, Capacitor via signInWithRedirect (analog Google). */}
      <Button
        className="w-full bg-black hover:bg-gray-900 text-white border border-black font-medium h-12 rounded-md flex items-center justify-center"
        onClick={handleAppleLogin}
        disabled={isAnyLoading}
      >
        {isAppleLoginSubmitting ? (
          <div className="flex items-center justify-center">
            <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin mr-2"></div>
            Anmeldung läuft...
          </div>
        ) : (
          <>
            <FaApple className="w-5 h-5 mr-3 -mt-0.5" />
            Mit Apple fortfahren
          </>
        )}
      </Button>

      <Button
        variant="outline"
        className="w-full bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 font-medium h-12 rounded-md flex items-center justify-center"
        onClick={handleGoogleLogin}
        disabled={isAnyLoading}
      >
        {isGoogleLoginSubmitting ? (
          <div className="flex items-center justify-center">
            <div className="h-4 w-4 rounded-full border-2 border-gray-600 border-t-transparent animate-spin mr-2"></div>
            Anmeldung läuft...
          </div>
        ) : (
          <>
            <Image
              src="/google-logo.svg"
              alt="Google Logo"
              width={18}
              height={18}
              className="mr-3"
            />
            Mit Google fortfahren
          </>
        )}
      </Button>

      <p className="text-center text-sm text-gray-400">
        <Link
          href={emailValue ? `/auth/reset-password?email=${encodeURIComponent(emailValue)}` : "/auth/reset-password"}
          className="text-blue-400 hover:underline"
        >
          Passwort vergessen oder neu setzen?
        </Link>
      </p>
    </div>
  );
}
