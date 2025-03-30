'use client';

import { useState } from 'react';
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
import { useAuthStore } from '@/store/authStore';
import { Alert, AlertDescription } from '@/components/ui/alert';
import Link from 'next/link';

const resetPasswordSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
});

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

export function ResetPasswordForm() {
  const { resetPassword, status, error, clearError } = useAuthStore();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    try {
      clearError();
      setSuccessMessage(null);
      await resetPassword(data.email);
      setSuccessMessage('Eine E-Mail zum Zurücksetzen Ihres Passworts wurde gesendet. Bitte überprüfen Sie Ihren Posteingang.');
      form.reset();
    } catch {
      // Der Fehler wird bereits im Store gesetzt, keine lokale Variable nötig
    }
  };

  const isLoading = status === 'loading';

  return (
    <div className="w-full max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-white">Passwort zurücksetzen</h1>
        <p className="text-gray-300">Geben Sie Ihre E-Mail-Adresse ein, um Ihr Passwort zurückzusetzen</p>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="bg-green-900/30 border-green-900 text-green-200">
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">E-Mail</FormLabel>
                <FormControl>
                  <Input
                    placeholder="ihre.email@beispiel.ch"
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
            {isLoading ? "Wird gesendet..." : "Zurücksetzen-Link senden"}
          </Button>
        </form>
      </Form>

      <p className="text-center text-sm text-gray-400">
        <Link href="/auth/login" className="text-blue-400 hover:underline">
          Zurück zum Login
        </Link>
      </p>
    </div>
  );
} 