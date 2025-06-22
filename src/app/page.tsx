
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

export default function RootPage() {
  const { authUser, firestoreUser, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!authUser) {
        router.replace('/login');
      } else if (firestoreUser?.requiresPasswordChange) {
        router.replace('/force-password-change');
      } else {
        router.replace('/dashboard');
      }
    }
  }, [authUser, firestoreUser, loading, router]);

  // This component will show a loading spinner until the redirection logic in the useEffect completes.
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
      <Loader2 className="h-12 w-12 animate-spin text-primary" />
      <p className="ml-2">Loading application...</p>
    </div>
  );
}
