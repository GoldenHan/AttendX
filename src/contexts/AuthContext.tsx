
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
import type { User as FirestoreUserType, GradingConfiguration } from '@/types'; // Import GradingConfiguration
import { DEFAULT_GRADING_CONFIG, getDefaultStudentGradeStructure } from '@/types'; // Import defaults
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
    studentDetails?: { level: FirestoreUserType['level'] } // Optional student details for signup
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
      // Fetch grading config to be used by signUp if creating a student
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
        // All login-able users (staff and students) will be in the 'users' collection.
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnapshot = await getDoc(userDocRef);

        if (userDocSnapshot.exists()) {
          const userData = { id: userDocSnapshot.id, ...userDocSnapshot.data() } as FirestoreUserType;
          setFirestoreUser(userData);
        } else {
          console.warn(`Firestore document not found for authenticated user UID: ${user.uid} in 'users' collection.`);
          // This could happen if a user was deleted from Firestore but not from Auth, or during signup race conditions.
          // Or if a student logs in but their record is in 'students' collection (which we are moving away from for login-able students).
          setFirestoreUser(null);
          // Optionally sign out the user if their Firestore record is essential and missing
           await firebaseSignOut(auth); 
           setAuthUser(null);
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
        const usernameQuery = query(usersRef, where('username', '==', identifier.trim()), limit(1));
        const usernameSnapshot = await getDocs(usernameQuery);

        if (!usernameSnapshot.empty) {
          const userDoc = usernameSnapshot.docs[0].data() as FirestoreUserType;
          console.log(`[AuthContext] Found user document for username "${identifier.trim()}":`, userDoc);
          if (userDoc.email) {
            emailToAuth = userDoc.email;
            console.log(`[AuthContext] Using email "${emailToAuth}" for Firebase Auth.`);
          } else {
            console.error(`[AuthContext] User document for username "${identifier.trim()}" is missing an email field.`);
            throw new Error('El usuario no tiene un correo electrónico asociado. Contacta al administrador.');
          }
        } else {
          // No need to check 'students' collection anymore if all login-able students are in 'users'.
          console.error(`[AuthContext] Username "${identifier.trim()}" not found in 'users' collection.`);
          throw new Error('Nombre de usuario no encontrado.');
        }
      } else {
        console.log(`[AuthContext] Identifier "${identifier}" is an email. Proceeding directly with Firebase Auth.`);
      }
      await signInWithEmailAndPassword(auth, emailToAuth, pass);
      console.log(`[AuthContext] Firebase Auth successful for email: ${emailToAuth}`);
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
    studentDetails?: { level: FirestoreUserType['level'] }
  ) => {
    setLoading(true);
    try {
      // Check if username already exists in 'users' collection
      const usernameQueryUsers = query(collection(db, 'users'), where('username', '==', username.trim()), limit(1));
      const usernameSnapshotUsers = await getDocs(usernameQueryUsers);
      if (!usernameSnapshotUsers.empty) {
        const error = new Error("Username already exists. Please choose a different one.");
        (error as any).code = "auth/username-already-exists"; // Custom code for UI handling
        throw error;
      }
      
      // Check if email already exists in 'users' collection (for Auth check, Firebase handles actual Auth uniqueness)
      const emailQueryUsers = query(collection(db, 'users'), where('email', '==', email.trim()), limit(1));
      const emailSnapshotUsers = await getDocs(emailQueryUsers);
      if (!emailSnapshotUsers.empty) {
         // Firebase Auth will throw 'auth/email-already-in-use' if it truly exists in Auth.
         // This pre-check is for Firestore data consistency, but Auth is the source of truth for email uniqueness.
         console.warn(`[AuthContext] Email pre-check found '${email}' in Firestore 'users' collection. Firebase Auth will make final determination.`);
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, initialPasswordAsUsername);
      const firebaseUser = userCredential.user;

      const newUserDocData: Omit<FirestoreUserType, 'id'> = {
        uid: firebaseUser.uid,
        name: name,
        username: username.trim(),
        email: firebaseUser.email || email.trim(), // Use email from Auth if available
        role: role,
        requiresPasswordChange: true,
        // Initialize student-specific fields if role is student
        ...(role === 'student' && studentDetails?.level && {
          level: studentDetails.level,
          gradesByLevel: {
            [studentDetails.level]: getDefaultStudentGradeStructure(gradingConfig)
          },
          // Initialize other student fields to null/undefined or defaults
          phoneNumber: null,
          photoUrl: null,
          notes: null,
          age: undefined,
          gender: undefined,
          preferredShift: undefined,
        }),
        // Initialize staff-specific fields to null/undefined or defaults if not student
        ...(role !== 'student' && {
            attendanceCode: null, // Staff might have this, students don't
        })
      };
      // All users (staff and students) go into the 'users' collection, document ID is their UID.
      await setDoc(doc(db, 'users', firebaseUser.uid), newUserDocData);
      
      // Update local state immediately for a smoother UX, onAuthStateChanged will also fire.
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
      // All login-able users are in 'users' collection
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
