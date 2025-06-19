
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

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-2">Loading application...</p>
      </div>
    );
  }

  // Fallback content, though redirection should happen quickly.
  // This ensures a valid React component is always returned.
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background">
        <p>Redirecting...</p>
    </div>
  );
}
