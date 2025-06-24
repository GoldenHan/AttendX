
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
import { Loader2, Pencil, Trash2, UserPlus, Search, GraduationCap, NotebookPen, User as UserProfileIcon } from 'lucide-react';
import type { User, Group, GradingConfiguration, Sede } from '@/types';
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
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allSedes, setAllSedes] = useState<Sede[]>([]);
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

  const fetchData = useCallback(async () => {
    if (!firestoreUser || !firestoreUser.institutionId) {
        setIsLoading(false);
        if (firestoreUser) toast({ title: "Error", description: "No institution context found for your account.", variant: "destructive"});
        return;
    }
    setIsLoading(true);
    try {
      const configDocRef = doc(db, 'appConfiguration', 'currentGradingConfig');
      const configSnap = await getDoc(configDocRef);
      if (configSnap.exists()) {
        setGradingConfig(configSnap.data() as GradingConfiguration);
      } else {
        setGradingConfig(DEFAULT_GRADING_CONFIG);
      }

      const studentsQuery = query(collection(db, 'users'), 
        where('role', '==', 'student'),
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      const fetchedStudents = studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));
      setAllStudents(fetchedStudents);

      const groupsQuery = query(collection(db, 'groups'), 
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const groupsSnapshot = await getDocs(groupsQuery);
      setAllGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
      
      const sedesQuery = query(collection(db, 'sedes'), where('institutionId', '==', firestoreUser.institutionId));
      const sedesSnapshot = await getDocs(sedesQuery);
      setAllSedes(sedesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Sede)));

    } catch (error) {
      console.error("Error fetching data for student management:", error);
      toast({ title: 'Error fetching data', description: 'Could not load students or groups for your institution.', variant: 'destructive' });
      setAllStudents([]);
      setAllGroups([]);
    } finally {
      setIsLoading(false);
    }
  }, [firestoreUser, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const canEditOrAddStudents = firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor' || firestoreUser?.role === 'teacher';

  const availableGroupsForAssignment = useMemo(() => {
    if (!firestoreUser || !allGroups.length) return [];
    if (firestoreUser.role === 'admin') {
      return allGroups; // Admins see all groups of their institution
    }
    if (firestoreUser.role === 'supervisor') {
      if (!firestoreUser.sedeId) return []; // Supervisor must have a Sede
      return allGroups.filter(g => g.sedeId === firestoreUser.sedeId);
    }
    if (firestoreUser.role === 'teacher') {
      return allGroups.filter(g => g.teacherId === firestoreUser.id);
    }
    return [];
  }, [allGroups, firestoreUser]);


  const filteredStudents = useMemo(() => {
    if (!firestoreUser) return [];
    let studentsToDisplay = allStudents;

    if (firestoreUser.role === 'teacher') {
      const studentIdsInTeacherGroups = new Set<string>();
      availableGroupsForAssignment.forEach(group => {
          if (Array.isArray(group.studentIds)) {
              group.studentIds.forEach(id => studentIdsInTeacherGroups.add(id));
          }
      });
      studentsToDisplay = studentsToDisplay.filter(student => studentIdsInTeacherGroups.has(student.id));
    } else if (firestoreUser.role === 'supervisor') {
        if(!firestoreUser.sedeId) return []; 
        if (selectedGroupIdForFilter !== 'all') {
            const group = allGroups.find(g => g.id === selectedGroupIdForFilter);
            if (group && Array.isArray(group.studentIds) && group.sedeId === firestoreUser.sedeId) {
                studentsToDisplay = studentsToDisplay.filter(student => group.studentIds.includes(student.id));
            } else {
                studentsToDisplay = [];
            }
        } else { 
            studentsToDisplay = studentsToDisplay.filter(student => student.sedeId === firestoreUser.sedeId);
        }
    } else { 
        if (selectedGroupIdForFilter !== 'all') {
            const group = allGroups.find(g => g.id === selectedGroupIdForFilter);
            if (group && Array.isArray(group.studentIds)) {
                studentsToDisplay = studentsToDisplay.filter(student => group.studentIds.includes(student.id));
            } else if (group) {
                 studentsToDisplay = [];
            }
        }
    }

    if (searchTerm.trim() !== '') {
      studentsToDisplay = studentsToDisplay.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.username && student.username.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (student.preferredShift && student.preferredShift.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    return studentsToDisplay;
  }, [allStudents, allGroups, selectedGroupIdForFilter, searchTerm, firestoreUser, availableGroupsForAssignment]);


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
    const currentGroup = allGroups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(studentToEdit.id));
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
    if (!firestoreUser?.institutionId) return;
    if (editingStudent && editingStudent.username === username) {
      setUsernameCheckStatus('idle'); setUsernameCheckMessage(null); return;
    }
    setUsernameCheckStatus('checking'); setUsernameCheckMessage('Checking username...');
    try {
      const q = query(collection(db, 'users'), 
        where('username', '==', username.trim()), 
        where('institutionId', '==', firestoreUser.institutionId), 
        limit(1)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        setUsernameCheckStatus('exists'); setUsernameCheckMessage('Username already taken in this institution.');
      } else {
        setUsernameCheckStatus('not_found'); setUsernameCheckMessage('Username available.');
      }
    } catch (error) { setUsernameCheckStatus('error'); setUsernameCheckMessage('Error checking username.'); }
  }, [editingStudent, firestoreUser?.institutionId]);

  const checkEmailExistenceInUsers = useCallback(async (email: string) => {
    if (!firestoreUser?.institutionId) return;
     if (editingStudent && editingStudent.email === email) {
      setEmailCheckStatus('idle'); setEmailCheckMessage(null); return;
    }
    setEmailCheckStatus('checking'); setEmailCheckMessage('Checking email...');
    try {
      const qFirestore = query(collection(db, 'users'), 
        where('email', '==', email.trim()),
        where('institutionId', '==', firestoreUser.institutionId),
        limit(1)
      );
      const snapshotFirestore = await getDocs(qFirestore);
      if(!snapshotFirestore.empty) {
        setEmailCheckStatus('exists'); setEmailCheckMessage('Email already used for a user in this institution.');
        return;
      }
      setEmailCheckStatus('not_found'); setEmailCheckMessage('Email appears available.');

    } catch (error) { setEmailCheckStatus('error'); setEmailCheckMessage('Error checking email.'); }
  }, [editingStudent, firestoreUser?.institutionId]);

  const debouncedCheckUsername = useMemo(() => debounce(checkUsernameExistence, 600), [checkUsernameExistence]);
  const debouncedCheckEmail = useMemo(() => debounce(checkEmailExistenceInUsers, 600), [checkEmailExistenceInUsers]);

  const watchedUsername = studentForm.watch('username');
  const watchedEmail = studentForm.watch('email');

  useEffect(() => {
    if (isStudentFormDialogOpen && (!editingStudent || watchedUsername !== editingStudent.username)) {
      if (watchedUsername && watchedUsername.length >= 3) {
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
        debouncedCheckEmail(watchedEmail);
      } else if (watchedEmail) {
        setEmailCheckStatus('idle'); setEmailCheckMessage('Please enter a valid email.');
      } else {
        resetFieldChecks();
      }
    }
  }, [watchedEmail, isStudentFormDialogOpen, editingStudent, debouncedCheckEmail, resetFieldChecks]);


  const handleStudentFormSubmit = async (data: StudentFormValues) => {
    if (!firestoreUser?.institutionId) {
      toast({ title: "Error", description: "Cannot process request without institution context.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);

    if (!editingStudent) { 
        if (usernameCheckStatus === 'exists') {
            toast({ title: 'Validation Error', description: 'Username already taken in this institution. Please choose another.', variant: 'destructive' });
            setIsSubmitting(false);
            return;
        }
        if (emailCheckStatus === 'exists') {
             toast({ title: 'Validation Error', description: 'This email is already associated with a user in this institution.', variant: 'destructive' });
             setIsSubmitting(false);
             return;
        }
    }

    const newAssignedGroupId = data.assignedGroupId === UNASSIGN_STUDENT_FROM_GROUP_KEY ? null : data.assignedGroupId || null;
    let studentSedeIdToSet: string | null = null;

    if (newAssignedGroupId) {
        const group = allGroups.find(g => g.id === newAssignedGroupId);
        studentSedeIdToSet = group?.sedeId || null;
    } else if (firestoreUser.role === 'supervisor' && firestoreUser.sedeId) {
        studentSedeIdToSet = firestoreUser.sedeId;
    } else if (firestoreUser.role === 'teacher' && firestoreUser.sedeId) {
        studentSedeIdToSet = firestoreUser.sedeId;
    }
    
    if (firestoreUser.role === 'supervisor' && studentSedeIdToSet !== firestoreUser.sedeId && studentSedeIdToSet !== null ) {
        toast({ title: "Permission Denied", description: "Supervisors can only manage students within their own Sede.", variant: "destructive" });
        setIsSubmitting(false); return;
    }
    if (firestoreUser.role === 'teacher' && newAssignedGroupId) {
        const group = allGroups.find(g => g.id === newAssignedGroupId);
        if (group?.teacherId !== firestoreUser.id) {
            toast({ title: "Permission Denied", description: "Teachers can only assign students to their own groups.", variant: "destructive" });
            setIsSubmitting(false); return;
        }
    }


    try {
      if (editingStudent) {
        const studentRef = doc(db, "users", editingStudent.id);
        const batch = writeBatch(db);
        const updateData: Partial<User> = {
          name: data.name,
          phoneNumber: data.phoneNumber || null,
          photoUrl: data.photoUrl || null,
          level: data.level,
          notes: data.notes || null,
          age: data.age,
          gender: data.gender,
          preferredShift: data.preferredShift,
          sedeId: studentSedeIdToSet,
          institutionId: firestoreUser.institutionId,
        };
        batch.update(studentRef, updateData);

        const previousGroup = allGroups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(editingStudent.id));
        const previousGroupId = previousGroup?.id || null;

        if (newAssignedGroupId !== previousGroupId) {
          if (previousGroupId) {
            const prevGroupRef = doc(db, 'groups', previousGroupId);
            batch.update(prevGroupRef, { studentIds: arrayRemove(editingStudent.id) });
          }
          if (newAssignedGroupId) {
            const newGroupRef = doc(db, 'groups', newAssignedGroupId);
            batch.update(newGroupRef, { studentIds: arrayUnion(editingStudent.id) });
          }
        }
        await batch.commit();
        toast({ title: 'Student Updated', description: `${data.name}'s record and group assignment updated successfully.` });
      } else { 
        if (!data.username || !data.email || !data.level) {
          toast({ title: "Missing Information", description: "Username, Email, and Level are required.", variant: "destructive" });
          setIsSubmitting(false); return;
        }
        
        const studentSpecificsForAuth = { level: data.level, sedeId: studentSedeIdToSet };
        const creatorContextForAuth = { institutionId: firestoreUser.institutionId };

        await signUpUserInAuthContext(
          data.name,
          data.username,
          data.email,
          data.username, 
          'student',
          studentSpecificsForAuth,
          creatorContextForAuth
        );
        
        await fetchData(); 
        const studentQuery = query(collection(db, 'users'), where('email', '==', data.email), where('institutionId', '==', firestoreUser.institutionId), limit(1));
        const studentSnapshot = await getDocs(studentQuery);
        if (!studentSnapshot.empty) {
            const newStudentId = studentSnapshot.docs[0].id;
            if (newAssignedGroupId) {
                const groupRef = doc(db, 'groups', newAssignedGroupId);
                await updateDoc(groupRef, { studentIds: arrayUnion(newStudentId) });
                toast({ title: 'Student Added', description: `${data.name} added. Login with their email and username as the initial password. Assigned to group.` });
            } else {
                 toast({ title: 'Student Added', description: `${data.name} added. Login with their email and username as the initial password.` });
            }
        } else {
             toast({ title: 'Student Added', description: `${data.name} added. Login with their email and username as the initial password. Could not automatically assign to group, please do it manually.`, variant: 'default' });
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
        userMessage = 'This email is already associated with a Firebase Authentication account globally.';
      } else if (error.code === 'auth/username-already-exists') {
        userMessage = 'This username is already in use in this institution.';
      } else if (error.message) {
        userMessage += `: ${error.message}`;
      }
      toast({ title: 'Operation Failed', description: userMessage, variant: 'destructive'});
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (student: User) => {
    if (student.institutionId !== firestoreUser?.institutionId) {
      toast({ title: "Permission Denied", description: "Cannot delete student from another institution.", variant: "destructive"});
      return;
    }
    if (firestoreUser?.role === 'supervisor' && student.sedeId !== firestoreUser.sedeId) {
      toast({ title: "Permission Denied", description: "Supervisors can only delete students from their own Sede.", variant: "destructive"});
      return;
    }
    if (firestoreUser?.role === 'teacher') {
        const isStudentInTeacherGroup = allGroups.some(g => g.teacherId === firestoreUser.id && Array.isArray(g.studentIds) && g.studentIds.includes(student.id));
        if (!isStudentInTeacherGroup) {
            toast({ title: "Permission Denied", description: "Teachers can only delete students from their assigned groups.", variant: "destructive"});
            return;
        }
    }

    setStudentToDelete(student);
    setDeleteAdminPassword('');
    setIsDeleteStudentDialogOpen(true);
  };

  const confirmDeleteStudent = async () => {
    if (!studentToDelete || !authUser || !firestoreUser || studentToDelete.institutionId !== firestoreUser.institutionId) {
      toast({ title: "Error", description: "Deletion cannot proceed due to data mismatch or permissions.", variant: "destructive"});
      return;
    }
    
    const isAdminDeleting = firestoreUser.role === 'admin';
    if (isAdminDeleting && !deleteAdminPassword) {
      toast({ title: 'Input Required', description: 'Admin password is required to delete.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      if (isAdminDeleting) {
        await reauthenticateCurrentUser(deleteAdminPassword);
      }
      
      const batch = writeBatch(db);
      const studentRef = doc(db, 'users', studentToDelete.id); 
      batch.delete(studentRef);

      const groupWithStudent = allGroups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(studentToDelete.id));
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
  
  const handleNavigate = (path: string) => {
    router.push(path);
  };

  const getStudentGroupName = (studentId: string): string => {
    const group = allGroups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(studentId));
    return group ? group.name : "Unassigned";
  };
  
  const getStudentSedeName = (student: User): string => {
    if (!student.sedeId) return "N/A";
    const sede = allSedes.find(s => s.id === student.sedeId);
    return sede ? sede.name : `Sede ID: ${student.sedeId.substring(0, 5)}...`;
  }

  if (isLoading && allStudents.length === 0 && allGroups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" /> Student Management</CardTitle>
          <CardDescription>Manage student records, logins, and group assignments.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">Loading students and groups for your institution...</p>
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
                <CardDescription>Manage student records. New students log in with their email and use their username as the initial password.</CardDescription>
            </div>
            {canEditOrAddStudents && (
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
                          <FormLabel>Username (for initial password)*</FormLabel>
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
                          {!!editingStudent && <FormDescription className="text-xs">Email cannot be changed for existing students here.</FormDescription>}
                          {!editingStudent && emailCheckMessage && (
                            <p className={`text-xs mt-1 ${getFieldCheckMessageColor(emailCheckStatus)}`}>
                              {emailCheckStatus === 'checking' && <Loader2 className="inline h-3 w-3 mr-1 animate-spin" />}
                              {emailCheckMessage}
                            </p>
                          )}
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
                            <Select onValueChange={(value) => field.onChange(value === UNASSIGN_STUDENT_FROM_GROUP_KEY ? undefined : value)} value={field.value || undefined}>
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
                <Select 
                  value={selectedGroupIdForFilter} 
                  onValueChange={setSelectedGroupIdForFilter} 
                  disabled={isLoading || availableGroupsForAssignment.length === 0 && firestoreUser?.role !== 'admin'}
                >
                    <SelectTrigger id="group-filter"><SelectValue placeholder="Select a group" /></SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all">
                        {firestoreUser?.role === 'teacher' && availableGroupsForAssignment.length === 0 ? 'No groups assigned' :
                         firestoreUser?.role === 'teacher' && availableGroupsForAssignment.length > 0 ? 'All My Groups / Ungrouped' :
                         firestoreUser?.role === 'supervisor' && !firestoreUser.sedeId ? 'No Sede assigned' :
                         firestoreUser?.role === 'supervisor' ? 'All Students in My Sede / Ungrouped' :
                         'All Students / Ungrouped'}
                    </SelectItem>
                    {availableGroupsForAssignment.map((group) => (<SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>))}
                    </SelectContent>
                </Select>
                 {firestoreUser?.role === 'teacher' && availableGroupsForAssignment.length === 0 && !isLoading &&
                    <p className="text-xs text-muted-foreground mt-1">You are not assigned to any groups.</p>}
                 {firestoreUser?.role === 'supervisor' && !firestoreUser.sedeId && !isLoading &&
                    <p className="text-xs text-muted-foreground mt-1">You are not assigned to a Sede.</p>}
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
              <TableHead>Sede</TableHead><TableHead>Actions</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {(!isLoading && filteredStudents.length > 0) ? filteredStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell>{student.name}</TableCell>
                <TableCell>{student.username || 'N/A'}</TableCell>
                <TableCell>{student.email || 'N/A'}</TableCell>
                <TableCell>{student.level || 'N/A'}</TableCell>
                <TableCell><span className={`px-2 py-1 text-xs font-medium rounded-full ${getStudentGroupName(student.id) === "Unassigned" ? "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300" : "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"}`}>{getStudentGroupName(student.id)}</span></TableCell>
                <TableCell>{getStudentSedeName(student)}</TableCell>
                <TableCell className="space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => handleNavigate(`/student/${student.id}`)} title="View Profile"><UserProfileIcon className="h-4 w-4" /><span className="sr-only">View Profile</span></Button>
                  <Button variant="ghost" size="icon" onClick={() => handleNavigate(`/grades-management?studentId=${student.id}`)} title="Manage Grades"><NotebookPen className="h-4 w-4" /><span className="sr-only">Manage Grades</span></Button>
                  {canEditOrAddStudents && (
                    <>
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(student)} title="Edit Student"><Pencil className="h-4 w-4" /><span className="sr-only">Edit Student</span></Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(student)} title="Delete Student"><Trash2 className="h-4 w-4" /><span className="sr-only">Delete Student</span></Button>
                    </>
                  )}
                </TableCell>
              </TableRow>
            )) : (
              !isLoading && (
                <TableRow><TableCell colSpan={7} className="text-center py-10">
                    {allStudents.length === 0 && selectedGroupIdForFilter === 'all' && !searchTerm ? (
                      <div><p className="text-lg font-semibold">No student records found in your institution.</p><p className="text-muted-foreground mt-2">Add new student records to see them here.</p>
                      {canEditOrAddStudents && 
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

    
