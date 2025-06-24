'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// This page has been disabled as per the user's request to favor manual attendance entry.
// It will now redirect users to the dashboard.
export default function QrLoginPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return null;
}
