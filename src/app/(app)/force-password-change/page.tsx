
'use client';

import React, { useState, useEffect } from 'react'; 
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, KeyRound, ShieldCheck } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { useRouter } from 'next/navigation';

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, { message: "Current password is required." }),
  newPassword: z.string().min(6, { message: "New password must be at least 6 characters." }),
  confirmNewPassword: z.string().min(6, { message: "Confirm new password must be at least 6 characters." }),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "New passwords do not match.",
  path: ["confirmNewPassword"],
});

type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;

export default function ForcePasswordChangePage() {
  const { authUser, firestoreUser, updateUserPassword, clearRequiresPasswordChangeFlag, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });


  // Redirect if password change is not required or user not loaded
  useEffect(() => {
    if (!authLoading && authUser && firestoreUser && !firestoreUser.requiresPasswordChange) {
      router.replace('/dashboard');
    }
    if (!authLoading && !authUser) {
        router.replace('/login');
    }
  }, [authUser, firestoreUser, authLoading, router]);


  const handleSubmitPasswordChange = async (data: PasswordChangeFormValues) => {
    if (!authUser) {
      toast({ title: 'Error', description: 'No user authenticated.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      await updateUserPassword(data.currentPassword, data.newPassword);
      await clearRequiresPasswordChangeFlag();
      toast({ title: 'Password Updated', description: 'Your password has been successfully updated. You can now access the application.' });
      router.push('/dashboard'); // Navigate to dashboard after successful change
    } catch (error: any) {
      console.error("Error updating password:", error);
      let errorMessage = 'Failed to update password.';
       if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'The current password you entered is incorrect.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'The new password is too weak.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'This operation is sensitive and requires recent authentication. Please log out and log back in, then try changing your password again.';
      }
      toast({ title: 'Password Update Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading || !firestoreUser) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }
  
  if (firestoreUser && !firestoreUser.requiresPasswordChange && authUser) {
     return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-6 w-6 text-green-500" />Password Secure</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Your password is up to date. No action required.</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => router.push('/dashboard')} className="w-full">Go to Dashboard</Button>
          </CardFooter>
        </Card>
      </div>
    );
  }


  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-gradient-to-br from-primary to-primary/70">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center">
          <KeyRound className="mx-auto h-12 w-12 text-primary mb-2" />
          <CardTitle>Update Your Password</CardTitle>
          <CardDescription>
            For security reasons, you must update your temporary password.
            Your current password is the username assigned to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmitPasswordChange)} className="space-y-6">
              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Current Password (Your Username)</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter your username" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Enter new password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmNewPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm New Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Confirm new password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" className="w-full" disabled={isSubmitting || authLoading}>
                {isSubmitting || authLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Update Password'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
