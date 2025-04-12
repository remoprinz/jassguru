import React, {useEffect, useState} from "react";
import "../styles/globals.css";
import type {AppProps} from "next/app";
import {register} from "../pwa/serviceWorkerRegistration";
import DebugLog from "../components/ui/DebugLog";
import {AppProvider} from "../contexts/AppContext";
import Head from "next/head";
import {useWakeLock} from "../hooks/useWakeLock";
import {AuthProvider} from "../providers/AuthProvider";
import {UserProvider} from "../providers/UserProvider";
import {useAuthStore} from "@/store/authStore";
import GlobalNotificationContainer from "../components/notifications/GlobalNotificationContainer";

const MyApp = ({Component, pageProps}: AppProps) => {
  const [isClient, setIsClient] = useState(false);
  useWakeLock();
  const initAuth = useAuthStore((state) => state.initAuth);

  console.log(`_app.tsx: Rendering Component: ${Component.displayName || Component.name || 'Unknown'}, Pathname: ${pageProps.router?.pathname || (typeof window !== 'undefined' ? window.location.pathname : '')}`);

  useEffect(() => {
    setIsClient(true);
    console.log("_app.tsx: useEffect - BEFORE calling register()");
    register();
    console.log("_app.tsx: useEffect - AFTER calling register()");
    console.log("_app.tsx: useEffect - Rufe initAuth() auf");
    initAuth();
  }, [initAuth]);

  return (
    <AppProvider>
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <title>Jassguru - Schreibe Jassgeschichte</title>
        <meta name="description" content="Schreibe Jassgeschichte mit der digitalen Jasstafel und umfassenden Statistiken." />
        <meta property="og:title" content="Jassguru - Schreibe Jassgeschichte" />
        <meta property="og:description" content="Schreibe Jassgeschichte mit der digitalen Jasstafel und umfassenden Statistiken." />
        <meta property="og:url" content="https://jassguru.ch" />
        <meta property="og:image" content="https://jassguru.ch/welcome-guru.png" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Jassguru - Schreibe Jassgeschichte" />
        <meta name="twitter:description" content="Schreibe Jassgeschichte mit der digitalen Jasstafel und umfassenden Statistiken." />
        <meta name="twitter:image" content="https://jassguru.ch/welcome-guru.png" />
      </Head>
      <AuthProvider>
        <UserProvider>
          <Component {...pageProps} />
          <GlobalNotificationContainer />
        </UserProvider>
      </AuthProvider>
      <DebugLog />
    </AppProvider>
  );
};

export default MyApp;
