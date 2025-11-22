"use client";

import {useState} from "react";
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

const resetPasswordSchema = z.object({
  email: z.string().email("Ungültige E-Mail-Adresse"),
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const {resetPassword, status, error, clearError} = useAuthStore();
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    try {
      clearError();
      await resetPassword(data.email);
      setIsSubmitted(true);
    } catch {
      // Der Fehler wird bereits im Store gesetzt, keine lokale Variable nötig
    }
  };

  const isLoading = status === "loading";

  if (isSubmitted) {
    return (
      <div className="w-full max-w-md space-y-6 text-center">
        <div className="bg-green-900/30 border border-green-900 rounded-lg p-6">
          <h2 className="text-2xl font-bold text-green-400 mb-4">E-Mail ist unterwegs!</h2>
          <p className="text-gray-200 mb-6">
            Wir haben dir einen Link zum Erstellen deines neuen Passworts gesendet.
          </p>
          <ol className="text-left text-gray-300 space-y-3 mb-6 list-decimal pl-5">
            <li>Prüfe dein E-Mail-Postfach</li>
            <li>Klicke auf den Link in der E-Mail</li>
            <li>Erstelle dein neues Passwort</li>
          </ol>
          <p className="text-sm text-gray-400 italic mb-0">
            Keine E-Mail erhalten? Prüfe bitte auch deinen Spam-Ordner.
          </p>
        </div>

        <Button
          className="w-full bg-blue-600 hover:bg-blue-700 text-white h-12 rounded-md font-bold"
          onClick={() => window.location.href = "/auth/login"}
        >
          Ich habe mein Passwort erstellt → Jetzt Einloggen
        </Button>
        
        <button 
          onClick={() => setIsSubmitted(false)}
          className="text-sm text-gray-500 hover:text-gray-300 underline mt-4"
        >
          E-Mail erneut senden
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-white">Neues Passwort erstellen</h1>
        <p className="text-gray-300">Gib deine Email ein, um ein neues Passwort zu erstellen.</p>
      </div>

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
            className="w-full bg-green-600 hover:bg-green-700 text-white h-12 rounded-md"
            disabled={isLoading}
          >
            {isLoading ? "Wird gesendet..." : "Link senden"}
          </Button>
        </form>
      </Form>

      <div className="text-center space-y-2">
        <p className="text-sm text-gray-400">
          <Link href="/auth/login" className="text-blue-400 hover:underline text-base font-medium">
            → Zur Jassguru-App
        </Link>
      </p>
        <p className="text-xs text-gray-500">
          Noch keinen Account? Registriere dich über <a href="https://jassmeister.ch" className="text-blue-400 hover:underline">jassmeister.ch</a>
        </p>
      </div>
    </div>
  );
}
