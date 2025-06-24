
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
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);
  
  useEffect(() => {
    if (!loading) {
      if (!authUser) {
        router.replace('/login');
      } else if (firestoreUser?.requiresPasswordChange && pathname !== '/force-password-change') {
        router.replace('/force-password-change');
      }
    }
  }, [authUser, firestoreUser, loading, router, pathname]);

  if (loading || (authUser && !firestoreUser)) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (pathname === '/force-password-change' || pathname === '/login') {
      return <>{children}</>;
  }

  // If we are still loading but the redirect logic determined we need to go to password change,
  // show a loader to avoid flashing the main app shell.
  if (firestoreUser?.requiresPasswordChange) {
      return (
       <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  const effectiveAppName = institution?.appName || institution?.name;
  const effectiveLogoUrl = institution?.logoDataUrl;

  return <MainAppShell appLogoUrl={effectiveLogoUrl} appName={effectiveAppName}>{children}</MainAppShell>;
}
