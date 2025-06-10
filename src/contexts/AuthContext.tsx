
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
      if (user) { // Firebase Auth user session exists/restored
        setAuthUser(user);
        const userDocRef = doc(db, 'users', user.uid);
        try {
          const userDocSnapshot = await getDoc(userDocRef);
          if (userDocSnapshot.exists()) {
            setFirestoreUser({ id: userDocSnapshot.id, ...userDocSnapshot.data() } as FirestoreUserType);
          } else {
            console.warn(`Firestore document not found for authenticated user UID: ${user.uid}. This user might need to complete profile setup or their Firestore document was not created/deleted.`);
            setFirestoreUser(null); // Important to set to null if doc not found
          }
        } catch (error) {
          console.error("AuthContext: Error fetching user document from Firestore:", error);
          // This could be a permission error too, or network.
          // If it's a permission error, it will be caught here.
          setFirestoreUser(null); // Ensure firestoreUser is null on error
          // Potentially sign out the user if their core data can't be fetched, or handle gracefully in UI.
          // For now, setting to null allows the app to proceed to login/signup if rules prevent reads.
        }
      } else { // No Firebase Auth user
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
      // onAuthStateChanged will handle fetching Firestore user and routing
    } catch (error) {
      setLoading(false); // Ensure loading is false on sign-in error
      throw error;
    }
    // setLoading(false) is handled by onAuthStateChanged's final setLoading(false)
  };

  const signUp = async (name: string, email: string, pass: string) => {
    setLoading(true);
    try {
      const usersQuery = query(collection(db, 'users'), limit(1));
      const existingUsersSnapshot = await getDocs(usersQuery);

      let role: FirestoreUserType['role'] = 'student'; 

      if (existingUsersSnapshot.empty) {
        role = 'admin';
      } else {
        setLoading(false);
        const error = new Error("Public registration is disabled. Admin already exists.");
        (error as any).code = "auth/public-registration-disabled";
        throw error;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      const newUserDocData: Omit<FirestoreUserType, 'id'> = { // FirestoreUserType expects id, but we use UID as doc ID
        uid: firebaseUser.uid,
        name: name,
        email: firebaseUser.email || undefined,
        role: role, 
      };
      // Set the document ID to be the Firebase Auth UID
      await setDoc(doc(db, 'users', firebaseUser.uid), newUserDocData);
      // onAuthStateChanged will handle setting authUser, firestoreUser, and redirection
    } catch (error) {
      setLoading(false); // Ensure loading is false on sign-up error
      throw error;
    }
     // setLoading(false) is handled by onAuthStateChanged's final setLoading(false)
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      // onAuthStateChanged will set authUser and firestoreUser to null
      router.push('/login'); // Explicitly redirect after sign out
    } catch (error) {
      console.error('Sign out error', error);
    } finally {
      // onAuthStateChanged will call setLoading(false)
      // but to be safe, especially if onAuthStateChanged doesn't fire quickly or an error occurs before it
      setLoading(false); 
    }
  };
  
  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname === '/login' || pathname === '/signup';
      if (!authUser && !isAuthPage) {
        router.push('/login');
      } else if (authUser && isAuthPage) {
        // If firestoreUser is still null here after authUser is set, it means fetching failed (e.g. permissions)
        // or the user doc doesn't exist. The console warning in onAuthStateChanged would have fired.
        // We proceed with redirecting to dashboard, the dashboard/layout should handle cases where firestoreUser is null.
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
