
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
  signIn: (identifier: string, pass: string) => Promise<void>; // Changed email to identifier
  signUp: (name: string, username: string, email: string, initialPasswordAsUsername: string, role: FirestoreUserType['role']) => Promise<void>; // Modified for new flow
  signOut: () => Promise<void>;
  reauthenticateCurrentUser: (password: string) => Promise<void>;
  updateUserPassword: (currentPasswordFromUser: string, newPasswordFromUser: string) => Promise<void>; // New function
  clearRequiresPasswordChangeFlag: () => Promise<void>; // New function
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
          // This case might happen if an Auth user exists but their Firestore doc was deleted or not created.
          // Or, if students also use Firebase Auth directly and their records are only in 'students'.
          // For simplicity, this starter assumes staff users are primarily in 'users'.
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
    try {
      if (!identifier.includes('@')) { // Assume it's a username
        const usersRef = collection(db, 'users');
        const usernameQuery = query(usersRef, where('username', '==', identifier.trim()), limit(1));
        const usernameSnapshot = await getDocs(usernameQuery);
        if (!usernameSnapshot.empty) {
          const userDoc = usernameSnapshot.docs[0].data();
          if (userDoc.email) {
            emailToAuth = userDoc.email;
          } else {
            throw new Error('User account does not have an associated email.');
          }
        } else {
          // Also check students collection if usernames could be there and distinct from 'users'
           const studentsRef = collection(db, 'students');
           const studentUsernameQuery = query(studentsRef, where('username', '==', identifier.trim()), limit(1));
           const studentUsernameSnapshot = await getDocs(studentUsernameQuery);
           if(!studentUsernameSnapshot.empty) {
             const studentDoc = studentUsernameSnapshot.docs[0].data();
             if(studentDoc.email) {
                emailToAuth = studentDoc.email;
             } else {
                throw new Error('Student account does not have an associated email.');
             }
           } else {
            throw new Error('Username not found.');
           }
        }
      }
      await signInWithEmailAndPassword(auth, emailToAuth, pass);
      // Firestore user will be set by onAuthStateChanged
    } catch (error) {
      setLoading(false);
      throw error;
    }
    // setLoading(false) is handled by onAuthStateChanged which also sets firestoreUser
  };

  // Modified signUp for username as initial password and requiresPasswordChange flag
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
      // Optionally, check username in 'students' too if they are distinct and can't overlap
      // For now, assuming staff usernames must be unique within 'users'

      const userCredential = await createUserWithEmailAndPassword(auth, email, initialPasswordAsUsername); // Use username as password
      const firebaseUser = userCredential.user;

      const newUserDocData: Omit<FirestoreUserType, 'id'> = {
        uid: firebaseUser.uid,
        name: name,
        username: username,
        email: firebaseUser.email || email,
        role: role,
        requiresPasswordChange: true, // Set the flag
      };
      await setDoc(doc(db, 'users', firebaseUser.uid), newUserDocData);
      // Firestore user will be set by onAuthStateChanged
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
    await reauthenticateCurrentUser(currentPasswordFromUser); // Re-authenticate first
    await firebaseUpdatePassword(authUser, newPasswordFromUser); // Then update
  };

  const clearRequiresPasswordChangeFlag = async () => {
    if (!authUser || !firestoreUser) throw new Error("No user or Firestore user data available.");
    try {
      const userDocRef = doc(db, 'users', authUser.uid);
      await updateDoc(userDocRef, {
        requiresPasswordChange: false, // or delete(field)
      });
      // Update local firestoreUser state
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
      } else if (!authUser && !isAuthPage && !isForcePasswordChangePage) { // ensure not to redirect from force-password-change if not auth'd
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
