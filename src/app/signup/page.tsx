
'use client'; // Added "use client" directive

// This page is deprecated.
// Signup functionality has been integrated into the /login page.
// This file can be removed, or a redirect can be set up.
// For now, rendering nothing or a redirect component.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DeprecatedSignupPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login'); // Redirect to the new combined auth page
  }, [router]);

  return null; // Or a loading spinner while redirecting
}
