'use client';

import { useState, useEffect } from 'react';
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
import Image from 'next/image';
import { useUIStore } from '@/store/uiStore';

const loginSchema = z.object({
  email: z.string().email('Ungültige E-Mail-Adresse'),
  password: z.string().min(6, 'Passwort muss mindestens 6 Zeichen lang sein'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const { login, loginWithGoogle, status, error, clearError, resendVerificationEmail, user } = useAuthStore();
  const showNotification = useUIStore(state => state.showNotification);
  const [showPassword, setShowPassword] = useState(false);
  const [showVerificationWarning, setShowVerificationWarning] = useState(false);
  const router = useRouter();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  useEffect(() => {
    if (error || status !== 'error') {
        setShowVerificationWarning(false);
    }
  }, [error, status]);

  const onSubmit = async (data: LoginFormValues) => {
    clearError();
    setShowVerificationWarning(false);
    try {
      await login(data.email, data.password);
      
      const loggedInUser = useAuthStore.getState().user;

      if (loggedInUser) {
        if (loggedInUser.emailVerified) {
          router.push('/start');
        } else {
          setShowVerificationWarning(true);
          clearError(); 
        }
      } else {
        throw new Error('Benutzerdaten nach Login nicht verfügbar.');
      }

    } catch (err) {
      console.error('Login-Fehler im Formular:', err);
      setShowVerificationWarning(false); 
    }
  };

  const handleGoogleLogin = async () => {
    clearError();
    setShowVerificationWarning(false);
    try {
      await loginWithGoogle();
      router.push('/start'); 
    } catch (error) {
      console.error('Google login error:', error);
    }
  };

  const handleResendVerification = async () => {
    try {
      await resendVerificationEmail();
      setShowVerificationWarning(false);
      showNotification({
        message: 'Bestätigungs-E-Mail wurde erneut gesendet. Bitte prüfen Sie Ihr Postfach.',
        type: 'success'
      });
    } catch (resendError) {
      console.error('Fehler beim erneuten Senden:', resendError);
      showNotification({
         message: error || 'Fehler beim erneuten Senden der E-Mail.',
         type: 'error'
      });
    }
  };

  const isLoading = status === 'loading';

  return (
    <div className="w-full space-y-4">
      {error && !showVerificationWarning && (
        <Alert variant="destructive" className="bg-red-900/30 border-red-900 text-red-200">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {showVerificationWarning && (
        <Alert className="bg-yellow-900/30 border-yellow-900 text-yellow-200">
          <AlertDescription className="flex flex-col space-y-2">
            <span>Bitte bestätigen Sie Ihre E-Mail-Adresse. Überprüfen Sie Ihr Postfach (auch Spam).</span>
            <Button
              variant="link"
              className="p-0 h-auto text-yellow-300 hover:text-yellow-200 self-start"
              onClick={handleResendVerification}
              disabled={isLoading}
            >
              {isLoading ? 'Sende...' : 'Bestätigungs-E-Mail erneut senden'}
            </Button>
          </AlertDescription>
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
                      className="bg-gray-800 border-gray-700 text-white pr-20 focus:border-gray-500"
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
        className="w-full bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 font-medium h-12 rounded-md flex items-center justify-center"
        onClick={handleGoogleLogin}
        disabled={isLoading}
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

      <p className="text-center text-sm text-gray-400">
        <Link href="/auth/reset-password" className="text-blue-400 hover:underline">
          Passwort vergessen?
        </Link>
      </p>
    </div>
  );
} 