
'use server';
/**
 * @fileOverview Flow for administrators to create new users (Firebase Auth and Firestore).
 *
 * - createUserAccountFlow - Creates a Firebase Auth user and their Firestore document.
 * - CreateUserAccountInput - Input schema for the flow.
 * - CreateUserAccountOutput - Output schema for the flow.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import * as admin from 'firebase-admin';
// No need for 'firebase-admin/app' type if using default app behavior
import type { User } from '@/types';

// Initialize Firebase Admin SDK directly at the module scope
// This is the most standard way. If this fails, the issue is likely deeper.
if (!admin.apps.length) {
  try {
    admin.initializeApp();
    console.log("Firebase Admin SDK initialized successfully in user-admin-flow.ts");
  } catch (e: any) {
    console.error("CRITICAL: Firebase Admin SDK admin.initializeApp() FAILED in user-admin-flow.ts:", e);
    // Re-throwing the error is important so the failure is obvious.
    throw new Error(`Firebase Admin SDK initialization failed: ${e.message}. Check GOOGLE_APPLICATION_CREDENTIALS and server logs.`);
  }
} else {
  console.log("Firebase Admin SDK: App already initialized in user-admin-flow.ts.");
}

// Get Firestore and Auth instances.
// If admin.initializeApp() was called above, or if an app was already initialized,
// these calls will use the default app.
const firestore = admin.firestore();
const auth = admin.auth();

export const CreateUserAccountInputSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  email: z.string().email("Invalid email address."),
  password: z.string().min(6, "Password must be at least 6 characters."),
  role: z.enum(['student', 'teacher', 'admin', 'caja']),
  photoUrl: z.string().url().optional().or(z.literal('')),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Other']).optional(),
  notes: z.string().optional(),
  age: z.number().positive().int().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
});
export type CreateUserAccountInput = z.infer<typeof CreateUserAccountInputSchema>;

export const CreateUserAccountOutputSchema = z.object({
  userId: z.string().optional(),
  message: z.string(),
  success: z.boolean(),
});
export type CreateUserAccountOutput = z.infer<typeof CreateUserAccountOutputSchema>;


export async function createUserAccount(input: CreateUserAccountInput): Promise<CreateUserAccountOutput> {
  return createUserAccountFlow(input);
}

const createUserAccountFlow = ai.defineFlow(
  {
    name: 'createUserAccountFlow',
    inputSchema: CreateUserAccountInputSchema,
    outputSchema: CreateUserAccountOutputSchema,
  },
  async (input: CreateUserAccountInput): Promise<CreateUserAccountOutput> => {
    try {
      // Create Firebase Authentication user
      const userRecord = await auth.createUser({
        email: input.email,
        password: input.password,
        displayName: input.name,
        photoURL: input.photoUrl || undefined,
      });

      const userId = userRecord.uid;

      // Prepare Firestore document data
      const firestoreUserData: Omit<User, 'id'> = {
        uid: userId,
        name: input.name,
        email: input.email,
        role: input.role,
      };

      if (input.photoUrl) firestoreUserData.photoUrl = input.photoUrl;
      if (input.role === 'student') {
        if (input.level) firestoreUserData.level = input.level;
        if (input.notes) firestoreUserData.notes = input.notes;
        if (input.age) firestoreUserData.age = input.age;
        if (input.gender) firestoreUserData.gender = input.gender;
      }
      
      // Create Firestore user document with the Auth UID as document ID
      await firestore.collection('users').doc(userId).set(firestoreUserData);

      return {
        userId: userId,
        message: `User ${input.name} created successfully with ID: ${userId}.`,
        success: true,
      };
    } catch (error: any) {
      console.error('Error creating user account in flow:', error);
      // Provide a more specific error message if possible
      let message = 'Failed to create user account.';
      if (error.code === 'auth/email-already-exists') {
        message = 'The email address is already in use by another account.';
      } else if (error.code === 'auth/invalid-password') {
        message = 'The password must be a string with at least six characters.';
      } else if (error.message && error.message.includes("Must be invoked with service account credentials")) {
        message = "Firebase Admin SDK not initialized. Check service account credentials (GOOGLE_APPLICATION_CREDENTIALS).";
      } else if (error.message && error.message.includes("Firebase Admin SDK setup failed")) {
        // Propagate the initialization failure message
        message = error.message;
      }
      return {
        message: message,
        success: false,
      };
    }
  }
);
