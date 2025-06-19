
'use client';
import { MainAppShell } from '@/components/main-app-shell';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation'; 
import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authUser, firestoreUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); 
  const [appLogoUrl, setAppLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    // Load initial logo URL from localStorage
    const storedLogoUrl = localStorage.getItem('appLogoUrl');
    if (storedLogoUrl) {
      setAppLogoUrl(storedLogoUrl);
    }

    // Listen for logo changes from AppSettings
    const handleLogoChange = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      setAppLogoUrl(customEvent.detail);
    };
    window.addEventListener('logoUrlChanged', handleLogoChange);

    return () => {
      window.removeEventListener('logoUrlChanged', handleLogoChange);
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
    // Apply theme on layout mount, if user navigates here from login (which clears theme)
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

  return <MainAppShell appLogoUrl={appLogoUrl}>{children}</MainAppShell>;
}
