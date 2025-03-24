import React from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import AuthTabs from '@/components/auth/AuthTabs';
import { AuthProvider } from '@/providers/AuthProvider';

const RegisterPage: React.FC = () => {
  return (
    <AuthProvider>
      <AuthLayout>
        <AuthTabs defaultTab="register" />
      </AuthLayout>
    </AuthProvider>
  );
};

export default RegisterPage; 