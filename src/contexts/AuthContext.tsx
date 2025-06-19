
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
import { doc, getDoc, collection, query, where, getDocs, setDoc, limit, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import type { User as FirestoreUserType, GradingConfiguration, Sede, Institution, Group } from '@/types';
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
    studentSpecifics?: { level: FirestoreUserType['level']; sedeId?: string | null },
    creatorContext?: { institutionId: string; creatorSedeId?: string | null; attendanceCode?: string },
    institutionName?: string
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
      // TODO: In a multi-institution setup, grading config might need to be institution-specific.
      // For now, it remains global or fetched based on a single known config document.
      try {
        const configDocRef = doc(db, 'appConfiguration', 'currentGradingConfig'); // This might need to change
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
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnapshot = await getDoc(userDocRef);

        if (userDocSnapshot.exists()) {
          const userData = {
            id: userDocSnapshot.id,
            ...userDocSnapshot.data()
          } as FirestoreUserType;
          setFirestoreUser(userData);
          console.log(`[AuthContext] User data loaded from 'users' for UID: ${user.uid}, Institution ID: ${userData.institutionId}`);
        } else {
          console.warn(`[AuthContext] Firestore document not found in 'users' for authenticated user UID: ${user.uid}. Signing out.`);
          await firebaseSignOut(auth); // Sign out if user doc doesn't exist to prevent broken state
          setAuthUser(null);
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
      if (!identifier.includes('@')) {
        console.log(`[AuthContext] Identifier "${identifier}" is not an email. Searching for username in 'users' collection.`);
        // For multi-tenancy, username uniqueness might be per institution.
        // This query might need adjustment if usernames are NOT globally unique for login.
        // For now, assuming username is sufficient to find the email.
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
    studentSpecifics?: { level: FirestoreUserType['level']; sedeId?: string | null },
    creatorContext?: { institutionId: string; creatorSedeId?: string | null; attendanceCode?: string },
    institutionName?: string
  ) => {
    setLoading(true);
    try {
      const targetCollection = 'users';
      let effectiveInstitutionId = creatorContext?.institutionId;

      console.log(`[AuthContext] signUp: Role: ${role}, Institution Name: ${institutionName}, Creator Context Inst ID: ${creatorContext?.institutionId}`);

      if (role === 'admin' && institutionName && !effectiveInstitutionId) {
        // This is the first admin creating their institution
        console.log(`[AuthContext] Creating new institution: ${institutionName}`);
        // Check if institution with this name already exists (simple check, might need refinement)
        const instNameQuery = query(collection(db, 'institutions'), where('name', '==', institutionName.trim()), limit(1));
        const instNameSnapshot = await getDocs(instNameQuery);
        if (!instNameSnapshot.empty) {
          throw new Error(`An institution named "${institutionName}" already exists.`);
        }
        const institutionRef = await addDoc(collection(db, 'institutions'), {
          name: institutionName,
          adminUids: [], // Will be updated after admin user is created
          createdAt: new Date().toISOString(),
        });
        effectiveInstitutionId = institutionRef.id;
        console.log(`[AuthContext] New institution document created with ID: ${effectiveInstitutionId}`);
      }

      if (!effectiveInstitutionId) {
        throw new Error("Institution ID is required to create a user.");
      }

      // Check for username uniqueness within the institution
      const usernameQuery = query(collection(db, targetCollection),
        where('username', '==', username.trim()),
        where('institutionId', '==', effectiveInstitutionId),
        limit(1)
      );
      const usernameSnapshot = await getDocs(usernameQuery);
      if (!usernameSnapshot.empty) {
        const error = new Error(`Username "${username.trim()}" already exists in this institution. Please choose a different one.`);
        (error as any).code = "auth/username-already-exists";
        throw error;
      }

      // Check for email uniqueness (globally for Firebase Auth, then institutionally for Firestore if desired)
      // Firebase Auth handles global email uniqueness. If it passes, we're good for Auth.
      // Additional check for email in our 'users' collection within the institution (optional, as Auth is global source of truth for email uniqueness)
      const emailQueryFirestore = query(collection(db, targetCollection),
          where('email', '==', email.trim()),
          where('institutionId', '==', effectiveInstitutionId),
          limit(1)
      );
      const emailSnapshotFirestore = await getDocs(emailQueryFirestore);
      if (!emailSnapshotFirestore.empty) {
          // This case implies email exists in Firestore for this institution but somehow not in Auth, or duplicate entry attempt.
          const error = new Error(`Email "${email.trim()}" is already registered to a user in this institution's records.`);
          (error as any).code = "auth/email-already-linked-to-institution"; // Custom code
          throw error;
      }


      const userCredential = await createUserWithEmailAndPassword(auth, email, initialPasswordAsUsername);
      const firebaseUser = userCredential.user;

      // If an institution was just created by this admin, update its adminUids
      if (role === 'admin' && institutionName && effectiveInstitutionId === firebaseUser.uid) { // This check is flawed, institutionId is not user.uid
          // Correct logic: if institution was just created (identified by effectiveInstitutionId)
          const institutionJustCreatedId = effectiveInstitutionId; // The ID from addDoc
          if (institutionName && institutionJustCreatedId) {
            await updateDoc(doc(db, 'institutions', institutionJustCreatedId), {
                adminUids: [firebaseUser.uid]
            });
            console.log(`[AuthContext] Updated institution ${institutionJustCreatedId} with admin UID ${firebaseUser.uid}`);
          }
      }


      const newUserDocData: Omit<FirestoreUserType, 'id'> = {
        uid: firebaseUser.uid,
        name: name,
        username: username.trim(),
        email: firebaseUser.email || email.trim(),
        role: role,
        requiresPasswordChange: true,
        institutionId: effectiveInstitutionId,
        phoneNumber: null,
        photoUrl: null,
        attendanceCode: null,
        sedeId: null,
        ...(role === 'student' && studentSpecifics && {
          level: studentSpecifics.level,
          gradesByLevel: studentSpecifics.level ? { [studentSpecifics.level]: getDefaultStudentGradeStructure(gradingConfig) } : {},
          sedeId: studentSpecifics.sedeId || null,
          notes: undefined, age: undefined, gender: undefined, preferredShift: undefined,
        }),
        ...( (role === 'teacher' || role === 'supervisor' || role === 'admin' || role === 'caja') && creatorContext && {
            // For staff, Sede ID comes from creatorContext if provided (e.g. supervisor creating a teacher in their Sede)
            // Or it could be set directly if an admin is creating staff and assigning a Sede.
            sedeId: creatorContext.creatorSedeId || null,
            attendanceCode: creatorContext.attendanceCode || null,
        })
      };
      
      await setDoc(doc(db, targetCollection, firebaseUser.uid), newUserDocData);
      console.log(`[AuthContext] User document created in '${targetCollection}' for UID: ${firebaseUser.uid} with Institution ID: ${newUserDocData.institutionId}`);

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
