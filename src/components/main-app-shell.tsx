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
import { LogOut } from 'lucide-react';
import Link from 'next/link';

export function MainAppShell({ children }: { children: React.ReactNode }) {
  // Example: retrieve sidebar state from cookie
  const initialSidebarOpen = typeof window !== 'undefined' 
    ? document.cookie.includes('sidebar_state=true') 
    : true;

  return (
    <SidebarProvider defaultOpen={initialSidebarOpen}>
      <Sidebar variant="sidebar" collapsible="icon" side="left">
        <SidebarHeader className="p-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-semibold font-headline text-primary">
            {/* Icon can be added here if needed */}
            <span className="group-data-[collapsible=icon]:hidden">AttendX</span>
          </Link>
          {/* Trigger is usually outside or in header, but can be here for specific layouts */}
          {/* <SidebarTrigger className="group-data-[collapsible=icon]:hidden" /> */}
        </SidebarHeader>
        <SidebarContent>
          <SidebarNav />
        </SidebarContent>
        <SidebarFooter>
          <Button variant="ghost" className="w-full justify-start group-data-[collapsible=icon]:justify-center">
            <LogOut className="mr-2 h-4 w-4 group-data-[collapsible=icon]:mr-0" />
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
