
'use client';
import { MainAppShell } from '@/components/main-app-shell';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation'; 
import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authUser, firestoreUser, loading, institution } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  if (loading || !authUser || (authUser && firestoreUser?.requiresPasswordChange && pathname !== '/force-password-change')) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (pathname === '/force-password-change') {
      return <>{children}</>;
  }

  const effectiveAppName = institution?.appName || institution?.name;
  const effectiveLogoUrl = institution?.logoDataUrl;

  return <MainAppShell appLogoUrl={effectiveLogoUrl} appName={effectiveAppName}>{children}</MainAppShell>;
}
