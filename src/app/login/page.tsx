
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

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { signIn, loading } = useAuth();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: 'Error',
        description: 'Please enter both email and password.',
        variant: 'destructive',
      });
      return;
    }
    try {
      await signIn(email, password);
      // Navigation is handled by AuthProvider's useEffect
      toast({
        title: 'Login Successful',
        description: 'Welcome back!',
      });
    } catch (error: any) {
      console.error("Login Page Error:", error); // Log the full error for debugging
      let errorMessage = 'Failed to sign in. Please check your credentials or try again later.'; // Default generic message

      switch (error.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          errorMessage = 'Invalid email or password.';
          break;
        case 'auth/invalid-email':
          errorMessage = 'The email address is badly formatted.';
          break;
        case 'auth/user-disabled':
          errorMessage = 'This user account has been disabled.';
          break;
        case 'auth/operation-not-allowed':
          errorMessage = 'Email/password sign-in is not enabled. Please contact support.';
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
        default:
          // Keep the generic message for unhandled codes, or use error.message if it's user-friendly
          // For now, stick to our defined messages to avoid showing overly technical Firebase messages.
          // If error.message is preferred for unknown errors, it can be conditionally used here.
          console.warn("Unhandled Firebase Auth error code during login:", error.code);
          break;
      }

      toast({
        title: 'Login Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@servex.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
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
                disabled={loading}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
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
