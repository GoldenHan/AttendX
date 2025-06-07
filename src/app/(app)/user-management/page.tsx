'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users } from 'lucide-react';
import Image from 'next/image';

export default function UserManagementPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          User Management
        </CardTitle>
        <CardDescription>Manage student, teacher, and administrator accounts.</CardDescription>
      </CardHeader>
      <CardContent className="text-center py-10">
        <Image 
          src="https://placehold.co/300x200.png" 
          alt="Under construction" 
          width={300} 
          height={200} 
          className="mx-auto mb-4 rounded-md"
          data-ai-hint="construction team" 
        />
        <h2 className="text-xl font-semibold text-foreground">Feature Coming Soon!</h2>
        <p className="text-muted-foreground">This section is currently under development. Check back later for user management capabilities.</p>
      </CardContent>
    </Card>
  );
}
