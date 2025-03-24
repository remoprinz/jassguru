import React from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import AuthTabs from '@/components/auth/AuthTabs';
import { AuthProvider } from '@/providers/AuthProvider';

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