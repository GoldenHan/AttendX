
'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
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
import type { User as FirestoreUserType, GradingConfiguration, ClassScheduleConfiguration, Sede, Institution, Group } from '@/types';
import { DEFAULT_GRADING_CONFIG, DEFAULT_CLASS_SCHEDULE_CONFIG, getDefaultStudentGradeStructure } from '@/types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  authUser: FirebaseUser | null;
  firestoreUser: FirestoreUserType | null;
  gradingConfig: GradingConfiguration;
  classScheduleConfig: ClassScheduleConfiguration; // Added
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
  fetchGradingConfigForInstitution: (institutionId: string) => Promise<GradingConfiguration>;
  fetchScheduleConfigForInstitution: (institutionId: string) => Promise<ClassScheduleConfiguration>; // Added
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [gradingConfig, setGradingConfig] = useState<GradingConfiguration>(DEFAULT_GRADING_CONFIG);
  const [classScheduleConfig, setClassScheduleConfig] = useState<ClassScheduleConfiguration>(DEFAULT_CLASS_SCHEDULE_CONFIG); // Added
  const router = useRouter();
  const pathname = usePathname();

  const fetchGradingConfigForInstitution = useCallback(async (institutionId: string): Promise<GradingConfiguration> => {
    if (!institutionId) {
      console.warn("[AuthContext] fetchGradingConfig: No institutionId provided, using default.");
      return DEFAULT_GRADING_CONFIG;
    }
    try {
      const configDocRef = doc(db, 'institutionGradingConfigs', institutionId);
      const docSnap = await getDoc(configDocRef);
      if (docSnap.exists()) {
        console.log(`[AuthContext] Fetched grading config for institution: ${institutionId}`);
        return docSnap.data() as GradingConfiguration;
      } else {
        console.log(`[AuthContext] No specific grading config for institution ${institutionId}, using default.`);
        return DEFAULT_GRADING_CONFIG;
      }
    } catch (error) {
      console.error(`[AuthContext] Error fetching grading configuration for institution ${institutionId}:`, error);
      return DEFAULT_GRADING_CONFIG;
    }
  }, []);

  const fetchScheduleConfigForInstitution = useCallback(async (institutionId: string): Promise<ClassScheduleConfiguration> => {
    if (!institutionId) {
      console.warn("[AuthContext] fetchScheduleConfig: No institutionId provided, using default.");
      return DEFAULT_CLASS_SCHEDULE_CONFIG;
    }
    try {
      const configDocRef = doc(db, 'institutionScheduleConfigs', institutionId);
      const docSnap = await getDoc(configDocRef);
      if (docSnap.exists()) {
        console.log(`[AuthContext] Fetched schedule config for institution: ${institutionId}`);
        return docSnap.data() as ClassScheduleConfiguration;
      } else {
        console.log(`[AuthContext] No specific schedule config for institution ${institutionId}, using default.`);
        return DEFAULT_CLASS_SCHEDULE_CONFIG;
      }
    } catch (error) {
      console.error(`[AuthContext] Error fetching schedule configuration for institution ${institutionId}:`, error);
      return DEFAULT_CLASS_SCHEDULE_CONFIG;
    }
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
          
          if (userData.institutionId) {
            const specificGradingConfig = await fetchGradingConfigForInstitution(userData.institutionId);
            setGradingConfig(specificGradingConfig);
            const specificScheduleConfig = await fetchScheduleConfigForInstitution(userData.institutionId); // Added
            setClassScheduleConfig(specificScheduleConfig); // Added
          } else {
            setGradingConfig(DEFAULT_GRADING_CONFIG);
            setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG); // Added
          }

        } else {
          console.warn(`[AuthContext] Firestore document not found in 'users' for authenticated user UID: ${user.uid}. Signing out.`);
          await firebaseSignOut(auth); 
          setAuthUser(null);
          setFirestoreUser(null);
          setGradingConfig(DEFAULT_GRADING_CONFIG);
          setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG); // Added
        }
      } else {
        setAuthUser(null);
        setFirestoreUser(null);
        setGradingConfig(DEFAULT_GRADING_CONFIG);
        setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG); // Added
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchGradingConfigForInstitution, fetchScheduleConfigForInstitution]); // Added fetchScheduleConfigForInstitution

  const signIn = async (identifier: string, pass: string) => {
    setLoading(true);

    console.log(`[AuthContext] Attempting sign in for identifier: ${identifier}`);
    try {
      // If identifier contains '@', assume it's an email and attempt direct login.
      if (identifier.includes('@')) {
        console.log(`[AuthContext] Identifier is an email. Proceeding directly with Firebase Auth.`);
        await signInWithEmailAndPassword(auth, identifier, pass);
        console.log(`[AuthContext] Firebase Auth successful for email: ${identifier}`);
        return; // Early return on success
      }

      // If no '@', assume it's a username. Query for all users with that username.
      console.log(`[AuthContext] Identifier is a username. Querying for matches.`);
      const usernameQuery = query(collection(db, 'users'), where('username', '==', identifier.trim()));
      const usernameSnapshot = await getDocs(usernameQuery);

      if (!usernameSnapshot.empty) {
        console.log(`[AuthContext] Found ${usernameSnapshot.size} user(s) with username "${identifier.trim()}".`);
        // Iterate through each user and try to sign in. This handles multiple institutions having the same username.
        for (const userDoc of usernameSnapshot.docs) {
          const userData = userDoc.data() as FirestoreUserType;
          if (userData.email) {
            try {
              console.log(`[AuthContext] Attempting login with associated email: ${userData.email}`);
              await signInWithEmailAndPassword(auth, userData.email, pass);
              // If we get here, login was successful.
              console.log(`[AuthContext] Login successful for user ${userData.username} from institution ${userData.institutionId}.`);
              return; // Exit function on first successful login.
            } catch (error: any) {
              // This is an expected failure if the password doesn't match this specific user account.
              if (error.code === 'auth/invalid-credential') {
                console.log(`[AuthContext] Password incorrect for ${userData.email}. Trying next match if available...`);
                continue; // Continue to the next user with the same username.
              } else {
                 // For any other error (e.g., network, etc.), we should stop and re-throw it.
                 throw error;
              }
            }
          } else {
            console.warn(`[AuthContext] User ${userData.username} found but has no email associated.`);
          }
        }
        // If the loop completes without a successful login, it means the password was wrong for all matching usernames.
        console.error(`[AuthContext] Password was incorrect for all users matching username "${identifier.trim()}".`);
        throw new Error('Nombre de usuario o contraseña incorrectos.');
      } else {
        // If the username is not found at all, we can throw a specific error.
        console.error(`[AuthContext] Username "${identifier.trim()}" not found in any institution.`);
        throw new Error('Nombre de usuario o contraseña incorrectos.');
      }
    } catch (error: any) {
      console.error(`[AuthContext] signIn error:`, error.code, error.message);
      setLoading(false);
      // Re-throw the original error or a more user-friendly one.
      // Let the calling component handle the UI feedback.
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
      let currentGradingConfigForNewUser = DEFAULT_GRADING_CONFIG;

      console.log(`[AuthContext] signUp: Role: ${role}, Institution Name: ${institutionName}, Creator Context Inst ID: ${creatorContext?.institutionId}`);

      if (role === 'admin' && institutionName && !effectiveInstitutionId) {
        console.log(`[AuthContext] Creating new institution: ${institutionName}`);
        const instNameQuery = query(collection(db, 'institutions'), where('name', '==', institutionName.trim()), limit(1));
        const instNameSnapshot = await getDocs(instNameQuery);
        if (!instNameSnapshot.empty) {
          throw new Error(`An institution named "${institutionName}" already exists.`);
        }
        const institutionRef = await addDoc(collection(db, 'institutions'), {
          name: institutionName,
          adminUids: [], 
          createdAt: new Date().toISOString(),
        });
        effectiveInstitutionId = institutionRef.id;
        console.log(`[AuthContext] New institution document created with ID: ${effectiveInstitutionId}`);
        await setDoc(doc(db, 'institutionGradingConfigs', effectiveInstitutionId), DEFAULT_GRADING_CONFIG);
        await setDoc(doc(db, 'institutionScheduleConfigs', effectiveInstitutionId), DEFAULT_CLASS_SCHEDULE_CONFIG); // Added
        currentGradingConfigForNewUser = DEFAULT_GRADING_CONFIG;

      } else if (effectiveInstitutionId) {
        currentGradingConfigForNewUser = await fetchGradingConfigForInstitution(effectiveInstitutionId);
      }


      if (!effectiveInstitutionId) {
        throw new Error("Institution ID is required to create a user.");
      }

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

      const emailQueryFirestore = query(collection(db, targetCollection),
          where('email', '==', email.trim()),
          where('institutionId', '==', effectiveInstitutionId),
          limit(1)
      );
      const emailSnapshotFirestore = await getDocs(emailQueryFirestore);
      if (!emailSnapshotFirestore.empty) {
          const error = new Error(`Email "${email.trim()}" is already registered to a user in this institution's records.`);
          (error as any).code = "auth/email-already-linked-to-institution"; 
          throw error;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, initialPasswordAsUsername);
      const firebaseUser = userCredential.user;

      if (role === 'admin' && institutionName && effectiveInstitutionId) {
          const institutionJustCreatedId = effectiveInstitutionId;
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
          gradesByLevel: studentSpecifics.level ? { [studentSpecifics.level]: getDefaultStudentGradeStructure(currentGradingConfigForNewUser) } : {},
          sedeId: studentSpecifics.sedeId || null,
          notes: undefined, age: undefined, gender: undefined, preferredShift: undefined,
        }),
        ...( (role === 'teacher' || role === 'supervisor' || role === 'admin' || role === 'caja') && creatorContext && {
            sedeId: creatorContext.creatorSedeId || null,
            attendanceCode: creatorContext.attendanceCode || null,
        })
      };
      
      await setDoc(doc(db, targetCollection, firebaseUser.uid), newUserDocData);
      console.log(`[AuthContext] User document created in '${targetCollection}' for UID: ${firebaseUser.uid} with Institution ID: ${newUserDocData.institutionId}`);

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
      setGradingConfig(DEFAULT_GRADING_CONFIG);
      setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG); // Added
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
      gradingConfig,
      classScheduleConfig, // Added
      loading,
      signIn,
      signUp,
      signOut,
      reauthenticateCurrentUser,
      updateUserPassword,
      clearRequiresPasswordChangeFlag,
      fetchGradingConfigForInstitution,
      fetchScheduleConfigForInstitution, // Added
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
