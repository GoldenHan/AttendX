
'use client';

import React from 'react';
import {
  SidebarProvider,
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarFooter,
  SidebarInset,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { Header } from '@/components/header';
import { SidebarNav } from '@/components/sidebar-nav';
import { Button } from '@/components/ui/button';
import { LogOut, Loader2, SheetIcon } from 'lucide-react'; // Added SheetIcon
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

export function MainAppShell({ 
  children,
  appLogoUrl 
}: { 
  children: React.ReactNode;
  appLogoUrl?: string | null;
}) {
  const { signOut, loading: authLoading, firestoreUser } = useAuth();

  const handleLogout = async () => {
    await signOut();
  };
  
  return (
    <SidebarProvider>
      <Sidebar variant="sidebar" collapsible="icon" side="left">
        <SidebarHeader className="p-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold font-headline text-primary">
            {appLogoUrl ? (
              <>
                <Image src={appLogoUrl} alt="App Logo" width={120} height={30} className="object-contain h-auto max-h-[30px] w-auto max-w-[120px] group-data-[collapsible=icon]:hidden" />
                <Image src={appLogoUrl} alt="App Logo Icon" width={24} height={24} className="object-contain h-6 w-6 hidden group-data-[collapsible=icon]:block" />
              </>
            ) : (
              <>
                <SheetIcon className="h-6 w-6 group-data-[collapsible=icon]:block hidden" /> 
                <SheetIcon className="h-6 w-6 group-data-[collapsible=icon]:hidden" /> 
                <span className="group-data-[collapsible=icon]:hidden">AttendX</span>
              </>
            )}
          </Link>
          <SidebarTrigger className="text-sidebar-foreground hidden md:flex" />
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
          <Button variant="ghost" className="w-full justify-start group-data-[collapsible=icon]:justify-center" onClick={handleLogout} disabled={authLoading}>
            {authLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin group-data-[collapsible=icon]:mr-0" />}
            {!authLoading && <LogOut className="mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0" />}
            <span className="group-data-[collapsible=icon]:hidden">Logout</span>
          </Button>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="flex flex-col">
        <Header appLogoUrl={appLogoUrl} />
        <main className="flex-1 overflow-auto p-4 sm:p-6 bg-background">
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
