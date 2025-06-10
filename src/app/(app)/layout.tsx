
'use client';
import { MainAppShell } from '@/components/main-app-shell';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { authUser, firestoreUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !authUser) {
      router.push('/login');
    }
  }, [authUser, loading, router]);

  if (loading || !authUser) { // Also check for authUser to prevent rendering shell before redirect
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  // At this point, authUser is guaranteed to be non-null
  // firestoreUser might still be loading if onAuthStateChanged just fired and firestore fetch is pending
  // but the shell can render. Sidebar will handle firestoreUser states.

  return <MainAppShell>{children}</MainAppShell>;
}
