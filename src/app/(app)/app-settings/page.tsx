'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Settings } from 'lucide-react';
import Image from 'next/image';

export default function AppSettingsPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          Application Settings
        </CardTitle>
        <CardDescription>Configure general application settings and preferences.</CardDescription>
      </CardHeader>
      <CardContent className="text-center py-10">
         <Image 
          src="https://placehold.co/300x200.png" 
          alt="Feature in progress" 
          width={300} 
          height={200} 
          className="mx-auto mb-4 rounded-md"
          data-ai-hint="gears settings"
        />
        <h2 className="text-xl font-semibold text-foreground">Feature Coming Soon!</h2>
        <p className="text-muted-foreground">This section is currently under development. Check back later for application settings.</p>
      </CardContent>
    </Card>
  );
}
