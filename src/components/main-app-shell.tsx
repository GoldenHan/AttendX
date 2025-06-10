
'use client';

import React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
} from '@/components/ui/sidebar';
import { Header } from '@/components/header';
import { SidebarNav } from '@/components/sidebar-nav';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

export function MainAppShell({ children }: { children: React.ReactNode }) {
  const { signOut, loading: authLoading, firestoreUser } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };
  
  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="icon" side="left">
        <SidebarHeader className="p-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold font-headline text-primary">
            <span className="group-data-[collapsible=icon]:hidden">SERVEX</span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          {authLoading && !firestoreUser ? (
            <div className="flex justify-center items-center h-full">
               <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : (
             <SidebarNav />
          )}
        </SidebarContent>
        <SidebarFooter className="flex flex-col items-center">
          <div className="my-4 group-data-[collapsible=icon]:hidden">
            <Image
              src="https://storage.googleapis.com/project-boreal-fire.appspot.com/snoopy.jpg"
              alt="Snoopy brand character"
              width={100}
              height={100}
              className="rounded-full object-cover"
              data-ai-hint="dog cartoon"
            />
          </div>
           <div className="my-2 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:w-full hidden">
            <Image
              src="https://storage.googleapis.com/project-boreal-fire.appspot.com/snoopy.jpg"
              alt="Snoopy brand character"
              width={32} 
              height={32}
              className="rounded-full object-cover"
              data-ai-hint="dog cartoon"
            />
          </div>
          <Button variant="ghost" className="w-full justify-start group-data-[collapsible=icon]:justify-center" onClick={handleLogout} disabled={authLoading}>
            {authLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin group-data-[collapsible=icon]:mr-0" />}
            {!authLoading && <LogOut className="mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0" />}
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex flex-col">
        <Header />
        <main className="flex-1 overflow-auto p-4 sm:p-6 bg-background">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
