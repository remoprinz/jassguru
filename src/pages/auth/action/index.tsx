"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import {
  getAuth,
  verifyPasswordResetCode,
  confirmPasswordReset,
  applyActionCode,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { SeoHead } from "@/components/layout/SeoHead";
import { AuthLayout } from "@/components/auth/AuthLayout";
import { AuthProvider } from "@/providers/AuthProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { authLogger } from "@/utils/logger";

/**
 * Gebrandeter Firebase-E-Mail-Action-Handler.
 *
 * Verarbeitet die oobCode-Links aus allen Auth-Mails desselben Firebase-Projekts:
 *   - mode=resetPassword  → Passwort setzen/zurücksetzen + nahtloser Auto-Login
 *   - mode=verifyEmail    → E-Mail-Adresse bestätigen
 *   - mode=recoverEmail   → rückgängig gemachte E-Mail-Änderung wiederherstellen
 *
 * Damit Firebase diese Seite statt der generischen Default-Seite aufruft, muss in der
 * Firebase Console (Authentication → Templates → "Action-URL anpassen") die URL auf
 * https://jassguru.ch/auth/action/ gesetzt werden. Gilt projektweit für ALLE Mail-Links.
 *
 * Wichtig: Da der Reset-Link auch für passwortlose JVS-Konten (via jassverband.ch ohne
 * Passwort angelegt) erzeugt wird, ist dieser Flow zugleich der "Passwort erstmals
 * festlegen"-Pfad. "Zurücksetzen" und "festlegen" sind technisch identisch.
 */

type Phase = "loading" | "resetForm" | "working" | "success" | "verified" | "error";

// Open-Redirect-Schutz: nur same-origin Weiterleitungen erlauben, sonst /start.
function safeContinuePath(continueUrl: string | undefined): string {
  if (!continueUrl) return "/start";
  try {
    const u = new URL(continueUrl, "https://jassguru.ch");
    if (u.hostname === "jassguru.ch" || u.hostname === "www.jassguru.ch") {
      return u.pathname + u.search;
    }
  } catch {
    /* ungültige URL → Fallback */
  }
  return "/start";
}

function AuthActionInner() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [email, setEmail] = useState("");
  const [oobCode, setOobCode] = useState("");
  const [continuePath, setContinuePath] = useState("/start");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Query-Parameter sind im Static Export erst client-seitig verfügbar.
  useEffect(() => {
    if (!router.isReady) return;

    const mode = typeof router.query.mode === "string" ? router.query.mode : "";
    const code = typeof router.query.oobCode === "string" ? router.query.oobCode : "";
    const cont = typeof router.query.continueUrl === "string" ? router.query.continueUrl : undefined;

    setOobCode(code);
    setContinuePath(safeContinuePath(cont));

    if (!code) {
      setError("Dieser Link ist unvollständig oder ungültig.");
      setPhase("error");
      return;
    }

    if (mode === "resetPassword") {
      verifyPasswordResetCode(getAuth(), code)
        .then((mail) => {
          setEmail(mail);
          setPhase("resetForm");
        })
        .catch((e) => {
          authLogger.error("verifyPasswordResetCode fehlgeschlagen:", e);
          setError("Dieser Link ist abgelaufen oder wurde bereits verwendet. Fordere unten einfach einen neuen an.");
          setPhase("error");
        });
    } else if (mode === "verifyEmail" || mode === "recoverEmail") {
      applyActionCode(getAuth(), code)
        .then(() => setPhase("verified"))
        .catch((e) => {
          authLogger.error("applyActionCode fehlgeschlagen:", e);
          setError("Dieser Bestätigungslink ist abgelaufen oder ungültig.");
          setPhase("error");
        });
    } else {
      setError("Unbekannte oder nicht unterstützte Aktion.");
      setPhase("error");
    }
  }, [router.isReady, router.query]);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen lang sein.");
      return;
    }
    if (password !== confirm) {
      setError("Die Passwörter stimmen nicht überein.");
      return;
    }

    setPhase("working");
    try {
      await confirmPasswordReset(getAuth(), oobCode, password);

      // Nahtloser Auto-Login → kein zweites Mal Passwort tippen, direkt in die App.
      try {
        await signInWithEmailAndPassword(getAuth(), email, password);
        setPhase("success");
        setTimeout(() => router.push(continuePath), 800);
      } catch (loginErr) {
        // Passwort ist gesetzt, nur der Auto-Login klemmt → sauberer manueller Login.
        authLogger.error("Auto-Login nach Passwort-Reset fehlgeschlagen:", loginErr);
        setPhase("success");
        setTimeout(() => router.push("/auth/login"), 1200);
      }
    } catch (e) {
      authLogger.error("confirmPasswordReset fehlgeschlagen:", e);
      setError("Das Passwort konnte nicht gesetzt werden. Der Link ist evtl. abgelaufen — fordere unten einen neuen an.");
      setPhase("error");
    }
  };

  // --- Render ---

  if (phase === "loading" || phase === "working") {
    return (
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="flex items-center justify-center py-8">
          <div className="h-8 w-8 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" />
        </div>
        <p className="text-gray-300">
          {phase === "working" ? "Passwort wird gespeichert …" : "Einen Moment …"}
        </p>
      </div>
    );
  }

  if (phase === "success") {
    return (
      <div className="w-full max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-bold text-green-400">Passwort gesetzt!</h1>
        <p className="text-gray-200">Du wirst eingeloggt und weitergeleitet …</p>
      </div>
    );
  }

  if (phase === "verified") {
    return (
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold text-green-400">E-Mail bestätigt!</h1>
        <p className="text-gray-200">Deine E-Mail-Adresse ist jetzt verifiziert.</p>
        <Button
          className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-md font-bold"
          onClick={() => router.push("/start")}
        >
          Zur App
        </Button>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="text-2xl font-bold text-white">Das hat nicht geklappt</h1>
        {error && (
          <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200 text-left">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-md font-bold"
          onClick={() => router.push("/auth/reset-password")}
        >
          Neuen Link anfordern
        </Button>
        <button
          onClick={() => router.push("/auth/login")}
          className="text-sm text-gray-500 hover:text-gray-300 underline"
        >
          Zurück zum Login
        </button>
      </div>
    );
  }

  // phase === "resetForm"
  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-white">Neues Passwort erstellen</h1>
        <p className="text-gray-300">
          Wähle ein Passwort für <span className="text-white font-medium">{email}</span>. Danach bist du
          direkt eingeloggt.
        </p>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSetPassword} className="space-y-4">
        <div className="relative">
          <Input
            placeholder="Neues Passwort"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white pr-20 focus:border-gray-500 [&[type=password]]:tracking-widest"
            autoComplete="new-password"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "Verbergen" : "Anzeigen"}
          </button>
        </div>

        <Input
          placeholder="Passwort bestätigen"
          type={showPassword ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="bg-gray-800 border-gray-700 text-white focus:border-gray-500 [&[type=password]]:tracking-widest"
          autoComplete="new-password"
        />

        <Button
          type="submit"
          className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-md"
        >
          Passwort speichern & einloggen
        </Button>
      </form>
    </div>
  );
}

const AuthActionPage: React.FC = () => {
  return (
    <AuthProvider>
      <AuthLayout>
        <SeoHead noIndex={true} />
        <AuthActionInner />
      </AuthLayout>
    </AuthProvider>
  );
};

export default AuthActionPage;
