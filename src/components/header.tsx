
'use client';
import Link from 'next/link';
import { Sheet as SheetIcon, UserCircle, LogOut, Settings, Languages, User as UserProfileIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useAuth } from '@/contexts/AuthContext';
import React, { useState, useEffect } from 'react';
import Image from 'next/image'; 

const DEFAULT_APP_NAME_HEADER = ""; // Changed from "AttendX"

export function Header({ appLogoUrl, appName }: { appLogoUrl?: string | null, appName?: string }) {
  const { authUser, firestoreUser, signOut, loading } = useAuth();
  const effectiveAppName = appName || DEFAULT_APP_NAME_HEADER;
  
  const [currentLanguage, setCurrentLanguage] = useState<'EN' | 'ES'>(() => {
    if (typeof window !== 'undefined') {
      const storedLang = localStorage.getItem('appLanguage') as 'EN' | 'ES';
      return ['EN', 'ES'].includes(storedLang) ? storedLang : 'ES';
    }
    return 'ES'; 
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('appLanguage', currentLanguage);
    }
  }, [currentLanguage]);

  const handleLogout = async () => {
    await signOut();
  };

  const toggleLanguage = () => {
    setCurrentLanguage((prevLang) => {
      const newLang = prevLang === 'ES' ? 'EN' : 'ES';
      console.log(`Language preference set to: ${newLang}`);
      return newLang;
    });
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-primary px-4 text-primary-foreground sm:static sm:h-auto sm:px-6 py-2">
      <SidebarTrigger className="text-primary-foreground md:hidden" />
      <div className="flex items-center gap-2">
        <Link href="/" className="flex items-center gap-2 text-xl font-semibold font-headline text-primary-foreground">
          {appLogoUrl ? (
            <Image 
              src={appLogoUrl} 
              alt="App Logo" 
              width={144} 
              height={36} 
              className="object-contain h-auto max-h-[36px] w-auto max-w-[144px]" 
            />
          ) : (
            <SheetIcon className="h-6 w-6" />
          )}
          <span>{effectiveAppName}</span>
        </Link>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleLanguage}
          className="text-primary-foreground hover:bg-white/20 focus-visible:ring-primary-foreground px-2"
          aria-label={`Switch language to ${currentLanguage === 'ES' ? 'English' : 'Español'}`}
        >
          <Languages className="h-4 w-4 mr-1 sm:mr-2" />
          <span className="hidden sm:inline">{currentLanguage}</span>
        </Button>

        {authUser && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="overflow-hidden rounded-full text-primary-foreground hover:bg-white/20 focus-visible:ring-primary-foreground"
              >
                {firestoreUser?.photoUrl ? (
                  <Image src={firestoreUser.photoUrl} alt="User avatar" width={32} height={32} className="rounded-full" />
                ) : (
                  <UserCircle className="h-5 w-5" />
                )}
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {firestoreUser?.name || authUser.email || 'My Account'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserProfileIcon className="mr-2 h-4 w-4" />
                  My Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/app-settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} disabled={loading}>
                <LogOut className="mr-2 h-4 w-4" />
                Logout
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
