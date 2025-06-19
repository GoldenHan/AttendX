
'use client'; // Add "use client" for useEffect

import type {Metadata} from 'next'; // Keep if you still export metadata conditionally
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { AuthProvider } from '@/contexts/AuthContext';
import React, { useEffect } from 'react'; // Import useEffect

// Conditional metadata export (optional, but often done in root layout if "use client" is used)
// export const metadata: Metadata = {
//   title: 'SERVEX - Attendance Management',
//   description: 'Professional attendance tracking for students and staff.',
// };
// If you keep metadata here, ensure it's exported conditionally or Next.js might complain with "use client"

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  useEffect(() => {
    // Apply theme on initial client-side load
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      // Default to light mode if no theme is stored or if it's 'light'
      document.documentElement.classList.remove('dark');
    }
  }, []);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className="font-body antialiased">
        <AuthProvider>
          {children}
          <Toaster />
        </AuthProvider>
      </body>
    </html>
  );
}

