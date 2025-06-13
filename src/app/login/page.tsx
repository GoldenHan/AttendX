
'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, LogIn, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function LoginPage() {
  const [identifier, setIdentifier] = useState(''); // Can be username 
  const [password, setPassword] = useState('');
  const { signIn, loading } = useAuth(); // signIn in context still expects email
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      toast({
        title: 'Error',
        description: 'Please enter both username and password.',
        variant: 'destructive',
      });
      return;
    }
    setIsSubmitting(true);
    try {
      // Attempt to find user by username in 'users' collection
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('username', '==', identifier), limit(1));
      const querySnapshot = await getDocs(q);

      let userEmail: string | null = null;

      if (!querySnapshot.empty) {
        const userDoc = querySnapshot.docs[0].data();
        if (userDoc.email) {
          userEmail = userDoc.email;
        } else {
          toast({
            title: 'Login Failed',
            description: 'User account is not properly configured (missing email). Please contact support.',
            variant: 'destructive',
          });
          setIsSubmitting(false);
          return;
        }
      } else {
         // Fallback: if not found by username, try if identifier itself is an email (for staff)
         // This allows staff to login with email if they don't have/use a username
         if (identifier.includes('@')) {
            userEmail = identifier;
         } else {
            toast({
                title: 'Login Failed',
                description: 'Username not found.',
                variant: 'destructive',
            });
            setIsSubmitting(false);
            return;
         }
      }

      await signIn(userEmail, password); // Use the retrieved/provided email to sign in
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
    } catch (error: any) {
      console.error("Login Page Error:", error); 
      let errorMessage = 'Failed to sign in. Please check your credentials or try again later.'; 

      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Invalid username or password.';
          break;
        case 'auth/invalid-email':
          // This might occur if the retrieved email is badly formatted, less likely if stored correctly
          errorMessage = 'The email associated with the username is badly formatted.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This user account has been disabled.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Sign-in method is not enabled. Please contact support.';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'A network error occurred. Please check your internet connection and try again.';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Access to this account has been temporarily disabled due to many failed login attempts. You can try again later or reset your password.';
          break;
        case 'auth/invalid-api-key':
           errorMessage = 'System configuration error. Please contact support. (Invalid API Key)';
           break;
        case 'auth/app-deleted':
            errorMessage = 'System configuration error. Please contact support. (App Deleted)';
            break;
        case 'auth/app-not-authorized':
            errorMessage = 'System configuration error. Please contact support. (App Not Authorized for domain)';
            break;
        case 'auth/visibility-check-was-unavailable':
            errorMessage = 'Could not verify app visibility. This might be a temporary issue or due to browser settings/extensions. Please try again. If it persists, try disabling browser extensions or check privacy settings.';
            break;
        default:
          console.warn("Unhandled Firebase Auth error code during login:", error.code, error.message);
          if (error.message && typeof error.message === 'string' && !error.message.includes('INTERNAL ASSERTION FAILED')) {
            errorMessage = error.message; 
          }
          break;
      }
      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentLoadingState = loading || isSubmitting;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center">
          <div className="mb-4 flex justify-center">
            <LogIn className="h-12 w-12 text-primary" />
          </div>
          <CardTitle className="text-3xl font-bold">SERVEX Login</CardTitle>
          <CardDescription>Access your attendance management dashboard.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="identifier">Username</Label>
              <Input
                id="identifier"
                type="text" 
                placeholder="Enter your username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                disabled={currentLoadingState}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={currentLoadingState}
              />
            </div>
            <Button type="submit" className="w-full" disabled={currentLoadingState}>
              {currentLoadingState ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-center text-sm">
           <p className="text-muted-foreground">Ensure you have an account before attempting to log in.</p>
           <div className="mt-4">
            <Button variant="outline" asChild>
              <Link href="/signup">
                <UserPlus className="mr-2 h-4 w-4" />
                Create an Account
              </Link>
            </Button>
           </div>
        </CardFooter>
      </Card>
    </div>
  );
}
