
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
import { Loader2, Pencil, Trash2, UserPlus, Search, GraduationCap, NotebookPen } from 'lucide-react';
import type { User, Group, GradingConfiguration } from '@/types';
import { DEFAULT_GRADING_CONFIG, getDefaultStudentGradeStructure } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, query, where, writeBatch, arrayUnion, arrayRemove, limit } from 'firebase/firestore';
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
import { Textarea } from '@/components/ui/textarea';
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
  FormDescription,
} from '@/components/ui/form';
import { Label } from "@/components/ui/label";

const studentFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  username: z.string().min(3, "Username must be at least 3 characters.").regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, underscores, or hyphens."),
  email: z.string().email({message: "Please enter a valid email address."}),
  phoneNumber: z.string().optional().or(z.literal('')),
  photoUrl: z.string().url({ message: "Please enter a valid URL for photo." }).optional().or(z.literal('')),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Other'], {required_error: "Level is required."}),
  notes: z.string().optional(),
  age: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({ invalid_type_error: "Age must be a number." }).positive("Age must be positive.").int("Age must be an integer.").optional()
  ),
  gender: z.enum(['male', 'female', 'other']).optional(),
  preferredShift: z.enum(['Saturday', 'Sunday']).optional(),
  assignedGroupId: z.string().optional(),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

const UNASSIGN_STUDENT_FROM_GROUP_KEY = "##NO_GROUP##";

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

