
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { ShieldAlert } from 'lucide-react';

export default function QrLoginSetupRemovedPage() {
  const router = useRouter();

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-6 w-6 text-destructive" />
          Functionality Removed
        </CardTitle>
        <CardDescription>
          The QR Code Session Login Setup functionality has been removed from the application.
        </CardDescription>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-muted-foreground mb-6">
          This page is no longer active.
        </p>
        <Button onClick={() => router.push('/dashboard')}>
          Go to Dashboard
        </Button>
      </CardContent>
    </Card>
  );
}
