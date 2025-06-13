
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { auth, db } from '@/lib/firebase';
import type { User as FirebaseUser } from 'firebase/auth';
import { 
  onAuthStateChanged, 
  signInWithEmailAndPassword, 
  signOut as firebaseSignOut,
  createUserWithEmailAndPassword,
  reauthenticateWithCredential, 
  EmailAuthProvider 
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, limit } from 'firebase/firestore';
import type { User as FirestoreUserType } from '@/types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  authUser: FirebaseUser | null;
  firestoreUser: FirestoreUserType | null;
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>; // Stays as email for direct Firebase Auth
  signUp: (name: string, username: string, email: string, pass: string) => Promise<void>;
  signOut: () => Promise<void>;
  reauthenticateCurrentUser: (password: string) => Promise<void>;
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
        // Try fetching from 'users' collection first (for staff/auth accounts)
        let userDocRef = doc(db, 'users', user.uid);
        let userDocSnapshot = await getDoc(userDocRef);

        if (userDocSnapshot.exists()) {
          setFirestoreUser({ id: userDocSnapshot.id, ...userDocSnapshot.data() } as FirestoreUserType);
        } else {
          // If not in 'users', check 'students' collection (if students have auth uids)
          // This part might need adjustment depending on how student auth UIDs are stored if they differ
          // For now, assuming if a user is authenticated, their primary record is in 'users'
          userDocRef = doc(db, 'students', user.uid); // Fallback or specific check if students have UIDs here
          userDocSnapshot = await getDoc(userDocRef);
          if (userDocSnapshot.exists()) {
             setFirestoreUser({ id: userDocSnapshot.id, ...userDocSnapshot.data() } as FirestoreUserType);
          } else {
            console.warn(`Firestore document not found for authenticated user UID: ${user.uid} in 'users' or 'students'.`);
            setFirestoreUser(null); 
          }
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
      // Firestore user will be set by onAuthStateChanged
    } catch (error) {
      setLoading(false); 
      throw error;
    }
    // setLoading(false) is handled by onAuthStateChanged
  };

  const signUp = async (name: string, username: string, email: string, pass: string) => {
    setLoading(true);
    try {
      // Check for username uniqueness in 'users' collection
      const usernameQuery = query(collection(db, 'users'), where('username', '==', username), limit(1));
      const usernameSnapshot = await getDocs(usernameQuery);
      if (!usernameSnapshot.empty) {
        const error = new Error("Username already exists. Please choose a different one.");
        (error as any).code = "auth/username-already-exists"; // Custom code
        throw error;
      }

      const usersQuery = query(collection(db, 'users'), limit(1));
      const existingUsersSnapshot = await getDocs(usersQuery);
      let role: FirestoreUserType['role'] = 'student'; 
      if (existingUsersSnapshot.empty) {
        role = 'admin';
      } else {
        // Allow subsequent signups, default to 'student' or based on other logic if needed
        // For now, simple 'student' default after first admin
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const firebaseUser = userCredential.user;
      
      const newUserDocData: Omit<FirestoreUserType, 'id'> = { 
        uid: firebaseUser.uid,
        name: name,
        username: username,
        email: firebaseUser.email || email, // Ensure email is stored
        role: role, 
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), newUserDocData);
      // Firestore user will be set by onAuthStateChanged
    } catch (error) {
      setLoading(false); 
      throw error;
    }
     // setLoading(false) is handled by onAuthStateChanged
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
