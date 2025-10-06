import React, { useState } from "react";
import Link from 'next/link';
import { SeoHead } from "@/components/layout/SeoHead";
import {AuthLayout} from "@/components/auth/AuthLayout";
import AuthTabs from "@/components/auth/AuthTabs";
import {AuthProvider} from "@/providers/AuthProvider";

const LoginPage: React.FC = () => {
  return (
    <AuthProvider>
      <AuthLayout>
        <AuthTabs defaultTab="login" />
      </AuthLayout>
    </AuthProvider>
  );
};

export default LoginPage;
