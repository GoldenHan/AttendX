
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential, // Added for re-authentication
  EmailAuthProvider // Added for re-authentication
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
  reauthenticateCurrentUser: (password: string) => Promise<void>; // Added
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
            setFirestoreUser(null); 
          }
        } catch (error) {
          console.error("AuthContext: Error fetching user document from Firestore:", error);
          setFirestoreUser(null); 
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
    } catch (error) {
      setLoading(false); 
      throw error;
    }
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
      
      const newUserDocData: Omit<FirestoreUserType, 'id'> = { 
        uid: firebaseUser.uid,
        name: name,
        email: firebaseUser.email || undefined,
        role: role, 
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), newUserDocData);
    } catch (error) {
      setLoading(false); 
      throw error;
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      router.push('/login'); 
    } catch (error) {
      console.error('Sign out error', error);
    } finally {
      setLoading(false); 
    }
  };

  const reauthenticateCurrentUser = async (password: string) => {
    if (!authUser) {
      throw new Error("User not authenticated. Cannot re-authenticate.");
    }
    if (!authUser.email) {
      throw new Error("Authenticated user does not have an email. Cannot re-authenticate with email/password.");
    }
    const credential = EmailAuthProvider.credential(authUser.email, password);
    await reauthenticateWithCredential(authUser, credential);
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
    <AuthContext.Provider value={{ authUser, firestoreUser, loading, signIn, signUp, signOut, reauthenticateCurrentUser }}>
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
