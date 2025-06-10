
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { User as FirestoreUserType } from '@/types';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  authUser: FirebaseUser | null;
  firestoreUser: FirestoreUserType | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUserType | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setAuthUser(user);
        // Fetch Firestore user data
        const usersRef = collection(db, 'users');
        // Try fetching by UID first, then by email as a fallback if UID field is not yet populated in all user docs
        let userDocSnapshot;
        const qUid = query(usersRef, where('uid', '==', user.uid));
        const uidSnapshot = await getDocs(qUid);

        if (!uidSnapshot.empty) {
          userDocSnapshot = uidSnapshot.docs[0];
        } else if (user.email) {
          // Fallback to email if UID query yields no results
          const qEmail = query(usersRef, where('email', '==', user.email));
          const emailSnapshot = await getDocs(qEmail);
          if (!emailSnapshot.empty) {
            userDocSnapshot = emailSnapshot.docs[0];
          }
        }
        
        if (userDocSnapshot && userDocSnapshot.exists()) {
          setFirestoreUser({ id: userDocSnapshot.id, ...userDocSnapshot.data() } as FirestoreUserType);
        } else {
          console.warn('No Firestore document found for user:', user.uid, user.email);
          setFirestoreUser(null); 
          // Potentially sign out user if Firestore record is mandatory
          // await firebaseSignOut(auth);
          // setAuthUser(null);
        }
      } else {
        setAuthUser(null);
        setFirestoreUser(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signIn = async (email: string, pass: string) => {
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      // onAuthStateChanged will handle setting user and redirecting
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      setAuthUser(null);
      setFirestoreUser(null);
      router.push('/login');
    } catch (error) {
      console.error('Sign out error', error);
    } finally {
      setLoading(false);
    }
  };
  
  // Handle redirection logic within the provider to avoid FOUC or layout shifts
  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname === '/login';
      if (!authUser && !isAuthPage) {
        router.push('/login');
      } else if (authUser && isAuthPage) {
        router.push('/dashboard'); // Or '/'
      }
    }
  }, [authUser, loading, pathname, router]);

  // If still loading, show a full-page loader or nothing to prevent FOUC
  // This component doesn't render UI itself, but AppLayout can use this loading state
  // if (loading) {
  //   return (
  //     <div className="flex h-screen w-screen items-center justify-center">
  //       <Loader2 className="h-12 w-12 animate-spin text-primary" />
  //     </div>
  //   );
  // }


  return (
    <AuthContext.Provider value={{ authUser, firestoreUser, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
