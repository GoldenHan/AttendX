
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
  }, [fetchGradingConfigForInstitution, fetchScheduleConfigForInstitution]);

  const signIn = async (identifier: string, pass: string) => {
    console.log(`[AuthContext] Attempting sign in for identifier: ${identifier}`);
    try {
        if (!identifier.includes('@')) {
            throw new Error('Please use your email address to log in. Usernames are not supported for login.');
        }
        await signInWithEmailAndPassword(auth, identifier, pass);
        console.log(`[AuthContext] Firebase Auth successful for email: ${identifier}`);
    } catch (error: any) {
        console.error(`[AuthContext] signIn error:`, error.code, error.message);
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            throw new Error('El correo electrónico o la contraseña son incorrectos.');
        }
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
    let firebaseUser: FirebaseUser | null = null;
    try {
      // Step 1: Create the user in Firebase Auth. This handles global email uniqueness.
      const userCredential = await createUserWithEmailAndPassword(auth, email, initialPasswordAsUsername);
      firebaseUser = userCredential.user;
      console.log(`[AuthContext] Step 1 complete: Firebase Auth user created for email ${email}`);

      let effectiveInstitutionId = creatorContext?.institutionId;

      // Step 2: If it's a new admin for a new institution, create the institution document.
      if (role === 'admin' && institutionName && !creatorContext?.institutionId) {
        const instNameQuery = query(collection(db, 'institutions'), where('name', '==', institutionName.trim()), limit(1));
        const instNameSnapshot = await getDocs(instNameQuery);
        if (!instNameSnapshot.empty) {
          throw new Error(`An institution named "${institutionName}" already exists.`);
        }
        
        const institutionRef = await addDoc(collection(db, 'institutions'), {
          name: institutionName,
          adminUids: [firebaseUser.uid],
          createdAt: new Date().toISOString(),
        });
        effectiveInstitutionId = institutionRef.id;
        console.log(`[AuthContext] New institution document created with ID: ${effectiveInstitutionId}`);
        
        await setDoc(doc(db, 'institutionGradingConfigs', effectiveInstitutionId), DEFAULT_GRADING_CONFIG);
        await setDoc(doc(db, 'institutionScheduleConfigs', effectiveInstitutionId), DEFAULT_CLASS_SCHEDULE_CONFIG);
      }
      
      if (!effectiveInstitutionId) {
        throw new Error("Institution ID could not be determined. User creation has been rolled back.");
      }

      // Step 3: Now that the user is authenticated and institution is known, check for institution-specific conflicts.
      const usernameQuery = query(collection(db, 'users'),
        where('username', '==', username.trim()),
        where('institutionId', '==', effectiveInstitutionId),
        limit(1)
      );
      const usernameSnapshot = await getDocs(usernameQuery);
      if (!usernameSnapshot.empty) {
          const error = new Error(`Username "${username.trim()}" already exists in this institution.`);
          (error as any).code = "auth/username-already-exists";
          throw error;
      }
      console.log(`[AuthContext] Step 2 complete: Username "${username}" is available in institution ${effectiveInstitutionId}.`);

      // Step 4: If no conflicts, create the user document in Firestore.
      const currentGradingConfigForNewUser = await fetchGradingConfigForInstitution(effectiveInstitutionId);

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
      
      await setDoc(doc(db, 'users', firebaseUser.uid), newUserDocData);
      console.log(`[AuthContext] Step 3 complete: User document created in 'users' for UID: ${firebaseUser.uid} with Institution ID: ${newUserDocData.institutionId}`);

    } catch (error) {
      // Rollback: If any step after auth user creation fails, delete the orphaned user.
      if (firebaseUser) {
        console.warn(`[AuthContext] Rolling back Auth user creation for ${firebaseUser.email} due to an error.`);
        await firebaseUser.delete().catch(deleteError => {
            console.error("[AuthContext] CRITICAL: Failed to clean up orphaned Firebase Auth user during rollback:", deleteError);
        });
        console.log(`[AuthContext] Rollback complete.`);
      }
      setLoading(false);
      throw error; // Re-throw the original error to be handled by the UI
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
