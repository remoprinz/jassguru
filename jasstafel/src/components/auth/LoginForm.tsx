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
import { FaGoogle } from 'react-icons/fa';
import Link from 'next/link';
import { useRouter } from 'next/router';

const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Passwort muss mindestens 6 Zeichen lang sein'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { login, loginWithGoogle, status, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    clearError();
    try {
      await login(data.email, data.password);
      // Nach erfolgreicher Anmeldung direkt zur Jass-Seite navigieren
      router.push('/jass');
    } catch (error) {
      // Fehlerbehandlung erfolgt bereits im AuthStore
      console.error('Login error:', error);
    }
  };

  const handleGoogleLogin = async () => {
    clearError();
    try {
      await loginWithGoogle();
      // Nach erfolgreicher Google-Anmeldung direkt zur Jass-Seite navigieren
      router.push('/jass');
    } catch (error) {
      console.error('Google login error:', error);
    }
  };

  const isLoading = status === 'loading';

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
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">E-Mail</FormLabel>
                <FormControl>
                  <Input
                    placeholder="ihre.email@beispiel.ch"
                    type="email"
                    disabled={isLoading}
                    className="bg-gray-700 border-gray-600 text-white"
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
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">Passwort</FormLabel>
                <FormControl>
                  <div className="relative">
                    <Input
                      placeholder="••••••••"
                      type={showPassword ? "text" : "password"}
                      disabled={isLoading}
                      className="bg-gray-700 border-gray-600 text-white pr-20"
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
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            disabled={isLoading}
          >
            {isLoading ? "Anmeldung läuft..." : "Anmelden"}
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
        className="w-full border-gray-600 text-white hover:bg-gray-700"
        onClick={handleGoogleLogin}
        disabled={isLoading}
      >
        <FaGoogle className="mr-2 h-4 w-4" />
        Mit Google anmelden
      </Button>

      <p className="text-center text-sm text-gray-400">
        <Link href="/auth/reset-password" className="text-blue-400 hover:underline">
          Passwort vergessen?
        </Link>
      </p>
    </div>
  );
} 