
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
  EmailAuthProvider,
  updatePassword as firebaseUpdatePassword, // Import updatePassword
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, limit, updateDoc } from 'firebase/firestore';
import type { User as FirestoreUserType } from '@/types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  authUser: FirebaseUser | null;
  firestoreUser: FirestoreUserType | null;
  loading: boolean;
  signIn: (identifier: string, pass: string) => Promise<void>;
  signUp: (name: string, username: string, email: string, initialPasswordAsUsername: string, role: FirestoreUserType['role']) => Promise<void>;
  signOut: () => Promise<void>;
  reauthenticateCurrentUser: (password: string) => Promise<void>;
  updateUserPassword: (currentPasswordFromUser: string, newPasswordFromUser: string) => Promise<void>;
  clearRequiresPasswordChangeFlag: () => Promise<void>;
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
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnapshot = await getDoc(userDocRef);

        if (userDocSnapshot.exists()) {
          const userData = { id: userDocSnapshot.id, ...userDocSnapshot.data() } as FirestoreUserType;
          setFirestoreUser(userData);
        } else {
          console.warn(`Firestore document not found for authenticated user UID: ${user.uid} in 'users' collection.`);
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

  const signIn = async (identifier: string, pass: string) => {
    setLoading(true);
    let emailToAuth = identifier;
    console.log(`[AuthContext] Attempting sign in for identifier: ${identifier}`);
    try {
      if (!identifier.includes('@')) { // Assume it's a username
        console.log(`[AuthContext] Identifier "${identifier}" is not an email. Searching for username in 'users' collection.`);
        const usersRef = collection(db, 'users');
        // Ensure identifier.trim() is used if usernames might have leading/trailing spaces from input
        const usernameQuery = query(usersRef, where('username', '==', identifier.trim()), limit(1));
        const usernameSnapshot = await getDocs(usernameQuery);

        if (!usernameSnapshot.empty) {
          const userDoc = usernameSnapshot.docs[0].data();
          console.log(`[AuthContext] Found user document for username "${identifier.trim()}":`, userDoc);
          if (userDoc.email) {
            emailToAuth = userDoc.email;
            console.log(`[AuthContext] Using email "${emailToAuth}" for Firebase Auth.`);
          } else {
            console.error(`[AuthContext] User document for username "${identifier.trim()}" is missing an email field.`);
            throw new Error('El usuario no tiene un correo electrónico asociado. Contacta al administrador.');
          }
        } else {
           // Check students collection as a fallback if no staff user found with username
           console.log(`[AuthContext] Username "${identifier.trim()}" not found in 'users'. Checking 'students' collection.`);
           const studentsRef = collection(db, 'students');
           const studentUsernameQuery = query(studentsRef, where('username', '==', identifier.trim()), limit(1));
           const studentUsernameSnapshot = await getDocs(studentUsernameQuery);
           if(!studentUsernameSnapshot.empty) {
             const studentDoc = studentUsernameSnapshot.docs[0].data();
             console.log(`[AuthContext] Found student document for username "${identifier.trim()}":`, studentDoc);
             if(studentDoc.email) {
                emailToAuth = studentDoc.email;
                console.log(`[AuthContext] Using email "${emailToAuth}" from student record for Firebase Auth.`);
             } else {
                console.error(`[AuthContext] Student document for username "${identifier.trim()}" is missing an email field.`);
                throw new Error('El usuario (estudiante) no tiene un correo electrónico asociado. Contacta al administrador.');
             }
           } else {
            console.error(`[AuthContext] Username "${identifier.trim()}" not found in 'users' or 'students' collections.`);
            throw new Error('Nombre de usuario no encontrado.');
           }
        }
      } else {
        console.log(`[AuthContext] Identifier "${identifier}" is an email. Proceeding directly with Firebase Auth.`);
      }
      await signInWithEmailAndPassword(auth, emailToAuth, pass);
      console.log(`[AuthContext] Firebase Auth successful for email: ${emailToAuth}`);
      // Firestore user will be set by onAuthStateChanged
    } catch (error: any) {
      console.error(`[AuthContext] signIn error:`, error.code, error.message, error);
      setLoading(false);
      throw error;
    }
  };

  const signUp = async (name: string, username: string, email: string, initialPasswordAsUsername: string, role: FirestoreUserType['role']) => {
    setLoading(true);
    try {
      const usernameQueryUsers = query(collection(db, 'users'), where('username', '==', username), limit(1));
      const usernameSnapshotUsers = await getDocs(usernameQueryUsers);
      if (!usernameSnapshotUsers.empty) {
        const error = new Error("Username already exists in staff. Please choose a different one.");
        (error as any).code = "auth/username-already-exists";
        throw error;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, initialPasswordAsUsername);
      const firebaseUser = userCredential.user;

      const newUserDocData: Omit<FirestoreUserType, 'id'> = {
        uid: firebaseUser.uid,
        name: name,
        username: username,
        email: firebaseUser.email || email,
        role: role,
        requiresPasswordChange: true,
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
    if (!authUser) throw new Error("User not authenticated.");
    if (!authUser.email) throw new Error("Authenticated user does not have an email.");
    const credential = EmailAuthProvider.credential(authUser.email, password);
    await reauthenticateWithCredential(authUser, credential);
  };

  const updateUserPassword = async (currentPasswordFromUser: string, newPasswordFromUser: string) => {
    if (!authUser) throw new Error("No user is currently signed in.");
    await reauthenticateCurrentUser(currentPasswordFromUser);
    await firebaseUpdatePassword(authUser, newPasswordFromUser);
  };

  const clearRequiresPasswordChangeFlag = async () => {
    if (!authUser || !firestoreUser) throw new Error("No user or Firestore user data available.");
    try {
      const userDocRef = doc(db, 'users', authUser.uid);
      await updateDoc(userDocRef, {
        requiresPasswordChange: false,
      });
      setFirestoreUser(prev => prev ? { ...prev, requiresPasswordChange: false } : null);
    } catch (error) {
      console.error("Error clearing requiresPasswordChange flag:", error);
      throw error;
    }
  };

  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname === '/login' || pathname === '/signup';
      const isForcePasswordChangePage = pathname === '/force-password-change';

      if (authUser && firestoreUser?.requiresPasswordChange && !isForcePasswordChangePage) {
        router.push('/force-password-change');
      } else if (authUser && !firestoreUser?.requiresPasswordChange && (isAuthPage || isForcePasswordChangePage)) {
        router.push('/dashboard');
      } else if (!authUser && !isAuthPage && !isForcePasswordChangePage) {
        router.push('/login');
      }
    }
  }, [authUser, firestoreUser, loading, pathname, router]);

  return (
    <AuthContext.Provider value={{
      authUser,
      firestoreUser,
      loading,
      signIn,
      signUp,
      signOut,
      reauthenticateCurrentUser,
      updateUserPassword,
      clearRequiresPasswordChangeFlag
    }}>
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
