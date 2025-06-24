
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, User as UserIcon, KeyRound, Save } from 'lucide-react';
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
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

// Schema for profile details update
const profileFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  phoneNumber: z.string().optional().or(z.literal('')),
  photoUrl: z.string().url({ message: "Please enter a valid URL." }).optional().or(z.literal('')),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

// Schema for password change
const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, { message: "Current password is required." }),
  newPassword: z.string().min(6, { message: "New password must be at least 6 characters." }),
  confirmNewPassword: z.string(),
}).refine(data => data.newPassword === data.confirmNewPassword, {
  message: "New passwords do not match.",
  path: ["confirmNewPassword"],
});

type PasswordFormValues = z.infer<typeof passwordFormSchema>;


export default function ProfilePage() {
  const { firestoreUser, authUser, loading, updateUserPassword } = useAuth();
  const { toast } = useToast();
  
  const [isSubmittingProfile, setIsSubmittingProfile] = useState(false);
  const [isSubmittingPassword, setIsSubmittingPassword] = useState(false);

  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: '',
      phoneNumber: '',
      photoUrl: '',
    },
  });

  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmNewPassword: '',
    },
  });

  useEffect(() => {
    if (firestoreUser) {
      profileForm.reset({
        name: firestoreUser.name || '',
        phoneNumber: firestoreUser.phoneNumber || '',
        photoUrl: firestoreUser.photoUrl || '',
      });
    }
  }, [firestoreUser, profileForm]);

  const handleProfileUpdate = async (data: ProfileFormValues) => {
    if (!firestoreUser) {
      toast({ title: "Error", description: "No user data found.", variant: "destructive" });
      return;
    }
    setIsSubmittingProfile(true);
    try {
      const userDocRef = doc(db, 'users', firestoreUser.id);
      await updateDoc(userDocRef, {
        name: data.name,
        phoneNumber: data.phoneNumber || null,
        photoUrl: data.photoUrl || null,
      });
      toast({ title: "Profile Updated", description: "Your profile details have been saved." });
      // Note: AuthContext will re-fetch on next load, or we could manually update it here.
      // For now, we'll let it refresh naturally.
    } catch (error) {
      console.error("Error updating profile:", error);
      toast({ title: "Update Failed", description: "Could not save your profile changes.", variant: "destructive" });
    } finally {
      setIsSubmittingProfile(false);
    }
  };

  const handlePasswordUpdate = async (data: PasswordFormValues) => {
    setIsSubmittingPassword(true);
    try {
      await updateUserPassword(data.currentPassword, data.newPassword);
      toast({ title: "Password Updated", description: "Your password has been changed successfully." });
      passwordForm.reset();
    } catch (error: any) {
      console.error("Error updating password:", error);
       let errorMessage = 'Failed to update password.';
       if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        errorMessage = 'The current password you entered is incorrect.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'The new password is too weak.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'This operation requires recent authentication. Please log out and log back in, then try again.';
      }
      toast({ title: 'Password Update Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmittingPassword(false);
    }
  };

  if (loading || !firestoreUser) {
    return (
      <div className="flex justify-center items-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading profile...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
             <Avatar className="h-16 w-16">
                <AvatarImage src={firestoreUser.photoUrl || undefined} alt={firestoreUser.name} />
                <AvatarFallback className="text-xl">{firestoreUser.name?.charAt(0).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
                <CardTitle className="flex items-center gap-2">
                    <UserIcon className="h-6 w-6 text-primary" />
                    My Profile
                </CardTitle>
                <CardDescription>View and edit your personal information and password.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Form {...profileForm}>
            <form onSubmit={profileForm.handleSubmit(handleProfileUpdate)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormItem>
                  <FormLabel>Username (read-only)</FormLabel>
                  <FormControl><Input value={firestoreUser.username || 'N/A'} readOnly disabled /></FormControl>
                </FormItem>
                <FormItem>
                  <FormLabel>Email (read-only)</FormLabel>
                  <FormControl><Input value={firestoreUser.email || 'N/A'} readOnly disabled /></FormControl>
                </FormItem>
              </div>

              <FormField control={profileForm.control} name="name" render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl><Input placeholder="Your full name" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>

              <FormField control={profileForm.control} name="phoneNumber" render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number (Optional)</FormLabel>
                  <FormControl><Input type="tel" placeholder="Your phone number" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>

              <FormField control={profileForm.control} name="photoUrl" render={({ field }) => (
                <FormItem>
                  <FormLabel>Photo URL (Optional)</FormLabel>
                  <FormControl><Input type="url" placeholder="https://example.com/photo.png" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
              
              <CardFooter className="px-0 pt-6 pb-0">
                <Button type="submit" disabled={isSubmittingProfile}>
                  {isSubmittingProfile ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Profile Changes
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
            <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-6 w-6 text-primary" />
                Change Password
            </CardTitle>
            <CardDescription>Update your login password here. You will be logged out on other devices.</CardDescription>
        </CardHeader>
        <CardContent>
           <Form {...passwordForm}>
            <form onSubmit={passwordForm.handleSubmit(handlePasswordUpdate)} className="space-y-6">
               <FormField control={passwordForm.control} name="currentPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl><Input type="password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
               <FormField control={passwordForm.control} name="newPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl><Input type="password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
               <FormField control={passwordForm.control} name="confirmNewPassword" render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl><Input type="password" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}/>
               <CardFooter className="px-0 pt-6 pb-0">
                <Button type="submit" disabled={isSubmittingPassword}>
                  {isSubmittingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Update Password
                </Button>
              </CardFooter>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
