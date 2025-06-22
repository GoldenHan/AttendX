
import React from 'react';

// This layout is for pages that should not have the main application shell,
// like printable certificates or reports. It provides a neutral background.
export default function PrintableLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
        <head>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet" />
        </head>
        <body className="font-body antialiased bg-gray-200 dark:bg-gray-800">
            {children}
        </body>
    </html>
  );
}
