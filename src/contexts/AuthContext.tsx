
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword 
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc } from 'firebase/firestore';
import type { User as FirestoreUserType } from '@/types';
import { useRouter, usePathname } from 'next/navigation';
import { Loader2 } from 'lucide-react';

interface AuthContextType {
  authUser: FirebaseUser | null;
  firestoreUser: FirestoreUserType | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signUp: (name: string, email: string, pass: string) => Promise<void>;
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
        const usersRef = collection(db, 'users');
        let userDocSnapshot;
        const qUid = query(usersRef, where('uid', '==', user.uid));
        const uidSnapshot = await getDocs(qUid);

        if (!uidSnapshot.empty) {
          userDocSnapshot = uidSnapshot.docs[0];
        } else if (user.email) {
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
          // If user exists in Auth but not Firestore (e.g., just signed up),
          // and we expect a Firestore doc to be created by signUp, this state is temporary.
          // For existing users, this might indicate an issue or a new user whose Firestore doc creation is pending/failed.
          setFirestoreUser(null); 
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
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signUp = async (name: string, email: string, pass: string) => {
    setLoading(true);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      // Create Firestore document for the new user
      const newUserDoc: FirestoreUserType = {
        id: firebaseUser.uid, // Use Firebase UID as Firestore document ID for simplicity, or generate one
        uid: firebaseUser.uid,
        name: name,
        email: firebaseUser.email || undefined,
        role: 'student', // Default role for new sign-ups
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), newUserDoc);
      // onAuthStateChanged will handle setting authUser and firestoreUser, and redirection
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
  
  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname === '/login' || pathname === '/signup';
      if (!authUser && !isAuthPage) {
        router.push('/login');
      } else if (authUser && isAuthPage) {
        router.push('/dashboard');
      }
    }
  }, [authUser, loading, pathname, router]);

  return (
    <AuthContext.Provider value={{ authUser, firestoreUser, loading, signIn, signUp, signOut }}>
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
