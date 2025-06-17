
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
import { Loader2, Pencil, Trash2, UserPlus, FolderKanban, Briefcase, KeyRound, MailIcon, AlertTriangle, Building } from 'lucide-react'; // Added Building
import type { User, Group, Sede } from '@/types'; // Added Sede
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, query, where, writeBatch, limit } from 'firebase/firestore';
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
  email: z.string().email({ message: "Invalid email address." }),
  phoneNumber: z.string().optional().or(z.literal('')),
  role: z.enum(['teacher', 'admin', 'caja', 'supervisor'], { required_error: "Role is required." }), // Added 'supervisor'
  photoUrl: z.string().url({ message: "Please enter a valid URL for photo." }).optional().or(z.literal('')),
  assignedGroupId: z.string().optional(), // For teacher's group assignment
  attendanceCode: z.string().min(4, "Code must be at least 4 characters.").max(20, "Code cannot exceed 20 characters.").optional().or(z.literal('')),
  sedeId: z.string().optional().or(z.literal('')), // For assigning teacher/supervisor to a Sede
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

const UNASSIGN_VALUE_KEY = "##UNASSIGNED##";

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
  const [allSedes, setAllSedes] = useState<Sede[]>([]); // State for Sedes
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
  const { reauthenticateCurrentUser, authUser, signUp: signUpUser } = useAuth();

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
      sedeId: '',
    },
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const staffRoles: User['role'][] = ['admin', 'teacher', 'caja', 'supervisor'];
      const usersQuery = query(collection(db, 'users'), where('role', 'in', staffRoles));
      const usersSnapshotPromise = getDocs(usersQuery);
      
      const groupsSnapshotPromise = getDocs(collection(db, 'groups'));
      const sedesSnapshotPromise = getDocs(collection(db, 'sedes')); // Fetch Sedes

      const [usersSnapshot, groupsSnapshot, sedesSnapshot] = await Promise.all([
        usersSnapshotPromise,
        groupsSnapshotPromise,
        sedesSnapshotPromise,
      ]);

      setStaffUsers(usersSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));
      setAllGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
      setAllSedes(sedesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Sede))); // Set Sedes

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load staff users, groups, or sedes.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const checkEmailExistence = useCallback(async (email: string) => {
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.trim()), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setEmailCheckStatus('exists');
        setEmailCheckMessage('An account with this email already exists in Firestore (Staff).');
      } else {
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
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: '',
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
      role: staffToEdit.role as 'teacher' | 'admin' | 'caja' | 'supervisor',
      photoUrl: staffToEdit.photoUrl || '',
      assignedGroupId: currentGroupAssignment ? currentGroupAssignment.id : undefined,
      attendanceCode: staffToEdit.attendanceCode || '',
      sedeId: staffToEdit.sedeId || '',
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

    if (!data.email && !editingStaff) {
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
      username: data.username || null,
      email: data.email || null,
      phoneNumber: data.phoneNumber || null,
      role: data.role,
      photoUrl: data.photoUrl || null,
      attendanceCode: (data.role === 'teacher' || data.role === 'admin' || data.role === 'supervisor') ? (data.attendanceCode || null) : null,
      sedeId: (data.role === 'teacher' || data.role === 'supervisor') ? (data.sedeId === UNASSIGN_VALUE_KEY ? null : data.sedeId || null) : null,
    };

    let staffMemberId: string | undefined = editingStaff?.id;

    try {
      if (editingStaff) {
        const staffRef = doc(db, 'users', editingStaff.id);
        await updateDoc(staffRef, firestoreUserData);
        toast({ title: 'Staff User Updated', description: `${data.name}'s record updated successfully.` });
      } else {
        if (!data.username || !data.email) {
            toast({ title: 'Error', description: 'Username and Email are required for new staff.', variant: 'destructive'});
            setIsSubmitting(false);
            return;
        }
        // Pass sedeId to signUp if role is teacher or supervisor
        const additionalData: Partial<User> = {};
        if (data.role === 'teacher' || data.role === 'supervisor') {
            additionalData.sedeId = data.sedeId === UNASSIGN_VALUE_KEY ? null : data.sedeId || null;
        }
        if (data.attendanceCode && (data.role === 'teacher' || data.role === 'admin' || data.role === 'supervisor')){
            additionalData.attendanceCode = data.attendanceCode;
        }

        await signUpUser(data.name, data.username, data.email, data.username, data.role, undefined, additionalData);
        
        toast({
          title: 'Staff User Record Added',
          description: `${data.name} added. They can log in with username: ${data.username} (as password) and will be prompted to change it.`
        });
      }

      // Group assignment logic for teachers
      if (staffMemberId && data.role === 'teacher') {
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
      } else if (staffMemberId && data.role !== 'teacher') { 
        const previouslyAssignedGroup = allGroups.find(g => g.teacherId === staffMemberId);
        if (previouslyAssignedGroup) {
          const groupRef = doc(db, 'groups', previouslyAssignedGroup.id);
          await updateDoc(groupRef, { teacherId: null });
          toast({ title: 'Group Unassigned', description: `${data.name} unassigned from group ${previouslyAssignedGroup.name} due to role change.` });
        }
      }

      form.reset({ name: '', username:'', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: '' });
      setEditingStaff(null);
      setIsStaffFormDialogOpen(false);
      resetEmailCheck();
      await fetchData();
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

      if (staffToDelete.role === 'teacher' || staffToDelete.role === 'admin' || staffToDelete.role === 'supervisor') {
        // Unassign from any group if teacher
        if (staffToDelete.role === 'teacher') {
            const assignedGroup = allGroups.find(g => g.teacherId === staffToDelete.id);
            if (assignedGroup) {
                const groupRef = doc(db, 'groups', assignedGroup.id);
                batch.update(groupRef, { teacherId: null });
            }
        }
        // Unassign from any Sede if supervisor
        if (staffToDelete.role === 'supervisor') {
            const assignedSede = allSedes.find(s => s.supervisorId === staffToDelete.id);
            if (assignedSede) {
                const sedeRef = doc(db, 'sedes', assignedSede.id);
                batch.update(sedeRef, { supervisorId: null });
            }
        }
      }
      await batch.commit();

      toast({ title: 'Staff User Record Deleted', description: `${staffToDelete.name}'s Firestore record removed and unassigned if applicable. Their Firebase Authentication account (if any) is NOT automatically deleted by this action.` });

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
    if (isStaffFormDialogOpen && !editingStaff) { 
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
        resetEmailCheck(); 
    }
  }, [watchedEmail, isStaffFormDialogOpen, editingStaff, debouncedCheckEmail, resetEmailCheck]);


  if (isLoading && staffUsers.length === 0 && allGroups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Staff Management</CardTitle>
          <CardDescription>Manage teacher, administrator, cashier, and supervisor accounts.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">Loading staff, groups, and sedes...</p>
        </CardContent>
      </Card>
    );
  }

  const getEmailCheckMessageColor = () => {
    switch (emailCheckStatus) {
      case 'checking': return 'text-muted-foreground';
      case 'exists': return 'text-destructive'; 
      case 'not_found': return 'text-green-600 dark:text-green-400'; 
      case 'error': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };
  
  const getSedeName = (sedeId?: string | null) => {
    if (!sedeId) return 'N/A';
    const sede = allSedes.find(s => s.id === sedeId);
    return sede ? sede.name : 'Unknown Sede';
  };

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Staff Management</CardTitle>
          <CardDescription>Manage teacher, admin, cashier, and supervisor accounts. Assign to groups/sedes, set attendance codes, and manage usernames. New staff will use their username as initial password and be forced to change it.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-sm">
            <Link href="/group-management">
              <FolderKanban className="size-3.5" />
              Manage Groups
            </Link>
          </Button>
           <Button asChild size="sm" variant="outline" className="gap-1.5 text-sm">
            <Link href="/sede-management">
              <Building className="size-3.5" />
              Manage Sedes
            </Link>
          </Button>
          <Dialog open={isStaffFormDialogOpen} onOpenChange={(isOpen) => {
            setIsStaffFormDialogOpen(isOpen);
            if (!isOpen) {
              setEditingStaff(null);
              form.reset({
                  name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: ''
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
                  {editingStaff ? 'Update staff details in Firestore.' : "Fill in staff details. Username and Email are required for login. The Username will be used as the staff member's initial password. They will be required to change this password upon their first login."}
                </DialogPrimitiveDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleStaffFormSubmit)} className="space-y-3 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Full Name*</FormLabel><FormControl><Input placeholder="Jane Doe" {...field} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="username" render={({ field }) => (
                      <FormItem><FormLabel>Username (for login & initial password)*</FormLabel><FormControl><Input placeholder="janedoe_staff" {...field} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email (for Firebase Auth & Password Resets)*</FormLabel>
                          <FormControl><Input type="email" placeholder="jane.doe@example.com" {...field} disabled={!!editingStaff} /></FormControl>
                          {editingStaff && <p className="text-xs text-muted-foreground mt-1">Email cannot be changed for existing staff here.</p>}
                          {!editingStaff && emailCheckMessage && (<p className={`text-xs mt-1 ${getEmailCheckMessageColor()}`}>{emailCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}{emailCheckMessage}</p>)}
                          <FormMessage />
                      </FormItem>
                  )}/>
                  <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                      <FormItem><FormLabel>Phone Number (Optional)</FormLabel><FormControl><Input type="tel" placeholder="e.g., 123-456-7890" {...field} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="role" render={({ field }) => (
                      <FormItem><FormLabel>Role*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="supervisor">Supervisor</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="caja">Caja</SelectItem>
                          </SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                  )}/>
                  {(watchedRole === 'teacher') && (
                    <FormField control={form.control} name="assignedGroupId" render={({ field }) => (
                        <FormItem><FormLabel>Assign Teacher to Group (Optional)</FormLabel>
                          <Select onValueChange={(value) => { field.onChange(value === UNASSIGN_VALUE_KEY ? undefined : value);}} value={field.value || UNASSIGN_VALUE_KEY}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a group or unassign" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={UNASSIGN_VALUE_KEY}>Unassigned from Group</SelectItem>
                              {allGroups.map((group) => (
                                <SelectItem key={group.id} value={group.id}>{group.name} ({group.studentIds?.length || 0} students, Teacher: {group.teacherId ? (staffUsers.find(su => su.id === group.teacherId)?.name || 'Assigned') : 'None'})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select><FormMessage />
                        </FormItem>
                    )}/>
                  )}
                   {(watchedRole === 'teacher' || watchedRole === 'supervisor') && (
                     <FormField control={form.control} name="sedeId" render={({ field }) => (
                          <FormItem><FormLabel>Assign to Sede (Branch/Location)</FormLabel>
                            <Select onValueChange={(value) => field.onChange(value === UNASSIGN_VALUE_KEY ? '' : value)} value={field.value || UNASSIGN_VALUE_KEY}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select a Sede or unassign" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value={UNASSIGN_VALUE_KEY}>Unassigned from Sede</SelectItem>
                                {allSedes.map((sede) => (<SelectItem key={sede.id} value={sede.id}>{sede.name}</SelectItem>))}
                              </SelectContent>
                            </Select>
                            {watchedRole === 'supervisor' && <p className="text-xs text-muted-foreground mt-1">Note: For Supervisors, Sede assignment is primarily managed in 'Sede Management'. This field reflects that assignment if already made.</p>}
                            <FormMessage />
                          </FormItem>
                     )}/>
                   )}
                  {(watchedRole === 'teacher' || watchedRole === 'admin' || watchedRole === 'supervisor') && (
                    <FormField control={form.control} name="attendanceCode" render={({ field }) => (
                        <FormItem><FormLabel>Attendance Code</FormLabel><FormControl><Input placeholder="e.g., TCH001" {...field} /></FormControl>
                           {field.value && field.value.includes(' ') && (<p className="text-xs text-destructive mt-1"><AlertTriangle className="inline h-3 w-3 mr-1" />Attendance code should not contain spaces.</p>)}
                           <FormMessage />
                        </FormItem>
                    )}/>
                  )}
                   <FormField control={form.control} name="photoUrl" render={({ field }) => (
                      <FormItem><FormLabel>Photo URL (Optional)</FormLabel><FormControl><Input type="url" placeholder="https://placehold.co/100x100.png" {...field} /></FormControl><FormMessage /></FormItem>
                   )}/>
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
             <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="ml-2 text-sm text-muted-foreground">Refreshing staff users...</p></div>
        )}
        <Table>
          <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Username</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
              <TableHead>Assigned Group/Sede</TableHead><TableHead>Attendance Code</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {staffUsers.length > 0 ? staffUsers.map((staff) => {
              const assignedGroup = (staff.role === 'teacher') ? allGroups.find(g => g.teacherId === staff.id) : null;
              const assignedSedeName = (staff.role === 'teacher' || staff.role === 'supervisor') ? getSedeName(staff.sedeId) : 'N/A';
              let assignmentDisplay = 'N/A';
              if (staff.role === 'teacher') {
                  assignmentDisplay = assignedGroup ? `${assignedGroup.name} (Grupo)` : (assignedSedeName !== 'N/A' ? `${assignedSedeName} (Sede)` : 'Unassigned');
              } else if (staff.role === 'supervisor') {
                  assignmentDisplay = assignedSedeName !== 'N/A' ? `${assignedSedeName} (Sede)` : 'Unassigned';
              }
              return (
              <TableRow key={staff.id}>
                <TableCell>{staff.name}</TableCell><TableCell>{staff.username || 'N/A'}</TableCell><TableCell>{staff.email || 'N/A'}</TableCell>
                <TableCell><span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    staff.role === 'admin' ? 'bg-purple-500/20 text-purple-700 dark:text-purple-400' :
                    staff.role === 'supervisor' ? 'bg-teal-500/20 text-teal-700 dark:text-teal-400' :
                    staff.role === 'teacher' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400' :
                    staff.role === 'caja' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400' :
                    'bg-gray-500/20 text-gray-700 dark:text-gray-400'}`}>
                    {staff.role.charAt(0).toUpperCase() + staff.role.slice(1)}</span></TableCell>
                <TableCell>{assignmentDisplay}</TableCell>
                <TableCell>{(staff.role === 'teacher' || staff.role === 'admin' || staff.role === 'supervisor') ? (staff.attendanceCode || <span className="text-muted-foreground text-xs">Not set</span>) : 'N/A'}</TableCell>
                <TableCell className="space-x-0.5">
                  <Button variant="ghost" size="icon" className="mr-1" onClick={() => handleOpenEditDialog(staff)} title="Edit User"><Pencil className="h-4 w-4" /><span className="sr-only">Edit</span></Button>
                  <Button variant="ghost" size="icon" className="mr-1" onClick={() => handleSendPasswordReset(staff.email, staff.name)} disabled={!staff.email || isSendingResetEmail === staff.email} title={staff.email ? "Send Password Reset Email" : "Cannot reset (no email)"}><KeyRound className="h-4 w-4" /><span className="sr-only">Send Password Reset</span></Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(staff)} title="Delete User"><Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span></Button>
                </TableCell>
              </TableRow>
            )}) : (!isLoading && (<TableRow><TableCell colSpan={7} className="text-center">No staff users found.</TableCell></TableRow>))}
          </TableBody>
        </Table>
         {isLoading && staffUsers.length === 0 && (<div className="text-center py-4 text-sm text-muted-foreground">Loading initial staff user data...</div>)}
      </CardContent>
    </Card>

    <Dialog open={isDeleteStaffDialogOpen} onOpenChange={(isOpen) => { setIsDeleteStaffDialogOpen(isOpen); if (!isOpen) { setStaffToDelete(null); setDeleteAdminPassword('');}}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Delete Staff User Record</DialogTitle>
          <DialogPrimitiveDescription>Are you sure you want to delete the Firestore record for {staffToDelete?.name}? Auth account (if any) will NOT be deleted. User will be unassigned from groups/sedes.</DialogPrimitiveDescription>
        </DialogHeader>
        <div className="space-y-4 py-4"><div className="space-y-1.5"><Label htmlFor="deleteAdminPasswordStaff">Admin's Current Password</Label><Input id="deleteAdminPasswordStaff" type="password" placeholder="Enter admin password" value={deleteAdminPassword} onChange={(e) => setDeleteAdminPassword(e.target.value)}/></div></div>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="button" variant="destructive" onClick={confirmDeleteStaffUser} disabled={isSubmitting || !deleteAdminPassword.trim()}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete Staff Record</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
