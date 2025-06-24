
'use client'; 

import React, { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center h-full p-4">
      <Card className="w-full max-w-lg text-center bg-destructive/5 border-destructive/20">
        <CardHeader>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <CardTitle className="mt-4 text-2xl font-bold text-destructive">
            Something went wrong!
          </CardTitle>
          <CardDescription className="text-destructive/80">
            An unexpected error occurred. Please try again.
          </CardDescription>
        </CardHeader>
        <CardContent>
           <p className="text-sm text-muted-foreground">
            We've logged the error and our team will look into it.
          </p>
           {error?.message && (
            <div className="mt-4 text-xs bg-destructive/10 p-2 rounded-md font-mono text-destructive">
              <p><strong>Error:</strong> {error.message}</p>
            </div>
           )}
        </CardContent>
        <CardFooter className="justify-center">
            <Button
                variant="destructive"
                onClick={
                // Attempt to recover by trying to re-render the segment
                () => reset()
                }
            >
                Try again
            </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
