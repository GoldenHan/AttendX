
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation'; // Import useRouter
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
import type { User, Group } from '@/types'; // PartialScores removed as it's not used here directly
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc, query, where, addDoc, writeBatch } from 'firebase/firestore';
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
// Tabs, TabsContent, TabsList, TabsTrigger removed as grade dialog is removed

// Schema for student add/edit dialog (Firestore data only)
const studentFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')), 
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

// studentGradeFormSchema and StudentGradeFormValues removed

export default function StudentManagementPage() {
  const router = useRouter(); // Initialize router
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

  // Grade dialog states and functions removed
  // const [isGradeDialogOpen, setIsGradeDialogOpen] = useState(false);
  // const [studentForGrading, setStudentForGrading] = useState<User | null>(null);
  // const [isSubmittingGrades, setIsSubmittingGrades] = useState(false);

  const { toast } = useToast();
  const { reauthenticateCurrentUser, authUser } = useAuth();

  const studentForm = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phoneNumber: '',
      photoUrl: '',
      level: undefined,
      notes: '',
      age: undefined,
      gender: undefined,
      preferredShift: undefined,
    },
  });

  // gradeForm removed

  const fetchData = async () => {
    setIsLoading(true);
    try {
      // Fetch from 'students' collection
      const studentsQuery = query(collection(db, 'students')); 
      const studentsSnapshot = await getDocs(studentsQuery);
      setAllStudents(studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data(), role: 'student' } as User)));

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
      if (group && Array.isArray(group.studentIds)) {
        studentsToDisplay = studentsToDisplay.filter(student => group.studentIds.includes(student.id));
      } else if (group) { // Group selected but might have no studentIds array or is empty
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
      name: '', email: '', phoneNumber: '', photoUrl: '',
      level: undefined, notes: '', age: undefined, gender: undefined, preferredShift: undefined,
    });
    setIsStudentFormDialogOpen(true);
  };
  
  const handleOpenEditDialog = (studentToEdit: User) => {
    setEditingStudent(studentToEdit);
    studentForm.reset({
      name: studentToEdit.name,
      email: studentToEdit.email || '',
      phoneNumber: studentToEdit.phoneNumber || '',
      photoUrl: studentToEdit.photoUrl || '',
      level: studentToEdit.level || undefined,
      notes: studentToEdit.notes || '',
      age: studentToEdit.age ?? undefined, // Use ?? to handle 0 or null correctly if age can be 0
      gender: studentToEdit.gender || undefined,
      preferredShift: studentToEdit.preferredShift || undefined,
    });
    setIsStudentFormDialogOpen(true);
  };

  const handleStudentFormSubmit = async (data: StudentFormValues) => {
    setIsSubmitting(true);
        
    const studentDetails: Omit<User, 'id' | 'uid' | 'grades' | 'role'> = {
        name: data.name,
        email: data.email || undefined,
        phoneNumber: data.phoneNumber || undefined,
        photoUrl: data.photoUrl || undefined,
        level: data.level,
        notes: data.notes || undefined,
        age: data.age,
        gender: data.gender,
        preferredShift: data.preferredShift,
    };

    // Remove undefined fields before saving to Firestore
    const finalStudentDetails = Object.fromEntries(
        Object.entries(studentDetails).filter(([_, v]) => v !== undefined)
    );

    if (editingStudent) { 
      try {
        const studentRef = doc(db, "students", editingStudent.id);
        await updateDoc(studentRef, finalStudentDetails);
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
      }
    } else { 
      try {
        // Ensure new students have an initialized grades field
        const newStudentDocData = {
          ...finalStudentDetails,
          role: 'student' as 'student', // Explicitly set role
          grades: { 
            partial1: { accumulatedActivities: [], exam: { name: null, score: null } },
            partial2: { accumulatedActivities: [], exam: { name: null, score: null } },
            partial3: { accumulatedActivities: [], exam: { name: null, score: null } },
          },
        };
        await addDoc(collection(db, 'students'), newStudentDocData);
        toast({
          title: 'Student Record Added',
          description: `${data.name}'s record added to Firestore.`,
        });
        studentForm.reset();
        setIsStudentFormDialogOpen(false);
        await fetchData();
      } catch (error: any) {
        console.error("Error adding student to Firestore:", error);
        toast({
          title: 'Error Adding Student Record',
          description: error.message || 'An unexpected error occurred.',
          variant: 'destructive',
        });
      }
    }
    setIsSubmitting(false);
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
      
      const batch = writeBatch(db);
      const studentRef = doc(db, 'students', studentToDelete.id);
      batch.delete(studentRef);

      // Remove student from any groups they were in
      const groupsToUpdate = groups.filter(g => g.studentIds?.includes(studentToDelete.id));
      groupsToUpdate.forEach(group => {
        const groupRef = doc(db, 'groups', group.id);
        const updatedStudentIds = group.studentIds.filter(id => id !== studentToDelete.id);
        batch.update(groupRef, { studentIds: updatedStudentIds });
      });

      await batch.commit();

      toast({ title: 'Student Record Deleted', description: `${studentToDelete.name}'s Firestore record and group memberships removed.` });
      
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

  // handleOpenGradeDialog and handleGradeFormSubmit removed

  const handleGoToManageGrades = (studentId: string) => {
    router.push(`/grades-management?studentId=${studentId}`);
  };

  // renderGradeInputFields removed

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
                <CardDescription>Manage student records. Filter by group or search by name/shift. Student login accounts must be created separately via Firebase Console if needed.</CardDescription>
            </div>
            <Dialog open={isStudentFormDialogOpen} onOpenChange={(isOpen) => {
                setIsStudentFormDialogOpen(isOpen);
                if (!isOpen) {
                setEditingStudent(null); 
                studentForm.reset({
                    name: '', email: '', phoneNumber: '', photoUrl: '',
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
                    {editingStudent ? 'Update student details in Firestore.' : 'Fill in student details to add to Firestore. Auth accounts are managed separately.'}
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
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email (Optional)</FormLabel>
                            <FormControl><Input type="email" placeholder="student@example.com (for reference)" {...field} /></FormControl>
                            <FormDescription>Used for contact or to link with a manually created Auth account.</FormDescription>
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
                        {editingStudent ? 'Save Changes' : 'Add Student Record'}
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
              <TableHead>Email</TableHead>
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
                <TableCell>{student.email || 'N/A'}</TableCell>
                <TableCell>{student.phoneNumber || 'N/A'}</TableCell>
                <TableCell>{student.level || 'N/A'}</TableCell>
                <TableCell>{student.age ?? 'N/A'}</TableCell>
                <TableCell>{student.gender ? student.gender.charAt(0).toUpperCase() + student.gender.slice(1) : 'N/A'}</TableCell>
                <TableCell>{student.preferredShift || 'N/A'}</TableCell>
                <TableCell className="space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => handleGoToManageGrades(student.id)}>
                    <NotebookPen className="h-4 w-4" />
                    <span className="sr-only">Manage Grades</span>
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

    {/* Grade Entry Dialog and related logic completely removed */}
    </>
  );
}
