
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Pencil, Trash2, UserPlus, FolderKanban, Briefcase, KeyRound, MailIcon, AlertTriangle } from 'lucide-react';
import type { User, Group } from '@/types';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, query, where, writeBatch, limit } from 'firebase/firestore'; // Removed addDoc as signUp in AuthContext handles it
import { sendPasswordResetEmail } from 'firebase/auth';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription as DialogPrimitiveDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Label } from "@/components/ui/label";

const staffFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  username: z.string().min(3, "Username must be at least 3 characters.").regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, underscores, or hyphens."),
  email: z.string().email({ message: "Invalid email address." }), // Email is now required for Firebase Auth
  phoneNumber: z.string().optional().or(z.literal('')),
  role: z.enum(['teacher', 'admin', 'caja'], { required_error: "Role is required." }),
  photoUrl: z.string().url({ message: "Please enter a valid URL for photo." }).optional().or(z.literal('')),
  assignedGroupId: z.string().optional(),
  attendanceCode: z.string().min(4, "Code must be at least 4 characters.").max(20, "Code cannot exceed 20 characters.").optional().or(z.literal('')),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

const UNASSIGN_VALUE_KEY = "##UNASSIGNED##";

// Debounce function
function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<F>): Promise<ReturnType<F>> =>
    new Promise((resolve) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      timeoutId = setTimeout(() => resolve(func(...args)), waitFor);
    });
}

