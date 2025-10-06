import React from "react";
import { SeoHead } from "@/components/layout/SeoHead";
import {AuthLayout} from "@/components/auth/AuthLayout";
import {ResetPasswordForm} from "@/components/auth/ResetPasswordForm";
import {AuthProvider} from "@/providers/AuthProvider";


const ResetPasswordPage: React.FC = () => {
    return (
        <AuthProvider>
            <AuthLayout>
                <SeoHead noIndex={true} />
                <ResetPasswordForm />
            </AuthLayout>
        </AuthProvider>
    );
};

export default ResetPasswordPage;
