
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
import { doc, getDoc, collection, query, where, getDocs, setDoc, limit } from 'firebase/firestore';
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
        // Prioritize UID match
        const userDocRef = doc(db, 'users', user.uid);
        const directUserDoc = await getDoc(userDocRef);

        if (directUserDoc.exists()) {
          userDocSnapshot = directUserDoc;
        } else if (user.email) { // Fallback to email match if UID doc not found (e.g., legacy data)
          const qEmail = query(usersRef, where('email', '==', user.email), limit(1));
          const emailSnapshot = await getDocs(qEmail);
          if (!emailSnapshot.empty) {
            userDocSnapshot = emailSnapshot.docs[0];
             // If found by email but UID is different or missing, consider updating UID in Firestore
             if (userDocSnapshot.data().uid !== user.uid) {
                console.warn(`Firestore user document ${userDocSnapshot.id} found by email but UID mismatch or missing. Auth UID: ${user.uid}. Firestore UID: ${userDocSnapshot.data().uid}`);
                // Optionally update the Firestore doc with the correct auth UID here if desired
             }
          }
        }
        
        if (userDocSnapshot && userDocSnapshot.exists()) {
          setFirestoreUser({ id: userDocSnapshot.id, ...userDocSnapshot.data() } as FirestoreUserType);
        } else {
          console.warn('No Firestore document found for user UID:', user.uid, 'or email:', user.email);
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
      // Check if any user already exists to determine if this is the first admin setup
      const usersQuery = query(collection(db, 'users'), limit(1));
      const existingUsersSnapshot = await getDocs(usersQuery);

      let role: FirestoreUserType['role'] = 'student'; // Default role

      if (existingUsersSnapshot.empty) {
        // No users exist, this is the first user, make them admin
        role = 'admin';
      } else {
        // Users already exist, block further public sign-ups
        setLoading(false);
        const error = new Error("Public registration is disabled. Admin already exists.");
        (error as any).code = "auth/public-registration-disabled";
        throw error;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      const newUserDoc: FirestoreUserType = {
        id: firebaseUser.uid, 
        uid: firebaseUser.uid,
        name: name,
        email: firebaseUser.email || undefined,
        role: role, 
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
