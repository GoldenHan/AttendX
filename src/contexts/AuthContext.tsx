
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
  GoogleAuthProvider,
  signInWithPopup,
  deleteUser,
} from 'firebase/auth';
import { doc, getDoc, collection, query, where, getDocs, setDoc, limit, updateDoc, addDoc, deleteDoc } from 'firebase/firestore';
import type { User as FirestoreUserType, GradingConfiguration, ClassScheduleConfiguration, Institution } from '@/types';
import { DEFAULT_GRADING_CONFIG, DEFAULT_CLASS_SCHEDULE_CONFIG, getDefaultStudentGradeStructure } from '@/types';
import { useRouter, usePathname } from 'next/navigation';

interface AuthContextType {
  authUser: FirebaseUser | null;
  firestoreUser: FirestoreUserType | null;
  institution: Institution | null;
  gradingConfig: GradingConfiguration;
  classScheduleConfig: ClassScheduleConfiguration; 
  loading: boolean;
  signIn: (email: string, pass: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (
    name: string,
    username: string,
    email: string,
    password: string,
    role: FirestoreUserType['role'],
    studentSpecifics?: { level: FirestoreUserType['level']; sedeId?: string | null },
    creatorContext?: { institutionId: string | null; creatorSedeId?: string | null; attendanceCode?: string },
    institutionName?: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
  reauthenticateCurrentUser: (password: string) => Promise<void>;
  updateUserPassword: (currentPasswordFromUser: string, newPasswordFromUser: string) => Promise<void>;
  clearRequiresPasswordChangeFlag: () => Promise<void>;
  fetchGradingConfigForInstitution: (institutionId: string) => Promise<GradingConfiguration>;
  fetchScheduleConfigForInstitution: (institutionId: string) => Promise<ClassScheduleConfiguration>; 
  refreshInstitutionData: () => Promise<Institution | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [firestoreUser, setFirestoreUser] = useState<FirestoreUserType | null>(null);
  const [institution, setInstitution] = useState<Institution | null>(null);
  const [loading, setLoading] = useState(true);
  const [gradingConfig, setGradingConfig] = useState<GradingConfiguration>(DEFAULT_GRADING_CONFIG);
  const [classScheduleConfig, setClassScheduleConfig] = useState<ClassScheduleConfiguration>(DEFAULT_CLASS_SCHEDULE_CONFIG); 
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
  
  const refreshInstitutionData = useCallback(async () => {
    if (firestoreUser?.institutionId) {
      const institutionDocRef = doc(db, 'institutions', firestoreUser.institutionId);
      const institutionDocSnap = await getDoc(institutionDocRef);
      if (institutionDocSnap.exists()) {
        const instData = { id: institutionDocSnap.id, ...institutionDocSnap.data() } as Institution;
        setInstitution(instData);
        return instData;
      }
    }
    setInstitution(null);
    return null;
  }, [firestoreUser?.institutionId]);


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
            const specificScheduleConfig = await fetchScheduleConfigForInstitution(userData.institutionId); 
            setClassScheduleConfig(specificScheduleConfig); 

            // Fetch institution details
            const institutionDocRef = doc(db, 'institutions', userData.institutionId);
            const institutionDocSnap = await getDoc(institutionDocRef);
            if (institutionDocSnap.exists()) {
              setInstitution({ id: institutionDocSnap.id, ...institutionDocSnap.data() } as Institution);
            } else {
              setInstitution(null);
              console.warn(`[AuthContext] Institution document not found for ID: ${userData.institutionId}`);
            }

          } else {
            setGradingConfig(DEFAULT_GRADING_CONFIG);
            setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG); 
            setInstitution(null);
          }

        } else {
          console.warn(`[AuthContext] Firestore document not found in 'users' for authenticated user UID: ${user.uid}. This may happen during a new sign-up flow. If not, it's an issue.`);
           if (pathname !== '/login') {
                console.warn(`[AuthContext] Signing out user ${user.uid} due to missing Firestore record.`);
                await firebaseSignOut(auth);
                setAuthUser(null);
                setFirestoreUser(null);
            }
        }
      } else {
        setAuthUser(null);
        setFirestoreUser(null);
        setInstitution(null);
        setGradingConfig(DEFAULT_GRADING_CONFIG);
        setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG); 
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [fetchGradingConfigForInstitution, fetchScheduleConfigForInstitution, pathname]);

  const signIn = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (error: any) {
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            throw new Error('El correo electrónico o la contraseña son incorrectos.');
        }
        // Re-throw other Firebase errors
        throw error;
    }
  };

  const signInWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      const usersRef = collection(db, 'users');
      const q = query(usersRef, where("email", "==", user.email), limit(1));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        await firebaseSignOut(auth);
        throw new Error("Tu cuenta de Google no está asociada con ningún usuario en el sistema. Contacta a un administrador.");
      }
      console.log(`[AuthContext] Google sign-in successful for existing user: ${user.email}`);

    } catch (error: any) {
      console.error("Error during Google sign-in:", error);
      throw error;
    }
  };

  const signUp = async (
    name: string,
    username: string,
    email: string,
    password: string,
    role: FirestoreUserType['role'],
    studentSpecifics?: { level: FirestoreUserType['level']; sedeId?: string | null },
    creatorContext?: { institutionId: string | null; creatorSedeId?: string | null; attendanceCode?: string },
    institutionName?: string
  ) => {
    setLoading(true);
    let firebaseUser: FirebaseUser | null = null;
    let userDocRefPath: string | null = null;

    try {
      // Step 1: Create the Firebase Auth user.
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      firebaseUser = userCredential.user;
      userDocRefPath = `users/${firebaseUser.uid}`;
      console.log(`[AuthContext] Step 1: Auth user created for ${email}.`);

      let effectiveInstitutionId: string | undefined;

      // Special flow for creating a new institution and its first admin.
      if (role === 'admin' && institutionName) {
        // Step 1.5: Create a "pending" user document. This allows security rules to pass for institution creation.
        const pendingUserDocData = {
          uid: firebaseUser.uid,
          name,
          username: username.trim(),
          email: firebaseUser.email || email.trim(),
          role: 'admin',
          requiresPasswordChange: true,
          institutionId: null, // Temporarily null
        };
        await setDoc(doc(db, userDocRefPath), pendingUserDocData);
        console.log(`[AuthContext] Step 1.5: Created pending user document.`);

        // Step 2: Create the institution document.
        const instNameQuery = query(collection(db, 'institutions'), where('name', '==', institutionName.trim()), limit(1));
        const instNameSnapshot = await getDocs(instNameQuery);
        if (!instNameSnapshot.empty) throw new Error(`An institution named "${institutionName}" already exists.`);

        const newInstitutionData: Omit<Institution, 'id'> = {
          name: institutionName, appName: institutionName, logoDataUrl: null,
          adminUids: [firebaseUser.uid], createdAt: new Date().toISOString(),
        };
        const institutionRef = await addDoc(collection(db, 'institutions'), newInstitutionData);
        effectiveInstitutionId = institutionRef.id;
        console.log(`[AuthContext] Step 2: Created institution doc with ID: ${effectiveInstitutionId}`);

        // Step 3: Update the user document with the new institution ID.
        await updateDoc(doc(db, userDocRefPath), { institutionId: effectiveInstitutionId });
        console.log(`[AuthContext] Step 3: Updated user doc with institution ID.`);

        // Step 4: Create configuration documents for the new institution.
        await setDoc(doc(db, 'institutionGradingConfigs', effectiveInstitutionId), DEFAULT_GRADING_CONFIG);
        await setDoc(doc(db, 'institutionScheduleConfigs', effectiveInstitutionId), DEFAULT_CLASS_SCHEDULE_CONFIG);
        console.log(`[AuthContext] Step 4: Created config documents.`);

      } else { // Standard flow for adding a user to an existing institution.
        effectiveInstitutionId = creatorContext?.institutionId || undefined;
        if (!effectiveInstitutionId) throw new Error("An Institution ID is required to add a new user.");

        const usernameQuery = query(collection(db, 'users'), where('username', '==', username.trim()), where('institutionId', '==', effectiveInstitutionId), limit(1));
        if (!(await getDocs(usernameQuery)).empty) throw new Error(`Username "${username.trim()}" already exists in this institution.`);

        const gradingConfigForNewUser = await fetchGradingConfigForInstitution(effectiveInstitutionId);
        const newUserDocData: Omit<FirestoreUserType, 'id'> = {
            uid: firebaseUser.uid, name, username: username.trim(), email: firebaseUser.email || email.trim(),
            role, requiresPasswordChange: true, institutionId: effectiveInstitutionId, phoneNumber: null,
            photoUrl: null, attendanceCode: null, sedeId: null,
            ...(role === 'student' && studentSpecifics && {
                level: studentSpecifics.level,
                gradesByLevel: studentSpecifics.level ? { [studentSpecifics.level]: getDefaultStudentGradeStructure(gradingConfigForNewUser) } : {},
                sedeId: studentSpecifics.sedeId || null,
            }),
            ...(role !== 'student' && creatorContext && {
                sedeId: creatorContext.creatorSedeId || null,
                attendanceCode: creatorContext.attendanceCode || null,
            })
        };
        await setDoc(doc(db, userDocRefPath), newUserDocData);
        console.log(`[AuthContext] User document created for UID: ${firebaseUser.uid}`);
      }
    } catch (error) {
      // Robust Rollback
      if (firebaseUser) {
        console.warn(`[AuthContext] Rolling back creation for ${firebaseUser.email} due to error.`);
        if (userDocRefPath) {
          await deleteDoc(doc(db, userDocRefPath)).catch(e => console.error("Failed to delete orphaned user doc:", e));
        }
        await deleteUser(firebaseUser).catch(e => console.error("CRITICAL: Failed to delete orphaned Auth user:", e));
        console.log("[AuthContext] Rollback complete.");
      }
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      await firebaseSignOut(auth);
      setAuthUser(null);
      setFirestoreUser(null);
      setInstitution(null);
      setGradingConfig(DEFAULT_GRADING_CONFIG);
      setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG); 
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
      institution,
      gradingConfig,
      classScheduleConfig, 
      loading,
      signIn,
      signInWithGoogle,
      signUp,
      signOut,
      reauthenticateCurrentUser,
      updateUserPassword,
      clearRequiresPasswordChangeFlag,
      fetchGradingConfigForInstitution,
      fetchScheduleConfigForInstitution, 
      refreshInstitutionData,
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
