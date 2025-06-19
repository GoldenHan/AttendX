
'use client';
import Link from 'next/link';
import { Sheet as SheetIcon, UserCircle, LogOut, Settings, Languages } from 'lucide-react'; // Added Languages icon
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
import React, { useState } from 'react'; // Added useState

export function Header() {
  const { authUser, firestoreUser, signOut, loading } = useAuth();
  const [currentLanguage, setCurrentLanguage] = useState<'EN' | 'ES'>('ES'); // Default to Spanish

  const handleLogout = async () => {
    await signOut();
  };

  const toggleLanguage = () => {
    setCurrentLanguage((prevLang) => (prevLang === 'ES' ? 'EN' : 'ES'));
    // In a real app, you would call your i18n library's changeLanguage function here
    // and likely store the preference in localStorage or a cookie.
    console.log(`Language switched to: ${currentLanguage === 'ES' ? 'EN' : 'ES'}`);
  };

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-border bg-primary px-4 text-primary-foreground sm:static sm:h-auto sm:px-6 py-2">
      <SidebarTrigger className="text-primary-foreground md:hidden" />
      <div className="flex items-center gap-2">
        <SheetIcon className="h-6 w-6 text-primary-foreground" />
        <Link href="/" className="text-xl font-semibold font-headline text-primary-foreground">
          SERVEX
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
                <UserCircle className="h-5 w-5" />
                <span className="sr-only">Toggle user menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                {firestoreUser?.name || authUser.email || 'My Account'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
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
