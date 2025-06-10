
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
import type { User } from '@/types';

// Initialize Firebase Admin SDK.
// This code runs when the module is first loaded.
if (!admin.apps.length) {
  try {
    admin.initializeApp();
    // console.log("Firebase Admin SDK initialized successfully in user-admin-flow.ts"); // Removed for cleaner error path
  } catch (e: any) {
    // Log the detailed error server-side for more context
    console.error("CRITICAL: Firebase Admin SDK admin.initializeApp() FAILED in user-admin-flow.ts. Original error object:", e);
    // Re-throwing a new error that includes the original message.
    // The e.message from firebase-admin is "Cannot read properties of undefined (reading 'INTERNAL')"
    throw new Error(
      `Firebase Admin SDK's admin.initializeApp() threw an internal error. Original message: "${e.message}". This often indicates an issue with the Admin SDK in the current server environment (e.g., gRPC native modules handling by the bundler) or missing/misconfigured credentials (GOOGLE_APPLICATION_CREDENTIALS). Check server logs for the full error details from firebase-admin.`
    );
  }
} else {
  // console.log("Firebase Admin SDK: App already initialized in user-admin-flow.ts."); // Removed for cleaner logs
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
      } else if (error.message && error.message.includes("Firebase Admin SDK admin.initializeApp() threw an internal error")) {
        // Propagate the initialization failure message
        message = error.message;
      } else if (error.message && error.message.includes("Must be invoked with service account credentials")) {
         message = "Firebase Admin SDK not initialized. Check service account credentials (GOOGLE_APPLICATION_CREDENTIALS).";
      }
      return {
        message: message,
        success: false,
      };
    }
  }
);
