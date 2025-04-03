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
import {useRouter} from "next/router";
import Image from "next/image";
import {useUIStore} from "@/store/uiStore";

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
  const router = useRouter();

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

      // Erfolgsmeldung anzeigen
      showNotification({
        message: "Ein Bestätigungslink wurde an deine E-Mail gesendet. Bitte überprüfe dein Postfach, um die Registrierung abzuschliessen.",
        type: "success",
      });

      // Entfernen oder anpassen des Redirects, da der Benutzer zuerst die E-Mail bestätigen muss.
      // setTimeout(() => {
      //   router.push('/auth/login');
      // }, 1500);
    } catch (err) {
      console.error("Registrierungsfehler im Formular:", err);
    }
  };

  const handleGoogleRegister = async () => {
    clearError();
    try {
      await loginWithGoogle();
      router.push("/start");
    } catch (error) {
      console.error("Google-Registrierungsfehler:", error);
    }
  };

  const isLoading = status === "loading";

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
            render={({field}) => (
              <FormItem>
                <FormLabel className="text-gray-300">Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Dein Jassname"
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
            {isLoading ? "Registrierung läuft..." : "Registrieren"}
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
    </div>
  );
}
