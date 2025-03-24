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
import { useRouter } from 'next/router';

// Schema für die Registrierung
const registerSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Passwort muss mindestens 6 Zeichen lang sein'),
  displayName: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein').max(50, 'Name darf maximal 50 Zeichen lang sein'),
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export function RegisterForm() {
  const { register, status, error, clearError } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      displayName: '',
    },
  });

  const onSubmit = async (data: RegisterFormValues) => {
    clearError();
    try {
      await register(data.email, data.password, data.displayName);
      // Nach erfolgreicher Registrierung direkt zur Jass-Seite navigieren
      router.push('/jass');
    } catch (error) {
      console.error('Registrierungsfehler:', error);
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
            name="displayName"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-gray-300">Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Ihr Name"
                    type="text"
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
            {isLoading ? "Registrierung..." : "Registrieren"}
          </Button>
        </form>
      </Form>
    </div>
  );
} 