
'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import type { User, Group, PartialScores } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, query, where } from 'firebase/firestore'; // Removed addDoc
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
} from '@/components/ui/form';
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createUserAccount, type CreateUserAccountInput } from '@/ai/flows/user-admin-flow';

// Schema for student add/edit dialog (Firestore data only)
const studentFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  phoneNumber: z.string().optional().or(z.literal('')),
  photoUrl: z.string().url({ message: "Please enter a valid URL for photo." }).optional().or(z.literal('')),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Other']).optional(),
  notes: z.string().optional(),
  age: z.preprocess(
    (val) => (val === "" || val === undefined || val === null ? undefined : Number(val)),
    z.number({ invalid_type_error: "Age must be a number." }).positive("Age must be positive.").int("Age must be an integer.").optional()
  ),
  gender: z.enum(['male', 'female', 'other']).optional(),
  preferredShift: z.enum(['Saturday', 'Sunday']).optional(),
});

type StudentFormValues = z.infer<typeof studentFormSchema>;

const parseOptionalFloat = (val: unknown): number | null | undefined => {
  if (val === "" || val === undefined || val === null) return null;
  const num = Number(val);
  return isNaN(num) ? undefined : num; 
};

const partialScoresSchema = z.object({
  acc1: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(10, "Max 10").optional().nullable()),
  acc2: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(10, "Max 10").optional().nullable()),
  acc3: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(10, "Max 10").optional().nullable()),
  acc4: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(10, "Max 10").optional().nullable()),
  exam: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(60, "Max 60").optional().nullable()),
}).deepPartial().optional(); 


const studentGradeFormSchema = z.object({
  grades: z.object({
    partial1: partialScoresSchema,
    partial2: partialScoresSchema,
    partial3: partialScoresSchema,
  }).deepPartial().optional(),
});

type StudentGradeFormValues = z.infer<typeof studentGradeFormSchema>;


