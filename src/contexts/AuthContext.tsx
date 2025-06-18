
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
  updatePassword as firebaseUpdatePassword, 
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, limit, updateDoc } from 'firebase/firestore';
import type { User as FirestoreUserType, GradingConfiguration, Sede } from '@/types';
import { DEFAULT_GRADING_CONFIG, getDefaultStudentGradeStructure } from '@/types'; 
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  authUser: FirebaseUser | null;
  firestoreUser: FirestoreUserType | null;
  loading: boolean;
  signIn: (identifier: string, pass: string) => Promise<void>;
  signUp: (
    name: string, 
    username: string, 
    email: string, 
    initialPasswordAsUsername: string, 
    role: FirestoreUserType['role'],
    studentDetails?: { level: FirestoreUserType['level'] },
    staffDetails?: Partial<Pick<FirestoreUserType, 'sedeId' | 'attendanceCode'>>
  ) => Promise<void>;
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
  const [gradingConfig, setGradingConfig] = useState<GradingConfiguration>(DEFAULT_GRADING_CONFIG);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const fetchGradingConfig = async () => {
      try {
        const configDocRef = doc(db, 'appConfiguration', 'currentGradingConfig');
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          setGradingConfig(docSnap.data() as GradingConfiguration);
        } else {
          setGradingConfig(DEFAULT_GRADING_CONFIG);
        }
      } catch (error) {
        console.error("Error fetching grading configuration for AuthContext:", error);
        setGradingConfig(DEFAULT_GRADING_CONFIG);
      }
    };
    fetchGradingConfig();
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setLoading(true);
      if (user) {
        setAuthUser(user);
        // All users (students, teachers, admins, etc.) are in the 'users' collection
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnapshot = await getDoc(userDocRef);

        if (userDocSnapshot.exists()) {
          const userData = { 
            id: userDocSnapshot.id, 
            ...userDocSnapshot.data() 
          } as FirestoreUserType;
          setFirestoreUser(userData);
          console.log(`[AuthContext] User data loaded from 'users' for UID: ${user.uid}`);
        } else {
          console.warn(`[AuthContext] Firestore document not found in 'users' for authenticated user UID: ${user.uid}. This may happen if the user was deleted from Firestore but not Auth, or if the user is new and the Firestore doc creation is pending or failed.`);
          setFirestoreUser(null);
          // Optional: Sign out if Firestore record is crucial for app functionality.
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

  const signIn = async (identifier: string, pass: string) => {
    setLoading(true);
    let emailToAuth = identifier;

    console.log(`[AuthContext] Attempting sign in for identifier: ${identifier}`);
    try {
      if (!identifier.includes('@')) {
        console.log(`[AuthContext] Identifier "${identifier}" is not an email. Searching for username in 'users' collection.`);
        // All users, including admins, are in the 'users' collection.
        const usernameQuery = query(collection(db, 'users'), where('username', '==', identifier.trim()), limit(1));
        const usernameSnapshot = await getDocs(usernameQuery);
        
        if (!usernameSnapshot.empty) {
          const userDoc = usernameSnapshot.docs[0].data() as FirestoreUserType;
          console.log(`[AuthContext] Found user document for username "${identifier.trim()}" in 'users':`, userDoc);
          if (userDoc.email) {
            emailToAuth = userDoc.email;
            console.log(`[AuthContext] Using email "${emailToAuth}" from 'users' for Firebase Auth.`);
          } else {
            console.error(`[AuthContext] User document from 'users' for username "${identifier.trim()}" is missing an email field.`);
            // Distinguish error message if role is student
            throw new Error(userDoc.role === 'student' ? 'El usuario (estudiante) no tiene un correo electrónico asociado. Contacta al administrador.' : 'El usuario no tiene un correo electrónico asociado. Contacta al administrador.');
          }
        } else {
          console.error(`[AuthContext] Username "${identifier.trim()}" not found in 'users' collection.`);
          throw new Error('Nombre de usuario no encontrado.');
        }
      } else {
         console.log(`[AuthContext] Identifier "${identifier}" is an email. Proceeding directly with Firebase Auth.`);
      }
      
      await signInWithEmailAndPassword(auth, emailToAuth, pass);
      console.log(`[AuthContext] Firebase Auth successful for email: ${emailToAuth}`);
      // Firestore user will be set by onAuthStateChanged.
    } catch (error: any) {
      console.error(`[AuthContext] signIn error:`, error.code, error.message, error);
      setLoading(false);
      throw error;
    }
  };

  const signUp = async (
    name: string, 
    username: string, 
    email: string, 
    initialPasswordAsUsername: string, 
    role: FirestoreUserType['role'],
    studentDetails?: { level: FirestoreUserType['level'] },
    staffDetails?: Partial<Pick<FirestoreUserType, 'sedeId' | 'attendanceCode'>>
  ) => {
    setLoading(true);
    try {
      // All users, including admins, are stored in the 'users' collection.
      const targetCollection = 'users';
      console.log(`[AuthContext] signUp: Attempting to create user in '${targetCollection}' collection.`);

      const usernameQuery = query(collection(db, targetCollection), where('username', '==', username.trim()), limit(1));
      const usernameSnapshot = await getDocs(usernameQuery);
      if (!usernameSnapshot.empty) {
        const error = new Error("Username already exists in the 'users' collection. Please choose a different one.");
        (error as any).code = "auth/username-already-exists"; // Custom code for easier handling
        throw error;
      }
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, initialPasswordAsUsername);
      const firebaseUser = userCredential.user;

      const newUserDocData: Omit<FirestoreUserType, 'id'> = {
        uid: firebaseUser.uid,
        name: name,
        username: username.trim(),
        email: firebaseUser.email || email.trim(), // Ensure email is stored
        role: role,
        requiresPasswordChange: true, // All new users must change their password
        ...(role === 'student' && studentDetails?.level && {
          level: studentDetails.level,
          gradesByLevel: {
            [studentDetails.level]: getDefaultStudentGradeStructure(gradingConfig)
          },
          phoneNumber: null, photoUrl: null, notes: null, age: undefined, gender: undefined, preferredShift: undefined,
        }),
        ...( (role === 'teacher' || role === 'supervisor' || role === 'admin') && staffDetails && {
            sedeId: staffDetails.sedeId || null,
            attendanceCode: staffDetails.attendanceCode || null,
        })
      };
      
      await setDoc(doc(db, targetCollection, firebaseUser.uid), newUserDocData);
      console.log(`[AuthContext] User document created in '${targetCollection}' for UID: ${firebaseUser.uid}`);
      
      // Set authUser and firestoreUser immediately after successful creation
      setAuthUser(firebaseUser);
      setFirestoreUser({ id: firebaseUser.uid, ...newUserDocData } as FirestoreUserType);

    } catch (error) {
      setLoading(false); // Ensure loading is set to false on error
      throw error;
    }
    // setLoading(false); // Moved to finally or error block if needed consistently
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
      // Potentially set an error state here
    } finally {
      setLoading(false);
    }
  };

  const reauthenticateCurrentUser = async (password: string) => {
    if (!authUser) throw new Error("User not authenticated.");
    if (!authUser.email) throw new Error("Authenticated user does not have an email."); // Should not happen if user is auth'd
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
      // All users are in the 'users' collection
      const userDocRef = doc(db, 'users', authUser.uid);
      
      const docSnap = await getDoc(userDocRef);
      if (!docSnap.exists()) {
        throw new Error(`User document for ${authUser.uid} not found in 'users' collection when trying to clear password change flag.`);
      }
      
      await updateDoc(userDocRef, { requiresPasswordChange: false });
      
      setFirestoreUser(prev => prev ? { ...prev, requiresPasswordChange: false } : null);
      console.log(`[AuthContext] Cleared requiresPasswordChange flag for user ${authUser.uid} in 'users' collection.`);
    } catch (error) {
      console.error("[AuthContext] Error clearing requiresPasswordChange flag:", error);
      throw error;
    }
  };

  // Effect for routing logic based on auth state
  useEffect(() => {
    if (!loading) {
      const isAuthPage = pathname === '/login' || pathname === '/signup'; // Assuming /signup might still be accessible
      const isForcePasswordChangePage = pathname === '/force-password-change';

      if (authUser && firestoreUser?.requiresPasswordChange && !isForcePasswordChangePage) {
        router.push('/force-password-change');
      } else if (authUser && !firestoreUser?.requiresPasswordChange && (isAuthPage || isForcePasswordChangePage)) {
        // If user is logged in, doesn't need password change, but is on an auth page or force change page, redirect
        router.push('/dashboard');
      } else if (!authUser && !isAuthPage && !isForcePasswordChangePage) {
        // If user is not logged in and not on an auth/force-change page, redirect to login
        router.push('/login');
      }
      // No else needed: if conditions not met, user stays on current page (e.g. authenticated on dashboard, or unauthenticated on login)
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