export default function StudentManagementPage() {
  const router = useRouter();
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [gradingConfig, setGradingConfig] = useState<GradingConfiguration>(DEFAULT_GRADING_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isStudentFormDialogOpen, setIsStudentFormDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<User | null>(null);

  const [isDeleteStudentDialogOpen, setIsDeleteStudentDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');

  const [selectedGroupIdForFilter, setSelectedGroupIdForFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [emailCheckStatus, setEmailCheckStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found' | 'error'>('idle');
  const [emailCheckMessage, setEmailCheckMessage] = useState<string | null>(null);
  const [usernameCheckStatus, setUsernameCheckStatus] = useState<'idle' | 'checking' | 'exists' | 'not_found' | 'error'>('idle');
  const [usernameCheckMessage, setUsernameCheckMessage] = useState<string | null>(null);


  const { toast } = useToast();
  const { reauthenticateCurrentUser, authUser, signUp: signUpUserInAuthContext, firestoreUser } = useAuth();

  const studentForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: '', username: '', email: '', phoneNumber: '', photoUrl: '',
      level: undefined, notes: '', age: undefined, gender: undefined, preferredShift: undefined,
      assignedGroupId: undefined,
    },
  });

  const resetFieldChecks = useCallback(() => {
    setEmailCheckStatus('idle');
    setEmailCheckMessage(null);
    setUsernameCheckStatus('idle');
    setUsernameCheckMessage(null);
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const configDocRef = doc(db, 'appConfiguration', 'currentGradingConfig');
      const configSnap = await getDoc(configDocRef);
      if (configSnap.exists()) {
        setGradingConfig(configSnap.data() as GradingConfiguration);
      } else {
        setGradingConfig(DEFAULT_GRADING_CONFIG);
      }

      const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'));
      const studentsSnapshot = await getDocs(studentsQuery);
      const fetchedStudents = studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));
      setAllStudents(fetchedStudents);

      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load students, groups, or grading config.', variant: 'destructive' });
      setAllStudents([]);
      setGroups([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredStudents = useMemo(() => {
    let studentsToDisplay = allStudents;
    if (selectedGroupIdForFilter !== 'all') {
      const group = groups.find(g => g.id === selectedGroupIdForFilter);
      if (group && Array.isArray(group.studentIds)) {
        studentsToDisplay = studentsToDisplay.filter(student => group.studentIds.includes(student.id));
      } else if (group) {
        studentsToDisplay = [];
      }
    }

    if (searchTerm) {
      studentsToDisplay = studentsToDisplay.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.username && student.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (student.preferredShift && student.preferredShift.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    return studentsToDisplay;
  }, [allStudents, groups, selectedGroupIdForFilter, searchTerm]);
  
  const canManageStudents = firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor' || firestoreUser?.role === 'teacher';

  const availableGroupsForAssignment = useMemo(() => {
    if (!firestoreUser || !groups.length) return [];
    if (firestoreUser.role === 'admin') {
      return groups;
    }
    if (firestoreUser.role === 'supervisor') {
      if (!firestoreUser.sedeId) return [];
      return groups.filter(g => g.sedeId === firestoreUser.sedeId);
    }
    if (firestoreUser.role === 'teacher') {
      return groups.filter(g => g.teacherId === firestoreUser.id);
    }
    return [];
  }, [groups, firestoreUser]);


  const handleOpenAddDialog = () => {
    setEditingStudent(null);
    studentForm.reset({
      name: '', username: '', email: '', phoneNumber: '', photoUrl: '',
      level: undefined, notes: '', age: undefined, gender: undefined, preferredShift: undefined,
      assignedGroupId: undefined,
    });
    resetFieldChecks();
    setIsStudentFormDialogOpen(true);
  };
  
  const handleOpenEditDialog = (studentToEdit: User) => {
    setEditingStudent(studentToEdit);
    const currentGroup = groups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(studentToEdit.id));
    studentForm.reset({
      name: studentToEdit.name,
      username: studentToEdit.username || '',
      email: studentToEdit.email || '',
      phoneNumber: studentToEdit.phoneNumber || '',
      photoUrl: studentToEdit.photoUrl || '',
      level: studentToEdit.level || undefined,
      notes: studentToEdit.notes || '',
      age: studentToEdit.age ?? undefined,
      gender: studentToEdit.gender || undefined,
      preferredShift: studentToEdit.preferredShift || undefined,
      assignedGroupId: currentGroup?.id || undefined,
    });
    resetFieldChecks();
    setIsStudentFormDialogOpen(true);
  };

  const checkUsernameExistence = useCallback(async (username: string) => {
    if (editingStudent && editingStudent.username === username) {
      setUsernameCheckStatus('idle'); setUsernameCheckMessage(null); return;
    }
    try {
      const q = query(collection(db, 'users'), where('username', '==', username.trim()), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setUsernameCheckStatus('exists'); setUsernameCheckMessage('Username already taken.');
      } else {
        setUsernameCheckStatus('not_found'); setUsernameCheckMessage('Username available.');
      }
    } catch (error) { setUsernameCheckStatus('error'); setUsernameCheckMessage('Error checking username.'); }
  }, [editingStudent]);

  const checkEmailExistenceInUsers = useCallback(async (email: string) => {
     if (editingStudent && editingStudent.email === email) {
      setEmailCheckStatus('idle'); setEmailCheckMessage(null); return;
    }
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.trim()), limit(1));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setEmailCheckStatus('exists'); setEmailCheckMessage('An account with this email already exists.');
      } else {
        setEmailCheckStatus('not_found'); setEmailCheckMessage('Email available.');
      }
    } catch (error) { setEmailCheckStatus('error'); setEmailCheckMessage('Error checking email.'); }
  }, [editingStudent]);

  const debouncedCheckUsername = useMemo(() => debounce(checkUsernameExistence, 600), [checkUsernameExistence]);
  const debouncedCheckEmail = useMemo(() => debounce(checkEmailExistenceInUsers, 600), [checkEmailExistenceInUsers]);

  const watchedUsername = studentForm.watch('username');
  const watchedEmail = studentForm.watch('email');

  useEffect(() => {
    if (isStudentFormDialogOpen && (!editingStudent || watchedUsername !== editingStudent.username)) {
      if (watchedUsername && watchedUsername.length >= 3) {
        setUsernameCheckStatus('checking'); setUsernameCheckMessage('Checking username...');
        debouncedCheckUsername(watchedUsername);
      } else if (watchedUsername) {
         setUsernameCheckStatus('idle'); setUsernameCheckMessage('Username must be at least 3 characters.');
      } else {
        resetFieldChecks();
      }
    }
  }, [watchedUsername, isStudentFormDialogOpen, editingStudent, debouncedCheckUsername, resetFieldChecks]);

  useEffect(() => {
    if (isStudentFormDialogOpen && (!editingStudent || watchedEmail !== editingStudent.email)) {
      if (watchedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(watchedEmail)) {
        setEmailCheckStatus('checking'); setEmailCheckMessage('Checking email...');
        debouncedCheckEmail(watchedEmail);
      } else if (watchedEmail) {
        setEmailCheckStatus('idle'); setEmailCheckMessage('Please enter a valid email.');
      } else {
        resetFieldChecks();
      }
    }
  }, [watchedEmail, isStudentFormDialogOpen, editingStudent, debouncedCheckEmail, resetFieldChecks]);


  const handleStudentFormSubmit = async (data: StudentFormValues) => {
    setIsSubmitting(true);

    if (!editingStudent) {
        if (usernameCheckStatus === 'exists') {
            toast({ title: 'Validation Error', description: 'Username already taken. Please choose another.', variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        if (emailCheckStatus === 'exists') {
            toast({ title: 'Validation Error', description: 'An account with this email already exists.', variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
    }

    const studentDataForFirestore: Partial<User> = {
      name: data.name,
      username: data.username,
      email: data.email,
      phoneNumber: data.phoneNumber || null,
      photoUrl: data.photoUrl || null,
      level: data.level,
      notes: data.notes || null,
      age: data.age,
      gender: data.gender,
      preferredShift: data.preferredShift,
      role: 'student',
    };
    
    const selectedGroupForStudent = availableGroupsForAssignment.find(g => g.id === data.assignedGroupId);

    if (firestoreUser?.role === 'teacher' || firestoreUser?.role === 'supervisor') {
        if (selectedGroupForStudent && selectedGroupForStudent.sedeId !== firestoreUser.sedeId && firestoreUser.role === 'supervisor') {
            toast({ title: "Validation Error", description: "Supervisors can only assign students to groups within their own Sede.", variant: "destructive" });
            setIsSubmitting(false);
            return;
        }
        if (selectedGroupForStudent && selectedGroupForStudent.teacherId !== firestoreUser.id && firestoreUser.role === 'teacher') {
            toast({ title: "Validation Error", description: "Teachers can only assign students to their own groups.", variant: "destructive" });
            setIsSubmitting(false);
            return;
        }
        // Implicitly set student's Sede if added by supervisor/teacher and not assigned to a group, or group has no Sede
        if (firestoreUser.sedeId && (!selectedGroupForStudent || !selectedGroupForStudent.sedeId)) {
             studentDataForFirestore.sedeId = firestoreUser.sedeId;
        } else if (selectedGroupForStudent?.sedeId) {
             studentDataForFirestore.sedeId = selectedGroupForStudent.sedeId;
        }
    } else if (firestoreUser?.role === 'admin' && selectedGroupForStudent?.sedeId) {
        studentDataForFirestore.sedeId = selectedGroupForStudent.sedeId;
    }


    const newAssignedGroupId = data.assignedGroupId === UNASSIGN_STUDENT_FROM_GROUP_KEY ? null : data.assignedGroupId || null;

    try {
      if (editingStudent) {
        const studentRef = doc(db, "users", editingStudent.id);
        const batch = writeBatch(db);
        const updateData: Partial<User> = { ...studentDataForFirestore };
        delete updateData.email; 
        delete updateData.username;
        
        batch.update(studentRef, updateData);

        const previousGroup = groups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(editingStudent.id));
        const previousGroupId = previousGroup?.id || null;

        if (newAssignedGroupId !== previousGroupId) {
          if (previousGroupId) {
            const prevGroupRef = doc(db, 'groups', previousGroupId);
            batch.update(prevGroupRef, { studentIds: arrayRemove(editingStudent.id) });
          }
          if (newAssignedGroupId) {
            const newGroupRef = doc(db, 'groups', newAssignedGroupId);
            batch.update(newGroupRef, { studentIds: arrayUnion(editingStudent.id) });
             // Update student's sedeId based on new group if admin is editing
            if (firestoreUser?.role === 'admin') {
                const groupDetails = groups.find(g => g.id === newAssignedGroupId);
                if (groupDetails?.sedeId) {
                    batch.update(studentRef, { sedeId: groupDetails.sedeId });
                }
            }
          } else if (firestoreUser?.role === 'admin') { // Unassigning
            batch.update(studentRef, { sedeId: null });
          }
        }
        await batch.commit();
        toast({ title: 'Student Updated', description: `${data.name}'s record and group assignment updated successfully.` });
      } else { 
        if (!data.username || !data.email || !data.level) {
          toast({ title: "Missing Information", description: "Username, Email, and Level are required.", variant: "destructive" });
          setIsSubmitting(false);
          return;
        }
        const studentDetailsForSignUp = { level: data.level, sedeId: studentDataForFirestore.sedeId };

        await signUpUserInAuthContext(
          data.name,
          data.username,
          data.email,
          data.username, 
          'student',
          studentDetailsForSignUp
        );
        
        const q = query(collection(db, "users"), where("email", "==", data.email), limit(1));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
            const newStudentDocId = querySnapshot.docs[0].id;
            if (newAssignedGroupId) {
                const groupRef = doc(db, 'groups', newAssignedGroupId);
                await updateDoc(groupRef, { studentIds: arrayUnion(newStudentDocId) });
            }
             toast({ title: 'Student Added', description: `${data.name} added. Login with username as password. Group assignment updated.` });
        } else {
            toast({ title: 'Student Added (Group Pending)', description: `${data.name} added. Login with username as password. Assign to group by editing.`, variant: 'default' });
        }
      }
      studentForm.reset();
      setEditingStudent(null);
      setIsStudentFormDialogOpen(false);
      resetFieldChecks();
      await fetchData();
    } catch (error: any) {
      console.error("Error student form submission:", error);
      let userMessage = editingStudent ? 'Update Student Failed' : 'Add Student Failed';
       if (error.code === 'auth/email-already-in-use') {
        userMessage = 'This email is already associated with a Firebase Authentication account.';
      } else if (error.code === 'auth/username-already-exists') {
        userMessage = 'This username is already in use in the system.';
      } else if (error.message) {
        userMessage += `: ${error.message}`;
      }
      toast({ title: 'Operation Failed', description: userMessage, variant: 'destructive'});
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (student: User) => {
    setStudentToDelete(student);
    setDeleteAdminPassword('');
    setIsDeleteStudentDialogOpen(true);
  };

  const confirmDeleteStudent = async () => {
    if (!studentToDelete || !authUser) return;
    if (!deleteAdminPassword && firestoreUser?.role === 'admin') { // Only admins require password for deletion
      toast({ title: 'Input Required', description: 'Admin password is required to delete.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (firestoreUser?.role === 'admin') {
        await reauthenticateCurrentUser(deleteAdminPassword);
      }
      
      const batch = writeBatch(db);
      const studentRef = doc(db, 'users', studentToDelete.id); 
      batch.delete(studentRef);

      const groupWithStudent = groups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(studentToDelete.id));
      if (groupWithStudent) {
        const groupRef = doc(db, 'groups', groupWithStudent.id);
        batch.update(groupRef, { studentIds: arrayRemove(studentToDelete.id) });
      }
      await batch.commit();
      toast({ title: 'Student Record Deleted', description: `${studentToDelete.name}'s Firestore record and group memberships removed. Auth account NOT deleted.` });
      
      setStudentToDelete(null);
      setDeleteAdminPassword('');
      setIsDeleteStudentDialogOpen(false);
      await fetchData();
    } catch (error: any) {
      let errorMessage = 'Failed to delete student record.';
       const reAuthErrorCodes = ['auth/wrong-password', 'auth/invalid-credential', 'auth/user-mismatch', 'auth/requires-recent-login'];
      if (firestoreUser?.role === 'admin' && reAuthErrorCodes.includes(error.code)) {
        errorMessage = `Admin re-authentication failed: ${error.message}.`;
      } else if (error.message) {
        errorMessage = error.message;
      }
      toast({ title: 'Delete Failed', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoToManageGrades = (studentId: string) => {
    router.push(`/grades-management?studentId=${studentId}`);
  };

  const getStudentGroupName = (studentId: string): string => {
    const group = groups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(studentId));
    return group ? group.name : "Unassigned";
  };

  if (isLoading && allStudents.length === 0 && groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" /> Student Management</CardTitle>
          <CardDescription>Manage student records, logins, and group assignments.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">Loading students and groups...</p>
        </CardContent>
      </Card>
    );
  }
  
  const getFieldCheckMessageColor = (status: 'idle' | 'checking' | 'exists' | 'not_found' | 'error') => {
    switch (status) {
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
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <CardTitle className="flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" /> Student Management</CardTitle>
                <CardDescription>Manage student records. Assign username/email for login. Students will use username as initial password.</CardDescription>
            </div>
            {canManageStudents && (
            <Dialog open={isStudentFormDialogOpen} onOpenChange={(isOpen) => {
                setIsStudentFormDialogOpen(isOpen);
                if (!isOpen) {
                  setEditingStudent(null);
                  studentForm.reset();
                  resetFieldChecks();
                }
            }}>
                <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-sm" onClick={handleOpenAddDialog}>
                    <UserPlus className="size-3.5" />
                    Add Student Record
                </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>{editingStudent ? 'Edit Student Record' : 'Add New Student Record'}</DialogTitle>
                    <DialogPrimitiveDescription>
                    {editingStudent ? "Update student's details and group assignment. Username and email cannot be changed here." : "Fill in student details. Username and Email are required for login. Username will be the initial password."}
                    </DialogPrimitiveDescription>
                </DialogHeader>
                <Form {...studentForm}>
                    <form onSubmit={studentForm.handleSubmit(handleStudentFormSubmit)} className="space-y-3 py-4 max-h-[70vh] overflow-y-auto pr-2">
                    <FormField control={studentForm.control} name="name" render={({ field }) => (
                        <FormItem><FormLabel>Full Name*</FormLabel><FormControl><Input placeholder="John Doe" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                     <FormField control={studentForm.control} name="username" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username (for login & initial password)*</FormLabel>
                          <FormControl><Input placeholder="johndoe123" {...field} disabled={!!editingStudent} /></FormControl>
                          {!editingStudent && usernameCheckMessage && (
                            <p className={`text-xs mt-1 ${getFieldCheckMessageColor(usernameCheckStatus)}`}>
                              {usernameCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
                              {usernameCheckMessage}
                            </p>
                          )}
                           {!!editingStudent && <FormDescription className="text-xs">Username cannot be changed for existing students here.</FormDescription>}
                          <FormMessage />
                        </FormItem>
                     )}/>
                    <FormField control={studentForm.control} name="email" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email (for login & password resets)*</FormLabel>
                          <FormControl><Input type="email" placeholder="john.doe@example.com" {...field} disabled={!!editingStudent} /></FormControl>
                          {!editingStudent && emailCheckMessage && (
                            <p className={`text-xs mt-1 ${getFieldCheckMessageColor(emailCheckStatus)}`}>
                              {emailCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
                              {emailCheckMessage}
                            </p>
                          )}
                          {!!editingStudent && <FormDescription className="text-xs">Email cannot be changed for existing students here.</FormDescription>}
                          <FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={studentForm.control} name="level" render={({ field }) => (
                        <FormItem><FormLabel>Level*</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined} defaultValue={field.value || undefined}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select student's level" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="Beginner">Beginner</SelectItem>
                                <SelectItem value="Intermediate">Intermediate</SelectItem>
                                <SelectItem value="Advanced">Advanced</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select><FormMessage />
                        </FormItem>
                    )}/>
                     <FormField control={studentForm.control} name="assignedGroupId" render={({ field }) => (
                          <FormItem><FormLabel>Assign to Group (Optional)</FormLabel>
                            <Select onValueChange={(value) => field.onChange(value === UNASSIGN_STUDENT_FROM_GROUP_KEY ? undefined : value)} value={field.value || UNASSIGN_STUDENT_FROM_GROUP_KEY}>
                              <FormControl><SelectTrigger><SelectValue placeholder="Select a group or unassign" /></SelectTrigger></FormControl>
                              <SelectContent>
                                <SelectItem value={UNASSIGN_STUDENT_FROM_GROUP_KEY}>Unassigned</SelectItem>
                                {availableGroupsForAssignment.map((group) => (<SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>))}
                              </SelectContent>
                            </Select>
                             {availableGroupsForAssignment.length === 0 && <FormDescription className="text-xs">No groups available for assignment based on your role/Sede.</FormDescription>}
                            <FormMessage />
                          </FormItem>
                     )}/>
                    <FormField control={studentForm.control} name="phoneNumber" render={({ field }) => (
                        <FormItem><FormLabel>Phone Number (Optional)</FormLabel><FormControl><Input type="tel" placeholder="e.g., 123-456-7890" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={studentForm.control} name="photoUrl" render={({ field }) => (
                        <FormItem><FormLabel>Photo URL (Optional)</FormLabel><FormControl><Input type="url" placeholder="https://placehold.co/100x100.png" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={studentForm.control} name="age" render={({ field }) => (
                        <FormItem><FormLabel>Age (Optional)</FormLabel><FormControl><Input type="number" placeholder="18" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={studentForm.control} name="gender" render={({ field }) => (
                        <FormItem><FormLabel>Gender (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="male">Male</SelectItem><SelectItem value="female">Female</SelectItem><SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select><FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={studentForm.control} name="preferredShift" render={({ field }) => (
                        <FormItem><FormLabel>Preferred Shift (Optional)</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select preferred shift" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="Saturday">Saturday</SelectItem><SelectItem value="Sunday">Sunday</SelectItem>
                            </SelectContent>
                          </Select><FormMessage />
                        </FormItem>
                    )}/>
                    <FormField control={studentForm.control} name="notes" render={({ field }) => (
                        <FormItem><FormLabel>Notes (Optional)</FormLabel><FormControl><Textarea placeholder="Any relevant notes..." {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <DialogFooter className="pt-4">
                        <DialogClose asChild><Button type="button" variant="outline" onClick={resetFieldChecks}>Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting || (!editingStudent && (usernameCheckStatus === 'exists' || emailCheckStatus === 'exists'))}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingStudent ? 'Save Changes' : 'Add Student Record'}
                        </Button>
                    </DialogFooter>
                    </form>
                </Form>
                </DialogContent>
            </Dialog>
            )}
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-[200px]">
                <Label htmlFor="group-filter">Filter by Group</Label>
                <Select value={selectedGroupIdForFilter} onValueChange={setSelectedGroupIdForFilter} disabled={isLoading}>
                    <SelectTrigger id="group-filter"><SelectValue placeholder="Select a group" /></SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all">All Students / Ungrouped</SelectItem>
                    {groups.map((group) => (<SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
                 <Label htmlFor="search-student">Search by Name, Username, or Shift</Label>
                 <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="search-student" type="search" placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-full"/>
                </div>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && filteredStudents.length === 0 && (
             <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="ml-2 text-sm text-muted-foreground">Loading students...</p>
             </div>
        )}
        <Table>
          <TableHeader><TableRow>
              <TableHead>Name</TableHead><TableHead>Username</TableHead><TableHead>Email</TableHead>
              <TableHead>Level</TableHead><TableHead>Assigned Group</TableHead>
              <TableHead>Phone</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(!isLoading && filteredStudents.length > 0) ? filteredStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell>{student.name}</TableCell>
                <TableCell>{student.username || 'N/A'}</TableCell>
                <TableCell>{student.email || 'N/A'}</TableCell>
                <TableCell>{student.level || 'N/A'}</TableCell>
                <TableCell><span className={`px-2 py-1 text-xs font-medium rounded-full ${getStudentGroupName(student.id) === "Unassigned" ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}`}>{getStudentGroupName(student.id)}</span></TableCell>
                <TableCell>{student.phoneNumber || 'N/A'}</TableCell>
                <TableCell className="space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => handleGoToManageGrades(student.id)} title="Manage Grades"><NotebookPen className="h-4 w-4" /><span className="sr-only">Manage Grades</span></Button>
                  {canManageStudents && (
                    <>
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(student)} title="Edit Student"><Pencil className="h-4 w-4" /><span className="sr-only">Edit Student</span></Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(student)} title="Delete Student"><Trash2 className="h-4 w-4" /><span className="sr-only">Delete Student</span></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            )) : (
              !isLoading && (
                <TableRow><TableCell colSpan={9} className="text-center py-10">
                    {allStudents.length === 0 && selectedGroupIdForFilter === 'all' && !searchTerm ? (
                      <div><p className="text-lg font-semibold">No student records found.</p><p className="text-muted-foreground mt-2">Add new student records to see them here.</p>
                      {canManageStudents && 
                        <Button className="mt-6" onClick={handleOpenAddDialog}><UserPlus className="mr-2 h-4 w-4" /> Add First Student Record</Button>
                      }
                      </div>
                    ) : (<p>No students found matching your current filter criteria.</p>)}
                </TableCell></TableRow>
              ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
    <Dialog open={isDeleteStudentDialogOpen} onOpenChange={(isOpen) => { if (!isOpen) { setStudentToDelete(null); setDeleteAdminPassword(''); } setIsDeleteStudentDialogOpen(isOpen); }}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Delete Student Record</DialogTitle>
                <DialogPrimitiveDescription>Are you sure you want to delete the Firestore record for {studentToDelete?.name}? Admin password required for Admins. Auth account NOT deleted.</DialogPrimitiveDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                 {firestoreUser?.role === 'admin' && (
                  <div className="space-y-1.5"><Label htmlFor="deleteAdminPasswordStudent">Admin's Current Password</Label><Input id="deleteAdminPasswordStudent" type="password" placeholder="Enter admin password" value={deleteAdminPassword} onChange={(e) => setDeleteAdminPassword(e.target.value)}/></div>
                 )}
            </div>
            <DialogFooter>
                <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                <Button type="button" variant="destructive" onClick={confirmDeleteStudent} disabled={isSubmitting || (firestoreUser?.role === 'admin' && !deleteAdminPassword.trim())}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Delete Student Record
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}

    