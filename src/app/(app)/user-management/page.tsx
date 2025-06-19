
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
import { Loader2, Pencil, Trash2, UserPlus, FolderKanban, Briefcase, KeyRound, MailIcon, AlertTriangle, Building } from 'lucide-react';
import type { User, Group, Sede } from '@/types';
import { db, auth } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, query, where, writeBatch, limit, addDoc, setDoc } from 'firebase/firestore';
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
  role: z.enum(['teacher', 'admin', 'caja', 'supervisor'], { required_error: "Role is required." }),
  photoUrl: z.string().url({ message: "Please enter a valid URL for photo." }).optional().or(z.literal('')),
  assignedGroupId: z.string().optional(), // For teachers
  attendanceCode: z.string().min(4, "Code must be at least 4 characters.").max(20, "Code cannot exceed 20 characters.").optional().or(z.literal('')),
  sedeId: z.string().optional().or(z.literal('')), // For teachers, supervisors, admins
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
  const [allSedes, setAllSedes] = useState<Sede[]>([]);
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
  const { reauthenticateCurrentUser, authUser, firestoreUser } = useAuth();

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: '',
    },
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const usersQuery = query(collection(db, 'users'), where('role', '!=', 'student'));
      const usersSnapshotPromise = getDocs(usersQuery);
      const groupsSnapshotPromise = getDocs(collection(db, 'groups'));
      const sedesSnapshotPromise = getDocs(collection(db, 'sedes'));

      const [usersSnapshot, groupsSnapshot, sedesSnapshot] = await Promise.all([
        usersSnapshotPromise,
        groupsSnapshotPromise,
        sedesSnapshotPromise,
      ]);

      const fetchedUsers = usersSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));
      setStaffUsers(fetchedUsers);
      setAllGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
      setAllSedes(sedesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Sede)));

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
    setEmailCheckStatus('checking');
    setEmailCheckMessage(`Verifying email...`);
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.trim()), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty && (!editingStaff || querySnapshot.docs[0].id !== editingStaff.id)) {
        setEmailCheckStatus('exists');
        setEmailCheckMessage(`An account with this email already exists. Password reset will target this account.`);
      } else {
        setEmailCheckStatus('not_found');
        setEmailCheckMessage(`Email available.`);
      }
    } catch (error) {
      console.error("Error checking email existence:", error);
      setEmailCheckStatus('error');
      setEmailCheckMessage('Error verifying email. Please try again.');
    }
  }, [editingStaff]);

  const debouncedCheckEmail = useMemo(() => debounce(checkEmailExistence, 700), [checkEmailExistence]);

  const resetEmailCheck = useCallback(() => {
    setEmailCheckStatus('idle');
    setEmailCheckMessage(null);
  }, []);
  
  const canAddStaff = firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor';

  const handleOpenAddDialog = () => {
    setEditingStaff(null);
    const defaultValues: StaffFormValues = {
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: '',
    };
    if (firestoreUser?.role === 'supervisor') {
      defaultValues.role = 'teacher'; 
      defaultValues.sedeId = firestoreUser.sedeId || ''; 
    }
    form.reset(defaultValues);
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
    setIsStaffFormDialogOpen(true);
  };

  const handleStaffFormSubmit = async (data: StaffFormValues) => {
    setIsSubmitting(true);

    if (!data.email && !editingStaff) {
        toast({ title: 'Email Required', description: 'Email is required for new staff members.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }
    if (!data.username && !editingStaff) {
        toast({ title: 'Username Required', description: 'Username is required for identification.', variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }
     if (!editingStaff && emailCheckStatus === 'exists') {
        toast({ title: 'Email Exists in Firestore', description: `A user record with email ${data.email} already exists.`, variant: 'destructive' });
        setIsSubmitting(false);
        return;
    }
    
    // Supervisor specific validations
    if (firestoreUser?.role === 'supervisor') {
        if (!editingStaff && data.role !== 'teacher') { // Supervisor creating new staff
            toast({ title: "Action Denied", description: "Supervisors can only add users with the 'Teacher' role.", variant: "destructive" });
            setIsSubmitting(false);
            return;
        }
        if (data.sedeId !== firestoreUser.sedeId) {
            toast({ title: "Action Denied", description: `Teachers must be assigned to your Sede (${getSedeName(firestoreUser.sedeId)}).`, variant: "destructive" });
            setIsSubmitting(false);
            return;
        }
    }


    const firestoreUserData: Omit<User, 'id' | 'uid' | 'gradesByLevel' | 'requiresPasswordChange'> & { id?: string, uid?: string, requiresPasswordChange?: boolean } = {
      name: data.name,
      username: data.username || null,
      email: data.email || null,
      phoneNumber: data.phoneNumber || null,
      role: data.role,
      photoUrl: data.photoUrl || null,
      attendanceCode: (data.role === 'teacher' || data.role === 'admin' || data.role === 'supervisor') ? (data.attendanceCode || null) : null,
      sedeId: (data.role === 'teacher' || data.role === 'supervisor' || data.role === 'admin') ? (data.sedeId === UNASSIGN_VALUE_KEY ? null : data.sedeId || null) : null,
    };
    if (!editingStaff) {
        firestoreUserData.requiresPasswordChange = false;
    }

    let staffMemberId: string | undefined = editingStaff?.id;

    try {
      if (editingStaff) {
        const staffRef = doc(db, 'users', editingStaff.id);
        const { email, username, ...updateData } = firestoreUserData;
        await updateDoc(staffRef, updateData);
        staffMemberId = editingStaff.id;
        toast({ title: 'Staff User Updated', description: `${data.name}'s Firestore record updated successfully.` });
      } else { 
        if (!data.username || !data.email) {
            toast({ title: 'Error', description: 'Username and Email are required for new staff.', variant: 'destructive'});
            setIsSubmitting(false);
            return;
        }
        const newStaffDocRef = await addDoc(collection(db, 'users'), {
          ...firestoreUserData,
        });
        staffMemberId = newStaffDocRef.id;
        await updateDoc(newStaffDocRef, { uid: newStaffDocRef.id });
        toast({
          title: 'Staff User Record Added',
          description: `${data.name}'s record added. Use 'Send Password Reset' to enable their login.`
        });
      }

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
        }
      } else if (staffMemberId && data.role !== 'teacher') {
        const previouslyAssignedGroup = allGroups.find(g => g.teacherId === staffMemberId);
        if (previouslyAssignedGroup) {
          const groupRef = doc(db, 'groups', previouslyAssignedGroup.id);
          await updateDoc(groupRef, { teacherId: null });
        }
      }

      if (staffMemberId && (data.role === 'teacher' || data.role === 'supervisor' || data.role === 'admin')) {
          const newSedeId = data.sedeId === UNASSIGN_VALUE_KEY ? null : data.sedeId || null;
          const userSedeRef = doc(db, 'users', staffMemberId);
          await updateDoc(userSedeRef, { sedeId: newSedeId });

          if (data.role === 'supervisor' && newSedeId) {
              const sedeRef = doc(db, 'sedes', newSedeId);
              const currentSedeDoc = allSedes.find(s => s.id === newSedeId);
              if (currentSedeDoc?.supervisorId !== staffMemberId) {
                 await updateDoc(sedeRef, { supervisorId: staffMemberId });
                 const oldSedeSupervised = allSedes.find(s => s.supervisorId === staffMemberId && s.id !== newSedeId);
                 if (oldSedeSupervised) {
                     await updateDoc(doc(db, 'sedes', oldSedeSupervised.id), {supervisorId: null});
                 }
              }
          } else if (data.role === 'supervisor' && !newSedeId) {
             const oldSedeSupervised = allSedes.find(s => s.supervisorId === staffMemberId);
             if (oldSedeSupervised) {
                 await updateDoc(doc(db, 'sedes', oldSedeSupervised.id), {supervisorId: null});
             }
          }
      }

      form.reset({ name: '', username:'', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: '' });
      setEditingStaff(null);
      setIsStaffFormDialogOpen(false);
      resetEmailCheck();
      await fetchData();
    } catch (error: any) {
      toast({
        title: 'Operation Failed',
        description: editingStaff ? `Update failed: ${error.message}` : `Add failed: ${error.message}`,
        variant: 'destructive'
      });
      console.error("Firestore operation error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (staffMember: User) => {
    if (firestoreUser?.role === 'supervisor' && (staffMember.role !== 'teacher' || staffMember.sedeId !== firestoreUser.sedeId)) {
        toast({ title: "Permission Denied", description: "Supervisors can only delete teachers within their own Sede.", variant: "destructive" });
        return;
    }
    setStaffToDelete(staffMember);
    setDeleteAdminPassword('');
    setIsDeleteStaffDialogOpen(true);
  };

  const handleSendPasswordReset = async (staffEmail: string | null | undefined, staffName: string) => {
    if (!staffEmail) {
      toast({
        title: 'Cannot Reset Password',
        description: `User ${staffName} does not have an email address registered.`,
        variant: 'destructive',
      });
      return;
    }
    setIsSendingResetEmail(staffEmail);
    try {
      await sendPasswordResetEmail(auth, staffEmail);
      toast({
        title: 'Password Setup Email Sent',
        description: `An email has been sent to ${staffEmail} for password setup/reset.`,
      });
    } catch (error: any) {
      console.error("Password reset/setup error:", error);
      let errorMessage = "Failed to send password setup/reset email.";
      if (error.code === 'auth/user-not-found') {
         toast({
            title: 'Password Setup Email Sent (New User)',
            description: `An email has been sent to ${staffEmail} to create their account and set a password.`,
         });
         setIsSendingResetEmail(null);
         return;
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = `The email address ${staffEmail} is not valid.`;
      } else {
        errorMessage = `Error: ${error.message} (Code: ${error.code})`;
      }
      toast({
        title: 'Password Setup/Reset Failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSendingResetEmail(null);
    }
  };

  const confirmDeleteStaffUser = async () => {
    if (!staffToDelete || !authUser) return;
    
    const isAdminDeleting = firestoreUser?.role === 'admin';
    const isSupervisorDeleting = firestoreUser?.role === 'supervisor';

    if (isAdminDeleting && !deleteAdminPassword) {
      toast({ title: 'Input Required', description: 'Admin password is required to delete.', variant: 'destructive' });
      return;
    }
    if (isSupervisorDeleting && staffToDelete.role !== 'teacher') {
        toast({ title: "Action Denied", description: "Supervisors can only delete teachers.", variant: "destructive" });
        return;
    }
    if (isSupervisorDeleting && staffToDelete.sedeId !== firestoreUser?.sedeId) {
        toast({ title: "Action Denied", description: "Supervisors can only delete teachers from their own Sede.", variant: "destructive" });
        return;
    }


    setIsSubmitting(true);
    try {
      if (isAdminDeleting) {
        await reauthenticateCurrentUser(deleteAdminPassword);
      }
      
      const batch = writeBatch(db);
      const userRef = doc(db, 'users', staffToDelete.id);
      batch.delete(userRef);

      if (staffToDelete.role === 'teacher') {
        const assignedGroup = allGroups.find(g => g.teacherId === staffToDelete.id);
        if (assignedGroup) {
            const groupRef = doc(db, 'groups', assignedGroup.id);
            batch.update(groupRef, { teacherId: null });
        }
      }
      if (staffToDelete.role === 'supervisor') {
        const assignedSede = allSedes.find(s => s.supervisorId === staffToDelete.id);
        if (assignedSede) {
            const sedeRef = doc(db, 'sedes', assignedSede.id);
            batch.update(sedeRef, { supervisorId: null });
        }
      }
      
      await batch.commit();

      toast({ title: 'Staff User Record Deleted', description: `${staffToDelete.name}'s Firestore record removed. Auth account (if any) NOT deleted.` });

      setStaffToDelete(null);
      setDeleteAdminPassword('');
      setIsDeleteStaffDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      let errorMessage = 'Failed to delete staff user record.';
      const reAuthErrorCodes = ['auth/wrong-password', 'auth/invalid-credential', 'auth/user-mismatch', 'auth/requires-recent-login'];

      if (isAdminDeleting && reAuthErrorCodes.includes(error.code)) {
        errorMessage = `Admin re-authentication failed: ${error.message}.`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: 'Delete Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const watchedRole = form.watch('role');
  const watchedEmailValue = form.watch('email');

  useEffect(() => {
    if (isStaffFormDialogOpen && watchedEmailValue && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchedEmailValue)) {
        if (!editingStaff || watchedEmailValue !== editingStaff.email) {
            debouncedCheckEmail(watchedEmailValue);
        } else {
            resetEmailCheck();
        }
    } else if (!watchedEmailValue && isStaffFormDialogOpen) {
      resetEmailCheck();
    } else if (watchedEmailValue && isStaffFormDialogOpen) {
      setEmailCheckStatus('idle');
      setEmailCheckMessage('Please enter a valid email address.');
    }
  }, [watchedEmailValue, isStaffFormDialogOpen, editingStaff, debouncedCheckEmail, resetEmailCheck]);

  const displayedStaffUsers = useMemo(() => {
    if (firestoreUser?.role === 'supervisor') {
        return staffUsers.filter(staff => staff.sedeId === firestoreUser.sedeId && (staff.role === 'teacher' || staff.id === firestoreUser.id));
    }
    return staffUsers;
  }, [staffUsers, firestoreUser]);

  if (isLoading && staffUsers.length === 0 && allGroups.length === 0 && allSedes.length === 0) {
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
      case 'exists': return 'text-orange-600 dark:text-orange-400';
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
  
  const availableSedesForAssignment = useMemo(() => {
    if (firestoreUser?.role === 'supervisor') {
        return allSedes.filter(s => s.id === firestoreUser.sedeId);
    }
    return allSedes;
  }, [allSedes, firestoreUser]);
  
  const availableGroupsForTeacherAssignment = useMemo(() => {
    if (firestoreUser?.role === 'supervisor') {
        return allGroups.filter(g => g.sedeId === firestoreUser.sedeId);
    }
    return allGroups;
  }, [allGroups, firestoreUser]);


  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Staff Management</CardTitle>
          <CardDescription>
            {firestoreUser?.role === 'supervisor' 
              ? "Manage teachers within your Sede. New staff will receive an email to set their password."
              : "Manage all staff accounts. New staff will receive an email to set their password."
            }
          </CardDescription>
        </div>
        <div className="flex gap-2">
         {firestoreUser?.role === 'admin' && (
            <>
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
            </>
         )}
         {canAddStaff && (
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
                  {editingStaff ? "Update staff details." : "Fill in staff details. New staff set password via email link."}
                </DialogPrimitiveDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleStaffFormSubmit)} className="space-y-3 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Full Name*</FormLabel><FormControl><Input placeholder="Jane Doe" {...field} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="username" render={({ field }) => (
                      <FormItem><FormLabel>Username (for login)*</FormLabel><FormControl><Input placeholder="janedoe_staff" {...field} disabled={!!editingStaff} /></FormControl>
                      {!!editingStaff && <p className="text-xs text-muted-foreground mt-1">Username cannot be changed.</p>}
                      <FormMessage />
                      </FormItem>
                  )}/>
                  <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email (for login & password resets)*</FormLabel>
                          <FormControl><Input type="email" placeholder="jane.doe@example.com" {...field} disabled={!!editingStaff} /></FormControl>
                          {editingStaff && <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>}
                          {!editingStaff && emailCheckMessage && (<p className={`text-xs mt-1 ${getEmailCheckMessageColor()}`}>{emailCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}{emailCheckMessage}</p>)}
                          <FormMessage />
                      </FormItem>
                  )}/>
                  <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                      <FormItem><FormLabel>Phone Number (Optional)</FormLabel><FormControl><Input type="tel" placeholder="e.g., 123-456-7890" {...field} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="role" render={({ field }) => (
                      <FormItem><FormLabel>Role*</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value} 
                          defaultValue={field.value}
                          disabled={
                            (!!editingStaff && editingStaff.role === 'admin' && authUser?.uid === editingStaff.id) ||
                            (firestoreUser?.role === 'supervisor' && !!editingStaff && editingStaff.role !== 'teacher') || // Supervisor can only edit teachers
                            (firestoreUser?.role === 'supervisor' && !editingStaff) // Supervisor can only add teachers
                          }
                        >
                          <FormControl><SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                          <SelectContent>
                            {firestoreUser?.role === 'admin' && (
                                <>
                                <SelectItem value="teacher">Teacher</SelectItem>
                                <SelectItem value="supervisor">Supervisor</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                                <SelectItem value="caja">Caja</SelectItem>
                                </>
                            )}
                            {firestoreUser?.role === 'supervisor' && (
                                <SelectItem value="teacher">Teacher</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        {!!editingStaff && editingStaff.role === 'admin' && authUser?.uid === editingStaff.id && <p className="text-xs text-muted-foreground mt-1">Admins cannot change their own role.</p>}
                        {firestoreUser?.role === 'supervisor' && <p className="text-xs text-muted-foreground mt-1">Supervisors can only manage 'Teacher' roles.</p>}
                        <FormMessage />
                      </FormItem>
                  )}/>
                   {(watchedRole === 'teacher' || watchedRole === 'supervisor' || watchedRole === 'admin') && (
                     <FormField control={form.control} name="sedeId" render={({ field }) => (
                          <FormItem><FormLabel>Assign to Sede</FormLabel>
                            <Select 
                              onValueChange={(value) => field.onChange(value === UNASSIGN_VALUE_KEY ? '' : value)} 
                              value={field.value || UNASSIGN_VALUE_KEY}
                              disabled={firestoreUser?.role === 'supervisor'}
                            >
                              <FormControl><SelectTrigger><SelectValue placeholder="Select a Sede or unassign" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value={UNASSIGN_VALUE_KEY}>Unassigned from Sede</SelectItem>
                                {availableSedesForAssignment.map((sede) => (<SelectItem key={sede.id} value={sede.id}>{sede.name}</SelectItem>))}
                              </SelectContent>
                            </Select>
                            {firestoreUser?.role === 'supervisor' && <p className="text-xs text-muted-foreground mt-1">Sede is automatically set to your Sede: {getSedeName(firestoreUser.sedeId)}.</p>}
                            <FormMessage />
                          </FormItem>
                     )}/>
                   )}
                  {(watchedRole === 'teacher') && ( // Only teachers can be assigned to groups in this form
                    <FormField control={form.control} name="assignedGroupId" render={({ field }) => (
                        <FormItem><FormLabel>Assign Teacher to Group (Optional)</FormLabel>
                          <Select onValueChange={(value) => { field.onChange(value === UNASSIGN_VALUE_KEY ? undefined : value);}} value={field.value || UNASSIGN_VALUE_KEY}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select a group or unassign" /></SelectTrigger></FormControl>
                            <SelectContent>
                              <SelectItem value={UNASSIGN_VALUE_KEY}>Unassigned from Group</SelectItem>
                              {availableGroupsForTeacherAssignment.map((group) => (
                                <SelectItem key={group.id} value={group.id}>
                                    {group.name} 
                                    ({group.studentIds?.length || 0} students)
                                    {group.teacherId && group.teacherId !== editingStaff?.id ? ` (Currently: ${staffUsers.find(su => su.id === group.teacherId)?.name || 'Other'})` : (group.teacherId === editingStaff?.id ? ' (Current)' : '')}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select><FormMessage />
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
                    <Button type="submit" disabled={isSubmitting || (!editingStaff && emailCheckStatus === 'exists') }>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingStaff ? 'Save Changes' : 'Add Staff Record'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && displayedStaffUsers.length === 0 && (
             <div className="flex items-center justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="ml-2 text-sm text-muted-foreground">Loading staff users...</p></div>
        )}
        <Table>
          <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Username</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead>
              <TableHead>Assigned Group/Sede</TableHead><TableHead>Attendance Code</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {displayedStaffUsers.length > 0 ? displayedStaffUsers.map((staff) => {
              const assignedGroup = (staff.role === 'teacher') ? allGroups.find(g => g.teacherId === staff.id) : null;
              const staffSedeName = getSedeName(staff.sedeId);
              let assignmentDisplay = 'N/A';
              if (staff.role === 'teacher') {
                  assignmentDisplay = assignedGroup ? `${assignedGroup.name} (Grupo)` : (staffSedeName !== 'N/A' ? `${staffSedeName} (Sede)` : 'Unassigned');
              } else if (staff.role === 'supervisor' || staff.role === 'admin') {
                  assignmentDisplay = staffSedeName !== 'N/A' ? `${staffSedeName} (Sede)` : (staff.role === 'admin' ? 'Global Admin' : 'Unassigned');
              }
              
              const canEditThisStaff = firestoreUser?.role === 'admin' || 
                                     (firestoreUser?.role === 'supervisor' && staff.role === 'teacher' && staff.sedeId === firestoreUser.sedeId);
              const canDeleteThisStaff = (firestoreUser?.role === 'admin' && staff.id !== authUser?.uid) ||
                                       (firestoreUser?.role === 'supervisor' && staff.role === 'teacher' && staff.sedeId === firestoreUser.sedeId);

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
                  <Button variant="ghost" size="icon" className="mr-1" onClick={() => handleOpenEditDialog(staff)} title="Edit User"
                    disabled={!canEditThisStaff}
                  ><Pencil className="h-4 w-4" /><span className="sr-only">Edit</span></Button>
                  <Button variant="ghost" size="icon" className="mr-1" onClick={() => handleSendPasswordReset(staff.email, staff.name)} disabled={!staff.email || isSendingResetEmail === staff.email} title={staff.email ? "Send Password Setup/Reset Email" : "Cannot reset (no email)"}><KeyRound className="h-4 w-4" /><span className="sr-only">Send Password Reset</span></Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(staff)} title="Delete User"
                    disabled={!canDeleteThisStaff}
                  ><Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span></Button>
                </TableCell>
              </TableRow>
            )}) : (!isLoading && (<TableRow><TableCell colSpan={7} className="text-center">
                {firestoreUser?.role === 'supervisor' && displayedStaffUsers.length === 0 ? "No teachers found in your Sede." : "No staff users found." }
                </TableCell></TableRow>))}
          </TableBody>
        </Table>
         {isLoading && displayedStaffUsers.length === 0 && (<div className="text-center py-4 text-sm text-muted-foreground">Loading staff user data...</div>)}
      </CardContent>
    </Card>

    <Dialog open={isDeleteStaffDialogOpen} onOpenChange={(isOpen) => { setIsDeleteStaffDialogOpen(isOpen); if (!isOpen) { setStaffToDelete(null); setDeleteAdminPassword('');}}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Delete Staff User Record</DialogTitle>
          <DialogPrimitiveDescription>Are you sure you want to delete {staffToDelete?.name}? This only removes the Firestore record. Auth account (if any) is NOT deleted.
            {firestoreUser?.role === 'admin' && " Admin password required."}
          </DialogPrimitiveDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
            {firestoreUser?.role === 'admin' && 
                <div className="space-y-1.5"><Label htmlFor="deleteAdminPasswordStaff">Admin's Current Password</Label><Input id="deleteAdminPasswordStaff" type="password" placeholder="Enter admin password" value={deleteAdminPassword} onChange={(e) => setDeleteAdminPassword(e.target.value)}/></div>
            }
        </div>
        <DialogFooter><DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose><Button type="button" variant="destructive" onClick={confirmDeleteStaffUser} disabled={isSubmitting || (firestoreUser?.role === 'admin' && !deleteAdminPassword.trim())}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete Staff Record</Button></DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}

    