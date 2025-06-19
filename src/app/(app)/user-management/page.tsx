
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
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found' | 'error'>('idle');
  const [usernameCheckMessage, setUsernameCheckMessage] = useState<string | null>(null);

  const { toast } = useToast();
  const { reauthenticateCurrentUser, authUser, firestoreUser, signUp: signUpInAuthContext } = useAuth();

  const form = useForm<StaffFormValues>({
    resolver: zodResolver(staffFormSchema),
    defaultValues: {
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: '',
    },
  });
  
  const resetFieldChecks = useCallback(() => {
    setEmailCheckStatus('idle'); setEmailCheckMessage(null);
    setUsernameCheckStatus('idle'); setUsernameCheckMessage(null);
  }, []);

  const resetEmailCheck = useCallback(() => {
    setEmailCheckStatus('idle');
    setEmailCheckMessage(null);
  }, []);

  const fetchData = useCallback(async () => {
    if (!firestoreUser?.institutionId) {
        setIsLoading(false);
        if(firestoreUser) toast({ title: "No Institution ID", description: "Cannot fetch staff data without an institution context.", variant: "destructive"});
        return;
    }
    setIsLoading(true);
    try {
      const usersQuery = query(collection(db, 'users'), 
        where('role', '!=', 'student'),
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const usersSnapshotPromise = getDocs(usersQuery);
      
      // Fetch groups and sedes belonging to the same institution
      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', firestoreUser.institutionId));
      const groupsSnapshotPromise = getDocs(groupsQuery);

      const sedesQuery = query(collection(db, 'sedes'), where('institutionId', '==', firestoreUser.institutionId));
      const sedesSnapshotPromise = getDocs(sedesQuery);


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
      toast({ title: 'Error fetching data', description: 'Could not load staff users, groups, or sedes for your institution.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [toast, firestoreUser]); 

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const checkUsernameExistence = useCallback(async (username: string) => {
    if (editingStaff && editingStaff.username === username) {
      setUsernameCheckStatus('idle'); setUsernameCheckMessage(null); return;
    }
    setUsernameCheckStatus('checking'); setUsernameCheckMessage('Checking username...');
    try {
      // Check within the same institution
      const q = query(collection(db, 'users'), 
        where('username', '==', username.trim()), 
        where('institutionId', '==', firestoreUser?.institutionId), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setUsernameCheckStatus('exists'); setUsernameCheckMessage('Username already taken in this institution.');
      } else {
        setUsernameCheckStatus('not_found'); setUsernameCheckMessage('Username available.');
      }
    } catch (error) { setUsernameCheckStatus('error'); setUsernameCheckMessage('Error checking username.'); }
  }, [editingStaff, firestoreUser?.institutionId]);

  const checkEmailExistence = useCallback(async (email: string) => {
     if (editingStaff && editingStaff.email === email) {
      setEmailCheckStatus('idle'); setEmailCheckMessage(null); return;
    }
    setEmailCheckStatus('checking'); setEmailCheckMessage(`Verifying email...`);
    try {
       // Check within the same institution
      const q = query(collection(db, 'users'), 
        where('email', '==', email.trim()),
        where('institutionId', '==', firestoreUser?.institutionId), 
        limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setEmailCheckStatus('exists');
        setEmailCheckMessage(`An account with this email already exists in this institution's Firestore.`);
      } else {
        // Also check Firebase Auth globally, as emails must be unique there
        const globalEmailAuthQuery = query(collection(db, 'users'), where('email', '==', email.trim()), limit(1));
        const globalAuthSnapshot = await getDocs(globalEmailAuthQuery);
        if (!globalAuthSnapshot.empty && globalAuthSnapshot.docs[0].data().institutionId !== firestoreUser?.institutionId) {
            setEmailCheckStatus('exists');
            setEmailCheckMessage(`This email is registered to another institution.`);
        } else if (!globalAuthSnapshot.empty && globalAuthSnapshot.docs[0].data().institutionId === firestoreUser?.institutionId) {
             setEmailCheckStatus('exists'); // Should have been caught by first query
             setEmailCheckMessage(`An account with this email already exists in this institution's Firestore.`);
        } else {
            setEmailCheckStatus('not_found');
            setEmailCheckMessage(`Email available.`);
        }
      }
    } catch (error) {
      console.error("Error checking email existence:", error);
      setEmailCheckStatus('error');
      setEmailCheckMessage('Error verifying email. Please try again.');
    }
  }, [editingStaff, firestoreUser?.institutionId]);

  const debouncedCheckUsername = useMemo(() => debounce(checkUsernameExistence, 700), [checkUsernameExistence]);
  const debouncedCheckEmail = useMemo(() => debounce(checkEmailExistence, 700), [checkEmailExistence]);
  
  const canAddStaff = useMemo(() => firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor', [firestoreUser]);

  const watchedUsername = form.watch('username');
  const watchedEmailValue = form.watch('email');

  useEffect(() => {
    if (isStaffFormDialogOpen && watchedUsername && (!editingStaff || watchedUsername !== editingStaff.username)) {
        if (watchedUsername.length >= 3) debouncedCheckUsername(watchedUsername);
        else { setUsernameCheckStatus('idle'); setUsernameCheckMessage('Username must be at least 3 characters.'); }
    } else if (!watchedUsername && isStaffFormDialogOpen) {
      resetFieldChecks();
    }
  }, [watchedUsername, isStaffFormDialogOpen, editingStaff, debouncedCheckUsername, resetFieldChecks]);

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
    if (!firestoreUser || !firestoreUser.institutionId) return []; 
    let filtered = staffUsers.filter(staff => staff.institutionId === firestoreUser.institutionId);

    if (firestoreUser.role === 'supervisor') {
        // Supervisors see all teachers in their Sede, and themselves.
        // They can also see other supervisors and admins of the same institution, but with limited actions.
        filtered = staffUsers.filter(staff => 
            (staff.sedeId === firestoreUser.sedeId && staff.role === 'teacher') || // Teachers in their Sede
            staff.id === firestoreUser.id || // Themselves
            (staff.institutionId === firestoreUser.institutionId && (staff.role === 'supervisor' || staff.role === 'admin' || staff.role === 'caja')) // Other non-teacher staff in institution
        );
    }
    // Admins see all staff within their institution (already filtered above).
    return filtered;
  }, [staffUsers, firestoreUser]);

  const getSedeName = useCallback((sedeId?: string | null) => {
    if (!sedeId) return 'N/A';
    const sede = allSedes.find(s => s.id === sedeId); // allSedes is already filtered by institution
    return sede ? sede.name : 'Unknown Sede';
  }, [allSedes]);
  
  const availableSedesForAssignment = useMemo(() => {
    if (!firestoreUser || !firestoreUser.institutionId) return [];
    // Admins can assign to any Sede within their institution
    // Supervisors can only assign to their own Sede
    if (firestoreUser.role === 'supervisor') {
        return allSedes.filter(s => s.id === firestoreUser.sedeId);
    }
    return allSedes; // allSedes is already filtered by admin's institution
  }, [allSedes, firestoreUser]);
  
  const availableGroupsForTeacherAssignment = useMemo(() => {
     if (!firestoreUser || !firestoreUser.institutionId) return [];
    // Admins can assign to any group within their institution's Sedes
    // Supervisors can assign to any group within their Sede
    if (firestoreUser.role === 'supervisor') {
        return allGroups.filter(g => g.sedeId === firestoreUser.sedeId); // allGroups is already filtered by institution
    }
    return allGroups; // allGroups is already filtered by institution
  }, [allGroups, firestoreUser]);

  const watchedRole = form.watch('role');


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

  if (!firestoreUser) { 
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Staff Management</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Verifying user role...</p>
        </CardContent>
      </Card>
    );
  }

  if (firestoreUser.role !== 'admin' && firestoreUser.role !== 'supervisor') {
    return (
      <Card>
        <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
        <CardContent><p>You do not have permission to manage Staff.</p></CardContent>
      </Card>
    );
  }
  if (!firestoreUser.institutionId && !isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Institution Not Set</CardTitle></CardHeader>
        <CardContent><p>Your account is not associated with an institution. Please contact platform support.</p></CardContent>
      </Card>
    );
  }


  const handleOpenAddDialog = () => {
    setEditingStaff(null);
    const defaultValues: StaffFormValues = {
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '',
      sedeId: firestoreUser?.role === 'supervisor' ? (firestoreUser.sedeId || '') : '', // Pre-fill Sede for supervisor
    };
    if (firestoreUser?.role === 'supervisor') {
      defaultValues.role = 'teacher'; 
    }
    form.reset(defaultValues);
    resetFieldChecks();
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
    resetFieldChecks();
    setIsStaffFormDialogOpen(true);
  };

  const handleStaffFormSubmit = async (data: StaffFormValues) => {
    setIsSubmitting(true);
    if (!firestoreUser?.institutionId) {
        toast({ title: "Error", description: "Your account is not linked to an institution.", variant: "destructive"});
        setIsSubmitting(false); return;
    }
    if (!data.email || !data.username) {
        toast({ title: 'Email and Username Required', description: 'Email and Username are required for all staff members.', variant: 'destructive' });
        setIsSubmitting(false); return;
    }
    
    if (!editingStaff) {
        if (usernameCheckStatus === 'exists') {
            toast({ title: 'Validation Error', description: 'Username already taken in this institution. Please choose another.', variant: 'destructive' });
            setIsSubmitting(false); return;
        }
        if (emailCheckStatus === 'exists') {
            toast({ title: 'Email Exists', description: `An account with email ${data.email} already exists in this institution or globally.`, variant: 'destructive' });
            setIsSubmitting(false); return;
        }
    }
    
    if (firestoreUser?.role === 'supervisor') {
        if (!editingStaff && data.role !== 'teacher') { 
            toast({ title: "Action Denied", description: "Supervisors can only add users with the 'Teacher' role.", variant: "destructive" });
            setIsSubmitting(false); return;
        }
        if (data.sedeId !== firestoreUser.sedeId && (data.role === 'teacher' || data.role === 'supervisor')) {
             // Supervisors can only manage staff within their own Sede.
            toast({ title: "Action Denied", description: `Staff must be assigned to your Sede (${getSedeName(firestoreUser.sedeId)}).`, variant: "destructive" });
            setIsSubmitting(false); return;
        }
    }

    let staffMemberId: string | undefined = editingStaff?.id;
    const staffDetailsForAuthContext = {
        sedeId: (data.role === 'teacher' || data.role === 'supervisor' || data.role === 'admin') ? (data.sedeId === UNASSIGN_VALUE_KEY ? undefined : data.sedeId || undefined) : undefined,
        attendanceCode: (data.role === 'teacher' || data.role === 'admin' || data.role === 'supervisor') ? data.attendanceCode : undefined,
        institutionId: firestoreUser.institutionId, // Pass institutionId from logged-in admin/supervisor
    };

    try {
      if (editingStaff) {
        const staffRef = doc(db, 'users', editingStaff.id);
        const updateData: Partial<User> = {
            name: data.name,
            phoneNumber: data.phoneNumber || null,
            role: data.role,
            photoUrl: data.photoUrl || null,
            attendanceCode: (data.role === 'teacher' || data.role === 'admin' || data.role === 'supervisor') ? (data.attendanceCode || null) : null,
            sedeId: (data.role === 'teacher' || data.role === 'supervisor' || data.role === 'admin') ? (data.sedeId === UNASSIGN_VALUE_KEY ? null : data.sedeId || null) : null,
            institutionId: firestoreUser.institutionId, // Ensure institutionId is maintained
        };
        await updateDoc(staffRef, updateData);
        staffMemberId = editingStaff.id;
        toast({ title: 'Staff User Updated', description: `${data.name}'s Firestore record updated successfully.` });

      } else { 
        await signUpInAuthContext(
            data.name,
            data.username,
            data.email,
            data.username, 
            data.role,
            undefined, 
            staffDetailsForAuthContext
        );
        const q = query(collection(db, "users"), where("email", "==", data.email), where("institutionId", "==", firestoreUser.institutionId), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            staffMemberId = querySnapshot.docs[0].id;
        } else {
             throw new Error("Could not retrieve newly created staff user from Firestore within the institution.");
        }
        toast({
          title: 'Staff User Added',
          description: `${data.name}'s record and Auth account created. They will be prompted to change password (which is their username) on first login.`
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
            const groupDoc = allGroups.find(g => g.id === newlySelectedGroupId); // allGroups is already filtered by institution
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
      } else if (staffMemberId && data.role !== 'teacher') { // If role is not teacher, unassign from any group
        const previouslyAssignedGroup = allGroups.find(g => g.teacherId === staffMemberId);
        if (previouslyAssignedGroup) {
          const groupRef = doc(db, 'groups', previouslyAssignedGroup.id);
          await updateDoc(groupRef, { teacherId: null });
        }
      }

      if (staffMemberId && data.role === 'supervisor') {
          const newSedeId = data.sedeId === UNASSIGN_VALUE_KEY ? null : data.sedeId || null;
          if (newSedeId) {
              const sedeRef = doc(db, 'sedes', newSedeId);
              const currentSedeDoc = allSedes.find(s => s.id === newSedeId); // allSedes is institution-filtered
              if (currentSedeDoc?.supervisorId !== staffMemberId) {
                 const batch = writeBatch(db);
                 batch.update(sedeRef, { supervisorId: staffMemberId });
                 const oldSedeSupervised = allSedes.find(s => s.supervisorId === staffMemberId && s.id !== newSedeId);
                 if (oldSedeSupervised) {
                     batch.update(doc(db, 'sedes', oldSedeSupervised.id), {supervisorId: null});
                 }
                 await batch.commit();
              }
          } else {
             const oldSedeSupervised = allSedes.find(s => s.supervisorId === staffMemberId);
             if (oldSedeSupervised) {
                 await updateDoc(doc(db, 'sedes', oldSedeSupervised.id), {supervisorId: null});
             }
          }
      }


      form.reset({ name: '', username:'', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', sedeId: firestoreUser?.role === 'supervisor' ? (firestoreUser.sedeId || '') : '' });
      setEditingStaff(null);
      setIsStaffFormDialogOpen(false);
      resetFieldChecks();
      await fetchData();
    } catch (error: any) {
      let userMessage = editingStaff ? 'Update Failed' : 'Add Failed';
      if (error.code === 'auth/email-already-in-use') userMessage = 'This email is already associated with a Firebase Authentication account globally.';
      else if (error.code === 'auth/username-already-exists') userMessage = 'This username is already in use in this institution.';
      else if (error.code === 'auth/weak-password') userMessage = 'Password is too weak (must be at least 6 characters for Firebase Auth).';
      else if (error.message) userMessage += `: ${error.message}`;
      
      toast({ title: 'Operation Failed', description: userMessage, variant: 'destructive'});
      console.error("Form submission error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (staffMember: User) => {
    if (firestoreUser?.role === 'supervisor' && (staffMember.role !== 'teacher' || staffMember.sedeId !== firestoreUser.sedeId)) {
        toast({ title: "Permission Denied", description: "Supervisors can only delete teachers within their own Sede.", variant: "destructive" });
        return;
    }
    if (staffMember.institutionId !== firestoreUser?.institutionId) {
        toast({ title: "Permission Denied", description: "Cannot delete staff from another institution.", variant: "destructive" });
        return;
    }
    setStaffToDelete(staffMember);
    setDeleteAdminPassword('');
    setIsDeleteStaffDialogOpen(true);
  };

  const handleSendPasswordReset = async (staffEmail: string | null | undefined, staffName: string) => {
    if (!staffEmail) {
      toast({ title: 'Cannot Reset Password', description: `User ${staffName} does not have an email address registered.`, variant: 'destructive'});
      return;
    }
    setIsSendingResetEmail(staffEmail);
    try {
      await sendPasswordResetEmail(auth, staffEmail);
      toast({ title: 'Password Reset Email Sent', description: `An email has been sent to ${staffEmail} to reset their password.`});
    } catch (error: any) {
      console.error("Password reset error:", error);
      let errorMessage = "Failed to send password reset email.";
      if (error.code === 'auth/user-not-found') errorMessage = `No Firebase Authentication account found for ${staffEmail}. They might need to be added first or there's a typo.`;
      else if (error.code === 'auth/invalid-email') errorMessage = `The email address ${staffEmail} is not valid.`;
      else errorMessage = `Error: ${error.message} (Code: ${error.code})`;
      toast({ title: 'Password Reset Failed', description: errorMessage, variant: 'destructive'});
    } finally {
      setIsSendingResetEmail(null);
    }
  };

  const confirmDeleteStaffUser = async () => {
    if (!staffToDelete || !authUser || !firestoreUser || staffToDelete.institutionId !== firestoreUser.institutionId) {
        toast({ title: "Error", description: "Cannot proceed with deletion due to permission or data mismatch.", variant: "destructive"});
        return;
    }
    
    const isAdminDeleting = firestoreUser.role === 'admin';
    const isSupervisorDeleting = firestoreUser.role === 'supervisor';

    if (isAdminDeleting && !deleteAdminPassword) {
      toast({ title: 'Input Required', description: 'Admin password is required to delete.', variant: 'destructive' });
      return;
    }
    if (isSupervisorDeleting && staffToDelete.role !== 'teacher') {
        toast({ title: "Action Denied", description: "Supervisors can only delete teachers.", variant: "destructive" });
        return;
    }
    if (isSupervisorDeleting && staffToDelete.sedeId !== firestoreUser.sedeId) {
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
        const assignedGroup = allGroups.find(g => g.teacherId === staffToDelete.id && g.institutionId === firestoreUser.institutionId);
        if (assignedGroup) {
            const groupRef = doc(db, 'groups', assignedGroup.id);
            batch.update(groupRef, { teacherId: null });
        }
      }
      if (staffToDelete.role === 'supervisor') {
        const assignedSede = allSedes.find(s => s.supervisorId === staffToDelete.id && s.institutionId === firestoreUser.institutionId);
        if (assignedSede) {
            const sedeRef = doc(db, 'sedes', assignedSede.id);
            batch.update(sedeRef, { supervisorId: null });
        }
      }
      
      await batch.commit();

      toast({ title: 'Staff User Record Deleted', description: `${staffToDelete.name}'s Firestore record removed. Firebase Auth account (if any) is NOT deleted by this action.` });

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

  const getEmailCheckMessageColor = () => {
    switch (emailCheckStatus) {
      case 'checking': return 'text-muted-foreground';
      case 'exists': return 'text-orange-600 dark:text-orange-400';
      case 'not_found': return 'text-green-600 dark:text-green-400';
      case 'error': return 'text-destructive';
      default: return 'text-muted-foreground';
    }
  };

  const getUsernameCheckMessageColor = () => {
    switch (usernameCheckStatus) {
        case 'checking': return 'text-muted-foreground';
        case 'exists': return 'text-destructive';
        case 'not_found': return 'text-green-600 dark:text-green-400';
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
          <CardDescription>
            {firestoreUser?.role === 'supervisor' 
              ? "Manage teachers within your Sede. New staff use username as temporary password and change it on first login."
              : "Manage all staff accounts for your institution. New staff use username as temporary password and change it on first login."
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
                  name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '', 
                  sedeId: firestoreUser?.role === 'supervisor' ? (firestoreUser.sedeId || '') : '',
              });
              resetFieldChecks();
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
                  {editingStaff ? "Update staff details." : "Fill in staff details. Username will be the initial password. Staff will be prompted to change it on first login."}
                </DialogPrimitiveDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleStaffFormSubmit)} className="space-y-3 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem><FormLabel>Full Name*</FormLabel><FormControl><Input placeholder="Jane Doe" {...field} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="username" render={({ field }) => (
                      <FormItem><FormLabel>Username (for login & initial password)*</FormLabel><FormControl><Input placeholder="janedoe_staff" {...field} disabled={!!editingStaff} /></FormControl>
                      {!editingStaff && usernameCheckMessage && (
                        <p className={`text-xs mt-1 ${getUsernameCheckMessageColor()}`}>
                            {usernameCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
                            {usernameCheckMessage}
                        </p>
                      )}
                      {!!editingStaff && <p className="text-xs text-muted-foreground mt-1">Username cannot be changed.</p>}
                      <FormMessage />
                      </FormItem>
                  )}/>
                  <FormField control={form.control} name="email" render={({ field }) => (
                      <FormItem><FormLabel>Email (for login & password resets)*</FormLabel>
                          <FormControl><Input type="email" placeholder="jane.doe@example.com" {...field} disabled={!!editingStaff} /></FormControl>
                          {!!editingStaff && <p className="text-xs text-muted-foreground mt-1">Email cannot be changed.</p>}
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
                            (!!editingStaff && editingStaff.role === 'admin' && authUser?.uid === editingStaff.id && editingStaff.institutionId === firestoreUser?.institutionId) || // Admin cannot change own role
                            (firestoreUser?.role === 'supervisor' && (!editingStaff || editingStaff.role !== 'teacher')) // Supervisor can only manage teachers
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
                        {!!editingStaff && editingStaff.role === 'admin' && authUser?.uid === editingStaff.id && editingStaff.institutionId === firestoreUser?.institutionId && <p className="text-xs text-muted-foreground mt-1">Admins cannot change their own role.</p>}
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
                              disabled={firestoreUser?.role === 'supervisor'} // Supervisor's staff automatically assigned to their Sede
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
                  {(watchedRole === 'teacher') && ( 
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
                    <DialogClose asChild><Button type="button" variant="outline" onClick={resetFieldChecks}>Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isSubmitting || (!editingStaff && (usernameCheckStatus === 'exists' || emailCheckStatus === 'exists')) }>
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
                  assignmentDisplay = staffSedeName !== 'N/A' ? `${staffSedeName} (Sede)` : (staff.role === 'admin' ? 'Global Admin (No Sede Specific)' : 'Unassigned');
              } else if (staff.role === 'caja') {
                  assignmentDisplay = staffSedeName !== 'N/A' ? `${staffSedeName} (Sede)` : 'N/A (No Sede Specific)';
              }
              
              const canEditThisStaff = (firestoreUser?.role === 'admin' && staff.institutionId === firestoreUser.institutionId) || 
                                     (firestoreUser?.role === 'supervisor' && staff.role === 'teacher' && staff.sedeId === firestoreUser.sedeId && staff.institutionId === firestoreUser.institutionId);
              
              // Admin cannot delete themselves. Supervisor cannot delete other supervisors or admins.
              const canDeleteThisStaff = (firestoreUser?.role === 'admin' && staff.id !== authUser?.uid && staff.institutionId === firestoreUser.institutionId) ||
                                       (firestoreUser?.role === 'supervisor' && staff.role === 'teacher' && staff.sedeId === firestoreUser.sedeId && staff.institutionId === firestoreUser.institutionId);

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
                  <Button variant="ghost" size="icon" className="mr-1" onClick={() => handleSendPasswordReset(staff.email, staff.name)} disabled={!staff.email || isSendingResetEmail === staff.email} title={staff.email ? "Send Password Reset Email" : "Cannot reset (no email)"}><KeyRound className="h-4 w-4" /><span className="sr-only">Send Password Reset</span></Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(staff)} title="Delete User"
                    disabled={!canDeleteThisStaff}
                  ><Trash2 className="h-4 w-4" /><span className="sr-only">Delete</span></Button>
                </TableCell>
              </TableRow>
            )}) : (!isLoading && (<TableRow><TableCell colSpan={7} className="text-center">
                {firestoreUser?.role === 'supervisor' && displayedStaffUsers.length === 0 ? "No teachers found in your Sede." : "No staff users found for your institution." }
                </TableCell></TableRow>))}
          </TableBody>
        </Table>
         {isLoading && displayedStaffUsers.length === 0 && (<div className="text-center py-4 text-sm text-muted-foreground">Loading staff user data...</div>)}
      </CardContent>
    </Card>

    <Dialog open={isDeleteStaffDialogOpen} onOpenChange={(isOpen) => { setIsDeleteStaffDialogOpen(isOpen); if (!isOpen) { setStaffToDelete(null); setDeleteAdminPassword('');}}}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Delete Staff User Record</DialogTitle>
          <DialogPrimitiveDescription>Are you sure you want to delete {staffToDelete?.name}? This only removes the Firestore record. Firebase Auth account (if any) is NOT deleted by this action.
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