export default function StudentManagementPage() {
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isStudentFormDialogOpen, setIsStudentFormDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<User | null>(null);

  const [isDeleteStudentDialogOpen, setIsDeleteStudentDialogOpen] = useState(false);
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);
  const [deleteAdminPassword, setDeleteAdminPassword] = useState('');

  const [selectedGroupIdForFilter, setSelectedGroupIdForFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [isGradeDialogOpen, setIsGradeDialogOpen] = useState(false);
  const [studentForGrading, setStudentForGrading] = useState<User | null>(null);
  const [isSubmittingGrades, setIsSubmittingGrades] = useState(false);


  const { toast } = useToast();
  const { reauthenticateCurrentUser, authUser } = useAuth();

  const studentForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: '',
      phoneNumber: '',
      photoUrl: '',
      level: undefined,
      notes: '',
      age: undefined,
      gender: undefined,
      preferredShift: undefined,
    },
  });

  const gradeForm = useForm<StudentGradeFormValues>({
    resolver: zodResolver(studentGradeFormSchema),
    defaultValues: {
      grades: {
        partial1: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
        partial2: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
        partial3: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
      }
    },
  });

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'));
      const studentsSnapshot = await getDocs(studentsQuery);
      setAllStudents(studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));

      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load students or groups.', variant: 'destructive' });
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
      if (group && group.studentIds) {
        studentsToDisplay = studentsToDisplay.filter(student => group.studentIds.includes(student.id));
      } else {
        studentsToDisplay = []; 
      }
    }

    if (searchTerm) {
      studentsToDisplay = studentsToDisplay.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.preferredShift && student.preferredShift.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    return studentsToDisplay;
  }, [allStudents, groups, selectedGroupIdForFilter, searchTerm]);
  
  const handleOpenAddDialog = () => {
    setEditingStudent(null);
    studentForm.reset({
      name: '', phoneNumber: '', photoUrl: '',
      level: undefined, notes: '', age: undefined, gender: undefined, preferredShift: undefined,
    });
    setIsStudentFormDialogOpen(true);
  };
  
  const handleOpenEditDialog = (studentToEdit: User) => {
    setEditingStudent(studentToEdit);
    studentForm.reset({
      name: studentToEdit.name,
      phoneNumber: studentToEdit.phoneNumber || '',
      photoUrl: studentToEdit.photoUrl || '',
      level: studentToEdit.level || undefined,
      notes: studentToEdit.notes || '',
      age: studentToEdit.age ?? undefined,
      gender: studentToEdit.gender || undefined,
      preferredShift: studentToEdit.preferredShift || undefined,
    });
    setIsStudentFormDialogOpen(true);
  };

  const handleStudentFormSubmit = async (data: StudentFormValues) => {
    setIsSubmitting(true);
        
    if (editingStudent) { // --- EDITING EXISTING STUDENT ---
      // This part only updates Firestore, does not touch Auth
      const firestoreUpdateData: Partial<Omit<User, 'id' | 'uid' | 'email' | 'role' | 'grades'>> = {
        name: data.name,
        phoneNumber: data.phoneNumber || undefined,
        photoUrl: data.photoUrl || undefined,
        level: data.level,
        notes: data.notes || undefined,
        age: data.age,
        gender: data.gender,
        preferredShift: data.preferredShift,
      };
      const finalUpdateData = Object.fromEntries(
        Object.entries(firestoreUpdateData).filter(([_, v]) => v !== undefined)
      );

      try {
        const studentRef = doc(db, 'users', editingStudent.id);
        await updateDoc(studentRef, finalUpdateData);
        toast({ title: 'Student Updated', description: `${data.name}'s record updated successfully.` });
        studentForm.reset();
        setEditingStudent(null);
        setIsStudentFormDialogOpen(false);
        await fetchData();
      } catch (error: any) {
        toast({ 
          title: 'Update Student Failed', 
          description: `An error occurred: ${error.message || 'Please try again.'}`, 
          variant: 'destructive' 
        });
        console.error("Firestore update error:", error);
      } finally {
        setIsSubmitting(false);
      }

    } else { // --- ADDING NEW STUDENT ---
      // Auto-generate email and password
      const sanitizedName = data.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      const generatedEmail = `${sanitizedName}${Date.now().toString().slice(-5)}@student.servex.com`;
      const firstPartName = data.name.split(' ')[0];
      const generatedPassword = `${firstPartName}Сервекс7!`;

      const flowInput: CreateUserAccountInput = {
        name: data.name,
        email: generatedEmail,
        password: generatedPassword,
        role: 'student',
        photoUrl: data.photoUrl || '',
        level: data.level,
        notes: data.notes,
        age: data.age,
        gender: data.gender,
        preferredShift: data.preferredShift,
      };

      try {
        const result = await createUserAccount(flowInput);
        if (result.success && result.userId) {
          toast({
            title: 'Student Account Created',
            description: (
              <div>
                <p>{result.message}</p>
                <p className="mt-2 font-semibold">Please share these credentials with the student:</p>
                <p>Email: <code className="font-mono bg-muted p-1 rounded text-xs">{generatedEmail}</code></p>
                <p>Password: <code className="font-mono bg-muted p-1 rounded text-xs">{generatedPassword}</code></p>
                <p className="mt-1 text-xs text-muted-foreground">The student should change this password upon first login.</p>
              </div>
            ),
            duration: 20000, // Extended duration
          });
          studentForm.reset();
          setIsStudentFormDialogOpen(false);
          await fetchData();
        } else {
          toast({
            title: 'Failed to Create Student Account',
            description: result.message || 'An unknown error occurred via the creation flow.',
            variant: 'destructive',
          });
        }
      } catch (error: any) {
        console.error("Error calling createUserAccount flow:", error);
        toast({
          title: 'Error Creating Student',
          description: error.message || 'An unexpected error occurred while calling the creation flow.',
          variant: 'destructive',
        });
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleOpenDeleteDialog = (student: User) => {
    setStudentToDelete(student);
    setDeleteAdminPassword(''); 
    setIsDeleteStudentDialogOpen(true);
  };

  const confirmDeleteStudent = async () => {
    if (!studentToDelete) {
        toast({ title: 'Error', description: 'No student selected for deletion.', variant: 'destructive' });
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

      // Note: This only deletes the Firestore record. The Firebase Auth user is NOT deleted here.
      // Deleting Auth users is a more sensitive operation and typically done via Firebase console or a separate, dedicated admin flow.
      await deleteDoc(doc(db, 'users', studentToDelete.id));
      toast({ title: 'Student Record Deleted', description: `${studentToDelete.name}'s Firestore record removed. Auth account (if any) is not affected by this action.` });
      
      setStudentToDelete(null);
      setDeleteAdminPassword('');
      setIsDeleteStudentDialogOpen(false);
      await fetchData(); 
    } catch (error: any) {
      let errorMessage = 'Failed to delete student record.';
      const reAuthErrorCodes = ['auth/wrong-password', 'auth/invalid-credential', 'auth/user-mismatch'];
      
      if (reAuthErrorCodes.includes(error.code)) {
        errorMessage = 'Admin re-authentication failed: Incorrect password or credential mismatch.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Admin re-authentication failed: Too many attempts. Try again later.';
      } else if (error.code === 'auth/requires-recent-login'){
        errorMessage = 'Admin re-authentication required. Please log out and log back in.';
      } else if (error.message) {
        errorMessage = error.message; 
      }
      toast({ title: 'Delete Failed', description: errorMessage, variant: 'destructive' });
      
      if (reAuthErrorCodes.includes(error.code) || error.code === 'auth/too-many-requests' || error.code === 'auth/requires-recent-login') {
         setIsDeleteStudentDialogOpen(true);
      } else {
         setIsDeleteStudentDialogOpen(false); 
         setDeleteAdminPassword(''); 
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenGradeDialog = (student: User) => {
    setStudentForGrading(student);
    gradeForm.reset({
      grades: {
        partial1: student.grades?.partial1 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
        partial2: student.grades?.partial2 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
        partial3: student.grades?.partial3 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
      }
    });
    setIsGradeDialogOpen(true);
  };

  const handleGradeFormSubmit = async (data: StudentGradeFormValues) => {
    if (!studentForGrading) {
        toast({ title: "Error", description: "No student selected for grading.", variant: "destructive" });
        return;
    }
    setIsSubmittingGrades(true);
    try {
        const studentRef = doc(db, "users", studentForGrading.id);
        
        const gradesToSave = {
          partial1: data.grades?.partial1 || studentForGrading.grades?.partial1 || {},
          partial2: data.grades?.partial2 || studentForGrading.grades?.partial2 || {},
          partial3: data.grades?.partial3 || studentForGrading.grades?.partial3 || {},
        };

        await updateDoc(studentRef, {
            grades: gradesToSave
        });
        toast({ title: "Grades Updated", description: `Grades for ${studentForGrading.name} saved successfully.` });
        setIsGradeDialogOpen(false);
        setStudentForGrading(null);
        await fetchData(); 
    } catch (error: any) {
        toast({ title: "Grade Update Failed", description: `An error occurred: ${error.message || 'Please try again.'}`, variant: "destructive" });
        console.error("Grade update error:", error);
    } finally {
        setIsSubmittingGrades(false);
    }
  };
  
  const renderGradeInputFields = (partialKey: "partial1" | "partial2" | "partial3") => {
    const accumulatedFields: (keyof PartialScores)[] = ['acc1', 'acc2', 'acc3', 'acc4'];
    return (
      <div className="space-y-3 p-1">
        {accumulatedFields.map((accKey, index) => (
          <FormField
            key={`${partialKey}-${accKey}`}
            control={gradeForm.control}
            name={`grades.${partialKey}.${accKey}`}
            render={({ field }) => (
              <FormItem className="flex items-center gap-2">
                <FormLabel className="w-28 whitespace-nowrap">Acumulado {index + 1}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0-10"
                    {...field}
                    value={field.value === null ? '' : field.value ?? ''}
                    onChange={e => field.onChange(parseOptionalFloat(e.target.value))}
                    className="w-full"
                  />
                </FormControl>
                <FormMessage className="text-xs"/>
              </FormItem>
            )}
          />
        ))}
        <FormField
          control={gradeForm.control}
          name={`grades.${partialKey}.exam`}
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormLabel className="w-28">Examen</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0-60"
                  {...field}
                  value={field.value === null ? '' : field.value ?? ''}
                  onChange={e => field.onChange(parseOptionalFloat(e.target.value))}
                  className="w-full"
                />
              </FormControl>
              <FormMessage className="text-xs"/>
            </FormItem>
          )}
        />
      </div>
    );
  };


  if (isLoading && allStudents.length === 0 && groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" /> Student Management</CardTitle>
          <CardDescription>Manage student records and filter by group.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">Loading students and groups...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
                <CardTitle className="flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" /> Student Management</CardTitle>
                <CardDescription>Manage student records. Filter by group or search by name/shift. New students get an auto-generated login.</CardDescription>
            </div>
            <Dialog open={isStudentFormDialogOpen} onOpenChange={(isOpen) => {
                setIsStudentFormDialogOpen(isOpen);
                if (!isOpen) {
                setEditingStudent(null); 
                studentForm.reset({
                    name: '', phoneNumber: '', photoUrl: '',
                    level: undefined, notes: '', age: undefined, gender: undefined, preferredShift: undefined,
                });
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
                    <DialogDescription>
                    {editingStudent ? 'Update student details.' : 'Fill in student details. A login account will be auto-generated.'}
                    </DialogDescription>
                </DialogHeader>
                <Form {...studentForm}>
                    <form onSubmit={studentForm.handleSubmit(handleStudentFormSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                    <FormField
                        control={studentForm.control}
                        name="name"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl><Input placeholder="John Doe" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={studentForm.control}
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
                        control={studentForm.control}
                        name="photoUrl"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Photo URL (Optional)</FormLabel>
                            <FormControl><Input type="url" placeholder="https://placehold.co/100x100.png" {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={studentForm.control}
                        name="level"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Level (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select student's level" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="Beginner">Beginner</SelectItem>
                                <SelectItem value="Intermediate">Intermediate</SelectItem>
                                <SelectItem value="Advanced">Advanced</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={studentForm.control}
                        name="age"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Age (Optional)</FormLabel>
                            <FormControl><Input type="number" placeholder="18" {...field} value={field.value ?? ''} onChange={e => field.onChange(e.target.value === '' ? undefined : Number(e.target.value))} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={studentForm.control}
                        name="gender"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Gender (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="male">Male</SelectItem>
                                <SelectItem value="female">Female</SelectItem>
                                <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={studentForm.control}
                        name="preferredShift"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Preferred Shift (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || undefined}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Select preferred shift" /></SelectTrigger></FormControl>
                            <SelectContent>
                                <SelectItem value="Saturday">Saturday</SelectItem>
                                <SelectItem value="Sunday">Sunday</SelectItem>
                            </SelectContent>
                            </Select>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <FormField
                        control={studentForm.control}
                        name="notes"
                        render={({ field }) => (
                        <FormItem>
                            <FormLabel>Notes (Optional)</FormLabel>
                            <FormControl><Textarea placeholder="Any relevant notes about the student..." {...field} /></FormControl>
                            <FormMessage />
                        </FormItem>
                        )}
                    />
                    <DialogFooter className="pt-4">
                        <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                        <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingStudent ? 'Save Changes' : 'Add Student & Create Login'}
                        </Button>
                    </DialogFooter>
                    </form>
                </Form>
                </DialogContent>
            </Dialog>
        </div>
        <div className="mt-4 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-[200px]">
                <Label htmlFor="group-filter">Filter by Group</Label>
                <Select value={selectedGroupIdForFilter} onValueChange={setSelectedGroupIdForFilter} disabled={isLoading}>
                    <SelectTrigger id="group-filter">
                    <SelectValue placeholder="Select a group" />
                    </SelectTrigger>
                    <SelectContent>
                    <SelectItem value="all">All Students / Ungrouped</SelectItem>
                    {groups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                        {group.name}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
                 <Label htmlFor="search-student">Search by Name or Shift</Label>
                 <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        id="search-student"
                        type="search"
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-8 w-full"
                    />
                </div>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && filteredStudents.length === 0 && (
             <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2 text-sm text-muted-foreground">Loading students...</p>
             </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email (Login)</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Level</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredStudents.length > 0 ? filteredStudents.map((student) => (
              <TableRow key={student.id}>
                <TableCell>{student.name}</TableCell>
                <TableCell>{student.email || 'N/A (No Auth)'}</TableCell>
                <TableCell>{student.phoneNumber || 'N/A'}</TableCell>
                <TableCell>{student.level || 'N/A'}</TableCell>
                <TableCell>{student.age ?? 'N/A'}</TableCell>
                <TableCell>{student.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : 'N/A'}</TableCell>
                <TableCell>{student.preferredShift || 'N/A'}</TableCell>
                <TableCell className="space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => handleOpenGradeDialog(student)}>
                    <NotebookPen className="h-4 w-4" />
                    <span className="sr-only">Edit Grades</span>
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(student)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit Student</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(student)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete Student</span>
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              !isLoading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    No students found matching your criteria.
                  </TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>

    {/* Delete Student Dialog */}
    <Dialog open={isDeleteStudentDialogOpen} onOpenChange={(isOpen) => {
        setIsDeleteStudentDialogOpen(isOpen);
        if (!isOpen) {
            setStudentToDelete(null);
            setDeleteAdminPassword('');
        }
    }}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Delete Student Record</DialogTitle>
                <DialogDescription>
                    Are you sure you want to delete the Firestore record for {studentToDelete?.name}?
                    This action cannot be undone. Enter your admin password to confirm.
                    Note: This action does NOT delete the Firebase Authentication account if one exists.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                 <div className="space-y-1.5">
                    <Label htmlFor="deleteAdminPasswordStudent">Admin's Current Password</Label>
                    <Input 
                        id="deleteAdminPasswordStudent"
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
                    onClick={confirmDeleteStudent} 
                    disabled={isSubmitting || !deleteAdminPassword.trim()}
                >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete Student Record
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    {/* Grade Entry Dialog */}
    <Dialog open={isGradeDialogOpen} onOpenChange={(isOpen) => {
        setIsGradeDialogOpen(isOpen);
        if (!isOpen) {
            setStudentForGrading(null);
            gradeForm.reset({
              grades: {
                partial1: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
                partial2: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
                partial3: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
              }
            });
        }
    }}>
        <DialogContent className="sm:max-w-lg"> 
            <DialogHeader>
                <DialogTitle>Registro de Notas: {studentForGrading?.name}</DialogTitle>
                <DialogDescription>
                    Enter or update the detailed grades for this student. Max 10 for accumulated, max 60 for exam per partial.
                </DialogDescription>
            </DialogHeader>
            <Form {...gradeForm}>
                <form onSubmit={gradeForm.handleSubmit(handleGradeFormSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto">
                  <Tabs defaultValue="partial1" className="w-full">
                    <TabsList className="grid w-full grid-cols-3">
                      <TabsTrigger value="partial1">1er Parcial</TabsTrigger>
                      <TabsTrigger value="partial2">2do Parcial</TabsTrigger>
                      <TabsTrigger value="partial3">3er Parcial</TabsTrigger>
                    </TabsList>
                    <TabsContent value="partial1">
                      {renderGradeInputFields("partial1")}
                    </TabsContent>
                    <TabsContent value="partial2">
                      {renderGradeInputFields("partial2")}
                    </TabsContent>
                    <TabsContent value="partial3">
                      {renderGradeInputFields("partial3")}
                    </TabsContent>
                  </Tabs>
                  <DialogFooter className="pt-6">
                      <DialogClose asChild>
                          <Button type="button" variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button type="submit" disabled={isSubmittingGrades}>
                          {isSubmittingGrades && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          Save Grades
                      </Button>
                  </DialogFooter>
                </form>
            </Form>
        </DialogContent>
    </Dialog>
    </>
  );
}

