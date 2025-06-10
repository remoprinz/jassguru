"use client";

import React, {useState} from "react";
import {useRouter} from "next/router";
import {Tabs, TabsContent, TabsList, TabsTrigger} from "@/components/ui/tabs";
import {LoginForm} from "./LoginForm";
import {RegisterForm} from "./RegisterForm";
import {useAuthStore} from "@/store/authStore";
import {Button} from "@/components/ui/button";
import {FiArrowLeft} from "react-icons/fi";

export interface AuthTabsProps {
  defaultTab?: "login" | "register";
}

const AuthTabs: React.FC<AuthTabsProps> = ({defaultTab = "login"}) => {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const {continueAsGuest} = useAuthStore();
  const { origin } = router.query;

  const handleGuestPlay = () => {
    continueAsGuest();
    router.push("/jass");
  };

  const handleBack = () => {
    router.push("/");
  };

  return (
    <div className="w-full max-w-md bg-gray-800 rounded-xl p-6 shadow-2xl relative">
      {origin !== 'offline' && (
        <Button
          variant="ghost"
          className="absolute left-4 top-4 p-2 text-gray-400 hover:text-white"
          onClick={handleBack}
        >
          <FiArrowLeft className="w-5 h-5" />
        </Button>
      )}

      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-white">
          {activeTab === "login" ? "Anmelden" : "Registrieren"}
        </h1>
        <p className="text-gray-400 mt-1">
          {activeTab === "login" ?
            "Melde dich an, um auf deine gespeicherten Spiele, Statistiken und dein Profil zuzugreifen." :
            "Registriere dich, um Spiele zu speichern, Statistiken zu verfolgen und dein Jass-Profil zu erstellen."}
        </p>
      </div>

      <Tabs
        defaultValue={defaultTab}
        value={activeTab}
        onValueChange={setActiveTab}
        className="w-full"
      >
        <TabsList className="grid grid-cols-2 mb-6 bg-gray-700">
          <TabsTrigger
            value="login"
            className="data-[state=active]:bg-gray-600 data-[state=active]:text-white"
          >
            Anmelden
          </TabsTrigger>
          <TabsTrigger
            value="register"
            className="data-[state=active]:bg-gray-600 data-[state=active]:text-white"
          >
            Registrieren
          </TabsTrigger>
        </TabsList>

        <TabsContent value="login" className="mt-0">
          <LoginForm />
        </TabsContent>

        <TabsContent value="register" className="mt-0">
          <RegisterForm />
        </TabsContent>
      </Tabs>

      <div className="mt-8 text-center">
        <Button
          variant="outline"
          onClick={handleGuestPlay}
          className="w-full bg-gray-700 hover:bg-gray-600 text-white border-gray-600 h-12 rounded-xl"
        >
          Als Gast spielen
        </Button>
      </div>
    </div>
  );
};

export default AuthTabs;
