import React from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { AuthProvider } from '@/providers/AuthProvider';

const ResetPasswordPage: React.FC = () => {
  return (
    <AuthProvider>
      <AuthLayout>
        <ResetPasswordForm />
      </AuthLayout>
    </AuthProvider>
  );
};

export default ResetPasswordPage; 