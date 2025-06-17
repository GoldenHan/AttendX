
'use client';
import { MainAppShell } from '@/components/main-app-shell';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, usePathname } from 'next/navigation'; // Import usePathname
import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authUser, firestoreUser, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname(); // Get current path

  useEffect(() => {
    if (!loading) {
      const isForcePasswordChangePage = pathname === '/force-password-change';
      
      if (!authUser && !isForcePasswordChangePage) { // Don't redirect from force-password-change if not authed yet, page handles it
        router.push('/login');
      } else if (authUser && firestoreUser?.requiresPasswordChange && !isForcePasswordChangePage) {
        router.push('/force-password-change');
      } else if (authUser && !firestoreUser?.requiresPasswordChange && isForcePasswordChangePage) {
        // If user lands on force-password-change but doesn't need it, redirect to dashboard
        router.push('/dashboard');
      }
    }
  }, [authUser, firestoreUser, loading, router, pathname]);

  // Show loading screen if auth state is loading OR 
  // if user is authenticated but requires password change and is not yet on the change page
  if (loading || !authUser || (authUser && firestoreUser?.requiresPasswordChange && pathname !== '/force-password-change')) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // If user is on the force-password-change page, render it directly without the MainAppShell
  if (pathname === '/force-password-change') {
      return <>{children}</>;
  }

  return <MainAppShell>{children}</MainAppShell>;
}
