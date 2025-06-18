
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
        let userDocRef = doc(db, 'users', user.uid); // First, check 'users' collection
        let userDocSnapshot = await getDoc(userDocRef);
        let userDataFrom: 'users' | 'Admins' | null = null;

        if (userDocSnapshot.exists()) {
          userDataFrom = 'users';
        } else {
          // If not found in 'users', check 'Admins' collection
          userDocRef = doc(db, 'Admins', user.uid);
          userDocSnapshot = await getDoc(userDocRef);
          if (userDocSnapshot.exists()) {
            userDataFrom = 'Admins';
          }
        }

        if (userDataFrom && userDocSnapshot.exists()) {
          const userData = { 
            id: userDocSnapshot.id, 
            ...userDocSnapshot.data(),
            // _dataSource: userDataFrom // Optional: for debugging to know where it loaded from
          } as FirestoreUserType;
          setFirestoreUser(userData);
          console.log(`[AuthContext] User data loaded from '${userDataFrom}' for UID: ${user.uid}`);
        } else {
          console.warn(`[AuthContext] Firestore document not found for authenticated user UID: ${user.uid} in 'users' or 'Admins'.`);
          setFirestoreUser(null);
          // Optional: Consider signing out if Firestore record is crucial and missing.
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
    let userDocSource: 'users' | 'Admins' | undefined;

    console.log(`[AuthContext] Attempting sign in for identifier: ${identifier}`);
    try {
      if (!identifier.includes('@')) {
        console.log(`[AuthContext] Identifier "${identifier}" is not an email. Searching for username.`);
        // Try 'users' collection first for non-admin roles
        let usernameQuery = query(collection(db, 'users'), where('username', '==', identifier.trim()), limit(1));
        let usernameSnapshot = await getDocs(usernameQuery);

        if (!usernameSnapshot.empty) {
          userDocSource = 'users';
        } else {
          // If not in 'users', try 'Admins' collection
          console.log(`[AuthContext] Username not found in 'users', trying 'Admins'.`);
          usernameQuery = query(collection(db, 'Admins'), where('username', '==', identifier.trim()), limit(1));
          usernameSnapshot = await getDocs(usernameQuery);
          if (!usernameSnapshot.empty) {
            userDocSource = 'Admins';
          }
        }
        
        if (userDocSource && !usernameSnapshot.empty) {
          const userDoc = usernameSnapshot.docs[0].data() as FirestoreUserType;
          console.log(`[AuthContext] Found user document for username "${identifier.trim()}" in '${userDocSource}':`, userDoc);
          if (userDoc.email) {
            emailToAuth = userDoc.email;
            console.log(`[AuthContext] Using email "${emailToAuth}" from '${userDocSource}' for Firebase Auth.`);
          } else {
            console.error(`[AuthContext] User document from '${userDocSource}' for username "${identifier.trim()}" is missing an email field.`);
            throw new Error('El usuario no tiene un correo electrónico asociado. Contacta al administrador.');
          }
        } else {
          console.error(`[AuthContext] Username "${identifier.trim()}" not found in 'users' or 'Admins' collections.`);
          throw new Error('Nombre de usuario no encontrado.');
        }
      } else {
         console.log(`[AuthContext] Identifier "${identifier}" is an email. Proceeding directly with Firebase Auth.`);
      }
      
      await signInWithEmailAndPassword(auth, emailToAuth, pass);
      console.log(`[AuthContext] Firebase Auth successful for email: ${emailToAuth}`);
      // Firestore user will be set by onAuthStateChanged based on UID.
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
      const targetCollection = role === 'admin' ? 'Admins' : 'users';
      console.log(`[AuthContext] signUp: Attempting to create user in ${targetCollection} collection.`);

      const usernameQuery = query(collection(db, targetCollection), where('username', '==', username.trim()), limit(1));
      const usernameSnapshot = await getDocs(usernameQuery);
      if (!usernameSnapshot.empty) {
        const error = new Error("Username already exists in the target collection for this role. Please choose a different one.");
        (error as any).code = "auth/username-already-exists"; 
        throw error;
      }
      
      const userCredential = await createUserWithEmailAndPassword(auth, email, initialPasswordAsUsername);
      const firebaseUser = userCredential.user;

      const newUserDocData: Omit<FirestoreUserType, 'id'> = {
        uid: firebaseUser.uid,
        name: name,
        username: username.trim(),
        email: firebaseUser.email || email.trim(), 
        role: role,
        requiresPasswordChange: true,
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
      
      setAuthUser(firebaseUser);
      setFirestoreUser({ id: firebaseUser.uid, ...newUserDocData } as FirestoreUserType);

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
      // Determine the collection based on the firestoreUser's role
      const targetCollection = firestoreUser.role === 'admin' ? 'Admins' : 'users';
      const userDocRef = doc(db, targetCollection, authUser.uid);
      
      // Check if the document exists in the determined collection
      const docSnap = await getDoc(userDocRef);
      if (!docSnap.exists()) {
        // Fallback: if role indicates admin but doc not in Admins, or vice-versa
        // This can happen if the role in firestoreUser is stale or there's a data inconsistency
        console.warn(`[AuthContext] clearRequiresPasswordChangeFlag: Document for UID ${authUser.uid} not found in expected collection '${targetCollection}'. Checking alternative...`);
        const alternativeCollection = targetCollection === 'Admins' ? 'users' : 'Admins';
        const altUserDocRef = doc(db, alternativeCollection, authUser.uid);
        const altDocSnap = await getDoc(altUserDocRef);

        if (altDocSnap.exists()) {
          console.warn(`[AuthContext] Document found in '${alternativeCollection}'. Updating there.`);
          await updateDoc(altUserDocRef, { requiresPasswordChange: false });
        } else {
          throw new Error(`User document for ${authUser.uid} not found in '${targetCollection}' or '${alternativeCollection}'.`);
        }
      } else {
         await updateDoc(userDocRef, { requiresPasswordChange: false });
      }
      
      setFirestoreUser(prev => prev ? { ...prev, requiresPasswordChange: false } : null);
      console.log(`[AuthContext] Cleared requiresPasswordChange flag for user ${authUser.uid}.`);
    } catch (error) {
      console.error("[AuthContext] Error clearing requiresPasswordChange flag:", error);
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

