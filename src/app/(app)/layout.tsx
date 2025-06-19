
'use client';
import { MainAppShell } from '@/components/main-app-shell';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation'; 
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

const DEFAULT_APP_NAME_LAYOUT = ""; // Changed from "AttendX"

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authUser, firestoreUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); 
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null);
  const [appName, setAppName] = useState<string>(DEFAULT_APP_NAME_LAYOUT);

  useEffect(() => {
    const storedLogoDataUrl = localStorage.getItem('appLogoDataUrl');
    if (storedLogoDataUrl) {
      setAppLogoUrl(storedLogoDataUrl);
    }
    const storedAppName = localStorage.getItem('appName');
    if (storedAppName) {
      setAppName(storedAppName);
    } else {
      setAppName(DEFAULT_APP_NAME_LAYOUT);
    }

    const handleLogoChange = (event: Event) => {
      const customEvent = event as CustomEvent<string | null>;
      setAppLogoUrl(customEvent.detail);
    };
    const handleAppNameChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setAppName(customEvent.detail || DEFAULT_APP_NAME_LAYOUT);
    };

    window.addEventListener('logoUrlChanged', handleLogoChange);
    window.addEventListener('appNameChanged', handleAppNameChange);

    return () => {
      window.removeEventListener('logoUrlChanged', handleLogoChange);
      window.removeEventListener('appNameChanged', handleAppNameChange);
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      const isForcePasswordChangePage = pathname === '/force-password-change';
      
      if (!authUser && !isForcePasswordChangePage) { 
        router.push('/login');
      } else if (authUser && firestoreUser?.requiresPasswordChange && !isForcePasswordChangePage) {
        router.push('/force-password-change');
      } else if (authUser && !firestoreUser?.requiresPasswordChange && isForcePasswordChangePage) {
        router.push('/dashboard');
      }
    }
  }, [authUser, firestoreUser, loading, router, pathname]);

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

  return <MainAppShell appLogoUrl={appLogoUrl} appName={appName}>{children}</MainAppShell>;
}

