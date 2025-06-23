
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Sheet as SheetIcon, UserCircle, LogOut, Settings, Languages, User as UserProfileIcon, Bell } from 'lucide-react';
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
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import type { Notification } from '@/types';
import { formatDistanceToNow } from 'date-fns';

const DEFAULT_APP_NAME_HEADER = "AttendX";

export function Header({ appLogoUrl, appName }: { appLogoUrl?: string | null, appName?: string }) {
  const { authUser, firestoreUser, signOut, loading } = useAuth();
  const router = useRouter();
  const effectiveAppName = appName || DEFAULT_APP_NAME_HEADER;
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

  useEffect(() => {
    if (!firestoreUser?.id) return;

    const notifsQuery = query(
      collection(db, 'notifications'),
      where('userId', '==', firestoreUser.id),
      orderBy('createdAt', 'desc'),
      limit(15)
    );

    const unsubscribe = onSnapshot(notifsQuery, (snapshot) => {
      const fetchedNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notification));
      setNotifications(fetchedNotifications);
      const unread = fetchedNotifications.filter(n => !n.read).length;
      setUnreadCount(unread);
    }, (error) => {
      console.error("Error fetching notifications:", error);
    });

    return () => unsubscribe();
  }, [firestoreUser?.id]);

  const handleLogout = async () => {
    await signOut();
  };

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.read) {
        const notifRef = doc(db, 'notifications', notification.id);
        try {
            await updateDoc(notifRef, { read: true });
        } catch (error) {
            console.error("Error marking notification as read:", error);
        }
    }
    if (notification.relatedUrl) {
        router.push(notification.relatedUrl);
    }
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
                <Button variant="ghost" size="icon" className="relative rounded-full text-primary-foreground hover:bg-white/20 focus-visible:ring-primary-foreground">
                    <Bell className="h-5 w-5"/>
                    {unreadCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-primary"></span>
                        </span>
                    )}
                    <span className="sr-only">Toggle notifications</span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Notificaciones</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {notifications.length > 0 ? (
                    notifications.map(notif => (
                        <DropdownMenuItem key={notif.id} onSelect={() => handleNotificationClick(notif)} className="flex items-start gap-2 cursor-pointer whitespace-normal">
                             {!notif.read && <span className="mt-1.5 flex h-2 w-2 rounded-full bg-blue-500" />}
                             {notif.read && <span className="mt-1.5 flex h-2 w-2"/>}
                             <div className="flex-1">
                                <p className="text-sm">{notif.message}</p>
                                <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(notif.createdAt), { addSuffix: true })}</p>
                             </div>
                        </DropdownMenuItem>
                    ))
                ) : (
                    <DropdownMenuItem disabled>No hay notificaciones nuevas</DropdownMenuItem>
                )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

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
                {firestoreUser?.name || authUser.email || 'Mi Cuenta'}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/profile">
                  <UserProfileIcon className="mr-2 h-4 w-4" />
                  Mi Perfil
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/app-settings">
                  <Settings className="mr-2 h-4 w-4" />
                  Configuración
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} disabled={loading}>
                <LogOut className="mr-2 h-4 w-4" />
                Cerrar Sesión
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  );
}