export default function StaffManagementPage() {
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingResetEmail, setIsSendingResetEmail] = useState<string | null>(null);

  const [isStaffFormDialogOpen, setIsStaffFormDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<User | null>(null);

  const [isDeleteStaffDialogOpen, setIsDeleteStaffDialogOpen] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState<User | null>(null);
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');

  const [emailCheckStatus, setEmailCheckStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found' | 'error'>('idle');
  const [emailCheckMessage, setEmailCheckMessage] = useState<string | null>(null);

  const { toast } = useToast();
  const { reauthenticateCurrentUser, authUser, signUp: signUpUser } = useAuth(); // Destructure signUpUser from useAuth

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: '',
      username: '',
      email: '',
      phoneNumber: '',
      role: 'teacher',
      photoUrl: '',
      assignedGroupId: undefined,
      attendanceCode: '',
    },
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const staffRoles: User['role'][] = ['admin', 'teacher', 'caja'];
      const usersQuery = query(collection(db, 'users'), where('role', 'in', staffRoles));
      const usersSnapshot = await getDocs(usersQuery);
      setStaffUsers(usersSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));

      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setAllGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load staff users or groups.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const checkEmailExistence = useCallback(async (email: string) => {
    try {
      // Check in 'users' collection (where staff are stored)
      const q = query(collection(db, 'users'), where('email', '==', email.trim()), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setEmailCheckStatus('exists');
        setEmailCheckMessage('An account with this email already exists in Firestore (Staff).');
      } else {
        // Optionally check 'students' or rely on Firebase Auth for ultimate check during signUp
        setEmailCheckStatus('not_found');
        setEmailCheckMessage('No staff account found with this email in Firestore. Email seems available for a new staff member.');
      }
    } catch (error) {
      console.error("Error checking email existence:", error);
      setEmailCheckStatus('error');
      setEmailCheckMessage('Error verifying email. Please try again.');
    }
  }, []);


  const debouncedCheckEmail = useMemo(() => debounce(checkEmailExistence, 700), [checkEmailExistence]);

  const resetEmailCheck = useCallback(() => {
    setEmailCheckStatus('idle');
    setEmailCheckMessage(null);
  }, []);

  const handleOpenAddDialog = () => {
    setEditingStaff(null);
    form.reset({
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '',
    });
    resetEmailCheck();
    setIsStaffFormDialogOpen(true);
  };

  const handleOpenEditDialog = (staffToEdit: User) => {
    setEditingStaff(staffToEdit);
    const currentGroupAssignment = allGroups.find(g => g.teacherId === staffToEdit.id);
    form.reset({
      name: staffToEdit.name,
      username: staffToEdit.username || '',
      email: staffToEdit.email || '',
      phoneNumber: staffToEdit.phoneNumber || '',
      role: staffToEdit.role as 'teacher' | 'admin' | 'caja',
      photoUrl: staffToEdit.photoUrl || '',
      assignedGroupId: currentGroupAssignment ? currentGroupAssignment.id : undefined,
      attendanceCode: staffToEdit.attendanceCode || '',
    });
    resetEmailCheck();
    if (staffToEdit.email) {
      setEmailCheckStatus('checking');
      setEmailCheckMessage('Verifying email...');
      debouncedCheckEmail(staffToEdit.email);
    }
    setIsStaffFormDialogOpen(true);
  };

  const handleStaffFormSubmit = async (data: StaffFormValues) => {
    setIsSubmitting(true);

    if (!data.email && !editingStaff) { // Email is required for new Firebase Auth accounts
        toast({ title: 'Email Required', description: 'Email is required to create a new staff user login.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }
    if (!data.username && !editingStaff) {
        toast({ title: 'Username Required', description: 'Username is required for the initial password.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }


    const firestoreUserData: Partial<User> = {
      name: data.name,
      username: data.username || null, // username is required for new, handled by schema
      email: data.email || null, // email is required for new, handled by schema
      phoneNumber: data.phoneNumber || null,
      role: data.role,
      photoUrl: data.photoUrl || null,
      attendanceCode: (data.role === 'teacher' || data.role === 'admin') ? (data.attendanceCode || null) : null,
    };

    let staffMemberId: string | undefined = editingStaff?.id;

    try {
      if (editingStaff) { // Editing existing staff
        const staffRef = doc(db, 'users', editingStaff.id);
        // For existing users, email and username changes only affect Firestore data, not Firebase Auth directly here.
        // Password management for existing users is via "Reset Password".
        await updateDoc(staffRef, firestoreUserData);
        toast({ title: 'Staff User Updated', description: `${data.name}'s record updated successfully.` });
      } else { // Creating new staff
        // signUpUser will handle Firebase Auth creation + Firestore doc creation with requiresPasswordChange: true
        // It uses username as initial password
        if (!data.username || !data.email) { // Should be caught by form validation, but double check
            toast({ title: 'Error', description: 'Username and Email are required for new staff.', variant: 'destructive'});
            setIsSubmitting(false);
            return;
        }
        await signUpUser(data.name, data.username, data.email, data.username, data.role); // Pass username as initial password
        // The AuthContext's signUpUser will create the Firestore doc. We get the ID after successful creation.
        // We need to re-fetch or find the new user's ID if we need to assign group immediately.
        // For simplicity, we'll rely on fetchData() to refresh the list, group assignment happens on next edit if needed or manually.
        // Alternatively, signUpUser could return the new user's ID.
        // For now, group assignment for brand new users will be a separate step if done immediately after creation.
        toast({
          title: 'Staff User Record Added',
          description: `${data.name} added. They can log in with username: ${data.username} (as password) and will be prompted to change it.`
        });
      }

      // Group assignment logic (common for new and edit)
      // This needs the staffMemberId. If new, we might not have it yet unless signUpUser returns it or we query.
      // For now, let's assume staffMemberId is available for editing and for new users, group assignment can be a subsequent edit.
      // To make group assignment work for NEW users in this same step, signUpUser in AuthContext would need to return the new user's UID.
      // Let's adjust assuming we have staffMemberId for editing cases, or it's a post-creation step for new.

      if (staffMemberId && (data.role === 'teacher' || data.role === 'admin')) {
        const newlySelectedGroupId = data.assignedGroupId === UNASSIGN_VALUE_KEY ? null : data.assignedGroupId || null;
        const previouslyAssignedGroup = allGroups.find(g => g.teacherId === staffMemberId);
        const previouslyAssignedGroupId = previouslyAssignedGroup ? previouslyAssignedGroup.id : null;

        if (newlySelectedGroupId !== previouslyAssignedGroupId) {
          const batch = writeBatch(db);
          if (previouslyAssignedGroupId) {
            const oldGroupRef = doc(db, 'groups', previouslyAssignedGroupId);
            batch.update(oldGroupRef, { teacherId: null });
          }
          if (newlySelectedGroupId) {
            const newGroupRef = doc(db, 'groups', newlySelectedGroupId);
            const groupDoc = allGroups.find(g => g.id === newlySelectedGroupId);
            if(groupDoc && groupDoc.teacherId && groupDoc.teacherId !== staffMemberId) {
                 toast({
                    title: 'Group Reassignment',
                    description: `Group ${groupDoc.name} was previously assigned to another teacher. It's now assigned to ${data.name}.`,
                    variant: 'default'
                });
            }
            batch.update(newGroupRef, { teacherId: staffMemberId });
          }
          await batch.commit();
          toast({ title: 'Group Assignment Updated', description: `${data.name}'s group assignment has been updated.` });
        }
      } else if (staffMemberId && data.role !== 'teacher' && data.role !== 'admin') { // Unassign if role changed away from teacher/admin
        const previouslyAssignedGroup = allGroups.find(g => g.teacherId === staffMemberId);
        if (previouslyAssignedGroup) {
          const groupRef = doc(db, 'groups', previouslyAssignedGroup.id);
          await updateDoc(groupRef, { teacherId: null });
          toast({ title: 'Group Unassigned', description: `${data.name} unassigned from group ${previouslyAssignedGroup.name} due to role change.` });
        }
      }

      form.reset({ name: '', username:'', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '' });
      setEditingStaff(null);
      setIsStaffFormDialogOpen(false);
      resetEmailCheck();
      await fetchData(); // Refresh list
    } catch (error: any) {
      let userMessage = editingStaff ? 'Update Staff User Failed' : 'Add Staff User Failed';
      if (error.code === 'auth/email-already-in-use') {
        userMessage = 'This email is already associated with a Firebase Authentication account.';
      } else if (error.code === 'auth/username-already-exists') {
        userMessage = 'This username is already in use. Please choose another.';
      } else if (error.message) {
        userMessage += `: ${error.message}`;
      }
      toast({
        title: 'Operation Failed',
        description: userMessage,
        variant: 'destructive'
      });
      console.error("Firestore/Auth operation error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (staffMember: User) => {
    setStaffToDelete(staffMember);
    setDeleteAdminPassword('');
    setIsDeleteStaffDialogOpen(true);
  };

  const handleSendPasswordReset = async (staffEmail: string | null | undefined, staffName: string) => {
    if (!staffEmail) {
      toast({
        title: 'Cannot Reset Password',
        description: `User ${staffName} does not have an email address registered. Password reset email cannot be sent.`,
        variant: 'destructive',
      });
      return;
    }
    setIsSendingResetEmail(staffEmail);
    try {
      await sendPasswordResetEmail(auth, staffEmail);
      toast({
        title: 'Password Reset Email Sent',
        description: `A password reset email has been sent to ${staffEmail}. Please check spam/junk folders if not received. User will be prompted to set a new password.`,
      });
    } catch (error: any) {
      console.error("Password reset error:", error);
      let errorMessage = "Failed to send password reset email.";
      if (error.code === 'auth/user-not-found') {
        errorMessage = `No Firebase Authentication account found for ${staffEmail}. This user might only have a Firestore record or needs to sign up first via the login page if they don't have an auth account.`;
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = `The email address ${staffEmail} is not valid.`;
      } else {
        errorMessage = `Error: ${error.message} (Code: ${error.code})`;
      }
      toast({
        title: 'Password Reset Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSendingResetEmail(null);
    }
  };

  const confirmDeleteStaffUser = async () => {
    if (!staffToDelete) {
        toast({ title: 'Error', description: 'No staff user selected for deletion.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }
     if (!deleteAdminPassword) {
      toast({ title: 'Input Required', description: 'Admin password is required to delete.', variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }
    if (!authUser) {
        toast({ title: 'Authorization Failed', description: 'Admin user not found. Please log in.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }

    setIsSubmitting(true);
    try {
      await reauthenticateCurrentUser(deleteAdminPassword);

      const batch = writeBatch(db);
      const userRef = doc(db, 'users', staffToDelete.id);
      batch.delete(userRef);

      if (staffToDelete.role === 'teacher' || staffToDelete.role === 'admin') {
        const assignedGroup = allGroups.find(g => g.teacherId === staffToDelete.id);
        if (assignedGroup) {
          const groupRef = doc(db, 'groups', assignedGroup.id);
          batch.update(groupRef, { teacherId: null });
        }
      }
      // Note: Deleting from Firestore does NOT delete the Firebase Auth account.
      // This needs to be handled separately if full deletion is required, typically via Admin SDK.
      await batch.commit();

      toast({ title: 'Staff User Record Deleted', description: `${staffToDelete.name}'s Firestore record removed and unassigned from groups if applicable. Their Firebase Authentication account (if any) is NOT automatically deleted by this action.` });

      setStaffToDelete(null);
      setDeleteAdminPassword('');
      setIsDeleteStaffDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      let errorMessage = 'Failed to delete staff user record.';
      const reAuthErrorCodes = ['auth/wrong-password', 'auth/invalid-credential', 'auth/user-mismatch'];

      if (reAuthErrorCodes.includes(error.code)) {
        errorMessage = 'Admin re-authentication failed: Incorrect password or credential mismatch.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Admin re-authentication failed: Too many attempts. Try again later.';
      } else if (error.code === 'auth/requires-recent-login'){
        errorMessage = 'Admin re-authentication required: This operation is sensitive and requires recent authentication. Please log out and log back in.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: 'Delete Failed', description: errorMessage, variant: 'destructive' });

       if (!reAuthErrorCodes.includes(error.code) && error.code !== 'auth/too-many-requests' && error.code !== 'auth/requires-recent-login') {
         setIsDeleteStaffDialogOpen(false);
         setDeleteAdminPassword('');
       } else {
         setIsDeleteStaffDialogOpen(true);
       }
    } finally {
      setIsSubmitting(false);
    }
  };

  const watchedRole = form.watch('role');
  const watchedEmail = form.watch('email');

  useEffect(() => {
    if (isStaffFormDialogOpen && !editingStaff) { // Only check for new users or if email changes for existing
      if (watchedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchedEmail)) {
        setEmailCheckStatus('checking');
        setEmailCheckMessage('Verifying email...');
        debouncedCheckEmail(watchedEmail);
      } else if (!watchedEmail) {
        resetEmailCheck();
      } else if (watchedEmail) {
        setEmailCheckStatus('idle');
        setEmailCheckMessage('Please enter a valid email address.');
      }
    } else if (isStaffFormDialogOpen && editingStaff && watchedEmail !== editingStaff.email) {
        if (watchedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchedEmail)) {
            setEmailCheckStatus('checking');
            setEmailCheckMessage('Verifying new email...');
            debouncedCheckEmail(watchedEmail);
        } else if (!watchedEmail) {
            resetEmailCheck();
        } else if (watchedEmail) {
             setEmailCheckStatus('idle');
            setEmailCheckMessage('Please enter a valid email address.');
        }
    } else if (isStaffFormDialogOpen && editingStaff && watchedEmail === editingStaff.email) {
        resetEmailCheck(); // Email hasn't changed from original, no need to show status
    }
  }, [watchedEmail, isStaffFormDialogOpen, editingStaff, debouncedCheckEmail, resetEmailCheck]);


  if (isLoading && staffUsers.length === 0 && allGroups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Staff Management</CardTitle>
          <CardDescription>Manage teacher, administrator, and cashier accounts.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">Loading staff and groups...</p>
        </CardContent>
      </Card>
    );
  }

  const getEmailCheckMessageColor = () => {
    switch (emailCheckStatus) {
      case 'checking': return 'text-muted-foreground';
      case 'exists': return 'text-destructive'; // Email exists is a warning/error for new user
      case 'not_found': return 'text-green-600 dark:text-green-400'; // Not found is good for new user
      case 'error': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Staff Management</CardTitle>
          <CardDescription>Manage teacher, admin, and cashier accounts. Assign teachers/admins to groups, set attendance codes, and manage usernames. New staff will use their username as initial password and be forced to change it.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-sm">
            <Link href="/group-management">
              <FolderKanban className="size-3.5" />
              Manage Groups
            </Link>
          </Button>
          <Dialog open={isStaffFormDialogOpen} onOpenChange={(isOpen) => {
            setIsStaffFormDialogOpen(isOpen);
            if (!isOpen) {
              setEditingStaff(null);
              form.reset({
                  name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '',
              });
              resetEmailCheck();
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-sm" onClick={handleOpenAddDialog}>
                <UserPlus className="size-3.5" />
                Add Staff Record
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingStaff ? 'Edit Staff Record' : 'Add New Staff Record'}</DialogTitle>
                <DialogPrimitiveDescription>
                  {editingStaff ? 'Update staff details in Firestore.' : 'Fill in staff details. Username will be used as initial password for login. The user will be forced to change it on first login.'}
                </DialogPrimitiveDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleStaffFormSubmit)} className="space-y-3 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name*</FormLabel>
                        <FormControl><Input placeholder="Jane Doe" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="username"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Username (for login & initial password)*</FormLabel>
                        <FormControl><Input placeholder="janedoe_teacher" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (for Firebase Auth & Password Resets)*</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="jane.doe@example.com"
                            {...field}
                            disabled={!!editingStaff} // Prevent email change for existing users via this form
                          />
                        </FormControl>
                        {editingStaff && <p className="text-xs text-muted-foreground mt-1">Email cannot be changed for existing staff here. Manage Firebase Auth directly if needed.</p>}
                        {!editingStaff && emailCheckMessage && (
                          <p className={`text-xs mt-1 ${getEmailCheckMessageColor()}`}>
                            {emailCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
                            {emailCheckMessage}
                          </p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phoneNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone Number (Optional)</FormLabel>
                        <FormControl><Input type="tel" placeholder="e.g., 123-456-7890" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="caja">Caja</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {(watchedRole === 'teacher' || watchedRole === 'admin') && (
                    <>
                      <FormField
                        control={form.control}
                        name="assignedGroupId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Assign to Group (Optional)</FormLabel>
                            <Select
                              onValueChange={(value) => {
                                field.onChange(value === UNASSIGN_VALUE_KEY ? undefined : value);
                              }}
                              value={field.value || UNASSIGN_VALUE_KEY}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a group or unassign" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value={UNASSIGN_VALUE_KEY}>Unassigned</SelectItem>
                                {allGroups.map((group) => (
                                  <SelectItem key={group.id} value={group.id}>
                                    {group.name} ({group.studentIds?.length || 0} students, Teacher: {
                                      allGroups.find(g=>g.id === group.id)?.teacherId ? (staffUsers.find(su => su.id === allGroups.find(g=>g.id === group.id)?.teacherId)?.name || 'Assigned') : 'None'
                                    })
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="attendanceCode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Attendance Code (for Teacher/Admin)</FormLabel>
                            <FormControl><Input placeholder="e.g., TCH001" {...field} /></FormControl>
                             {field.value && field.value.includes(' ') && (
                                <p className="text-xs text-destructive mt-1">
                                    <AlertTriangle className="inline h-3 w-3 mr-1" />
                                    Attendance code should not contain spaces.
                                </p>
                            )}
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                   <FormField
                    control={form.control}
                    name="photoUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Photo URL (Optional)</FormLabel>
                        <FormControl><Input type="url" placeholder="https://placehold.co/100x100.png" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <DialogFooter className="pt-4">
                    <DialogClose asChild><Button type="button" variant="outline" onClick={resetEmailCheck}>Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isSubmitting || (!editingStaff && emailCheckStatus === 'exists')}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingStaff ? 'Save Changes' : 'Add Staff Record'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && staffUsers.length > 0 && (
             <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2 text-sm text-muted-foreground">Refreshing staff users...</p>
             </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Assigned Group</TableHead>
              <TableHead>Attendance Code</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {staffUsers.length > 0 ? staffUsers.map((staff) => {
              const assignedGroup = (staff.role === 'teacher' || staff.role === 'admin') ? allGroups.find(g => g.teacherId === staff.id) : null;
              return (
              <TableRow key={staff.id}>
                <TableCell>{staff.name}</TableCell>
                <TableCell>{staff.username || 'N/A'}</TableCell>
                <TableCell>{staff.email || 'N/A'}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    staff.role === 'admin' ? 'bg-purple-500/20 text-purple-700 dark:text-purple-400' :
                    staff.role === 'teacher' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400' :
                    staff.role === 'caja' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400' :
                    'bg-gray-500/20 text-gray-700 dark:text-gray-400'
                  }`}>
                    {staff.role.charAt(0).toUpperCase() + staff.role.slice(1)}
                  </span>
                </TableCell>
                <TableCell>{assignedGroup ? assignedGroup.name : ((staff.role === 'teacher' || staff.role === 'admin') ? 'Unassigned' : 'N/A')}</TableCell>
                <TableCell>{(staff.role === 'teacher' || staff.role === 'admin') ? (staff.attendanceCode || <span className="text-muted-foreground text-xs">Not set</span>) : 'N/A'}</TableCell>
                <TableCell className="space-x-0.5">
                  <Button variant="ghost" size="icon" className="mr-1" onClick={() => handleOpenEditDialog(staff)} title="Edit User">
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mr-1"
                    onClick={() => handleSendPasswordReset(staff.email, staff.name)}
                    disabled={!staff.email || isSendingResetEmail === staff.email}
                    title={staff.email ? "Send Password Reset Email" : "Cannot reset password without an email"}
                  >
                    {isSendingResetEmail === staff.email ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                    <span className="sr-only">Send Password Reset</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(staff)} title="Delete User">
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </TableCell>
              </TableRow>
            )}) : (
              !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">No staff users found.</TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
         {isLoading && staffUsers.length === 0 && (
             <div className="text-center py-4 text-sm text-muted-foreground">
                Loading initial staff user data...
             </div>
         )}
      </CardContent>
    </Card>

    <Dialog open={isDeleteStaffDialogOpen} onOpenChange={(isOpen) => {
        setIsDeleteStaffDialogOpen(isOpen);
        if (!isOpen) {
            setStaffToDelete(null);
            setDeleteAdminPassword('');
        }
    }}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Delete Staff User Record</DialogTitle>
                <DialogPrimitiveDescription>
                    Are you sure you want to delete the Firestore record for {staffToDelete?.name}?
                    This action cannot be undone. Enter your admin password to confirm.
                    Auth account (if any) will NOT be deleted. The user will also be unassigned from any group.
                </DialogPrimitiveDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                 <div className="space-y-1.5">
                    <Label htmlFor="deleteAdminPassword">Admin's Current Password</Label>
                    <Input
                        id="deleteAdminPassword"
                        type="password"
                        placeholder="Enter your admin password"
                        value={deleteAdminPassword}
                        onChange={(e) => setDeleteAdminPassword(e.target.value)}
                    />
                 </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button type="button" variant="outline">Cancel</Button>
                </DialogClose>
                <Button
                    type="button"
                    variant="destructive"
                    onClick={confirmDeleteStaffUser}
                    disabled={isSubmitting || !deleteAdminPassword.trim()}
                >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete Staff Record
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}
