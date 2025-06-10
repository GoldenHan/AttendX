
'use client';

import React, { useState, useEffect } from 'react';
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
import { Loader2, Pencil, Trash2, UserPlus, FolderKanban, Users as UsersIcon } from 'lucide-react'; 
import type { User } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore';
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
  FormDescription,
} from '@/components/ui/form';
import { Label } from "@/components/ui/label"; // Corrected import

// Schema for add/edit (no adminPassword here)
const userFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')),
  role: z.enum(['student', 'teacher', 'admin', 'caja'], { required_error: "Role is required." }),
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

type UserFormValues = z.infer<typeof userFormSchema>;

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [isUserFormDialogOpen, setIsUserFormDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [isDeleteUserDialogOpen, setIsDeleteUserDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [deletePassword, setDeletePassword] = useState('');

  const { toast } = useToast();
  const { reauthenticateCurrentUser, authUser } = useAuth();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'student',
      photoUrl: '',
      level: undefined,
      notes: '',
      age: undefined,
      gender: undefined,
      preferredShift: undefined,
    },
  });

  const watchedRole = form.watch('role');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      setUsers(usersSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ title: 'Error fetching users', description: 'Could not load users from Firestore.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);
  
  useEffect(() => {
    if (watchedRole !== 'student') {
      form.setValue('level', undefined);
      form.setValue('notes', '');
      form.setValue('age', undefined);
      form.setValue('gender', undefined);
      form.setValue('preferredShift', undefined);
    }
  }, [watchedRole, form]);

  const handleOpenAddDialog = () => {
    setEditingUser(null);
    form.reset({
      name: '', email: '', role: 'student', photoUrl: '',
      level: undefined, notes: '', age: undefined, gender: undefined, preferredShift: undefined,
    });
    setIsUserFormDialogOpen(true);
  };
  
  const handleOpenEditDialog = (userToEdit: User) => {
    console.log("Opening edit dialog for:", userToEdit);
    setEditingUser(userToEdit);
    form.reset({
      name: userToEdit.name,
      email: userToEdit.email || '',
      role: userToEdit.role,
      photoUrl: userToEdit.photoUrl || '',
      level: userToEdit.level || undefined,
      notes: userToEdit.notes || '',
      age: userToEdit.age ?? undefined,
      gender: userToEdit.gender || undefined,
      preferredShift: userToEdit.preferredShift || undefined,
    });
    setIsUserFormDialogOpen(true);
  };

  const handleUserFormSubmit = async (data: UserFormValues) => {
    console.log("Form data submitted for add/edit:", data);
    console.log("Currently editing user (null if adding):", editingUser);
    setIsSubmitting(true);
    
    const baseFirestoreData: Partial<User> = {
      name: data.name,
      role: data.role,
      // Ensure optional text fields are empty strings if not provided, not undefined
      email: data.email || '', 
      photoUrl: data.photoUrl || '', 
    };
    
    if (editingUser?.uid) {
      (baseFirestoreData as User).uid = editingUser.uid;
    }

    if (data.role === 'student') {
      baseFirestoreData.level = data.level; // Keep as undefined if not selected
      baseFirestoreData.notes = data.notes || ''; // Ensure empty string if not provided
      baseFirestoreData.age = data.age; // Keep as undefined if not provided
      baseFirestoreData.gender = data.gender; // Keep as undefined if not selected
      baseFirestoreData.preferredShift = data.preferredShift; // Keep as undefined if not selected
    } else { 
      // Explicitly set student fields to undefined if not a student
      baseFirestoreData.level = undefined;
      baseFirestoreData.notes = undefined;
      baseFirestoreData.age = undefined;
      baseFirestoreData.gender = undefined;
      baseFirestoreData.preferredShift = undefined;
    }
    
    // Create a clean object for Firestore, removing any top-level undefined properties
    const firestoreData = Object.entries(baseFirestoreData).reduce((acc, [key, value]) => {
      if (value !== undefined) {
        // @ts-ignore
        acc[key] = value;
      }
      return acc;
    }, {} as Partial<User>);


    console.log("Data being sent to Firestore:", firestoreData);

    try {
      if (editingUser) {
        console.log("Attempting to update user with ID:", editingUser.id);
        const userRef = doc(db, 'users', editingUser.id);
        console.log("User ref path for update:", userRef.path);
        await updateDoc(userRef, firestoreData);
        toast({ title: 'User Updated', description: `${data.name}'s record updated successfully.` });
      } else {
        console.log("Attempting to add new user.");
        // @ts-ignore - Firestore will generate ID if 'id' is not in firestoreData
        const docRef = await addDoc(collection(db, 'users'), firestoreData);
        toast({ 
          title: 'User Record Added', 
          description: `${data.name} added to Firestore. No Auth account created.` 
        });
      }
      
      form.reset({
        name: '', email: '', role: 'student', photoUrl: '',
        level: undefined, notes: '', age: undefined, gender: undefined, preferredShift: undefined,
      });
      setEditingUser(null);
      setIsUserFormDialogOpen(false);
      await fetchUsers();
    } catch (error: any) {
      console.error("Firestore operation error:", error);
      console.error("Full error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      toast({ 
        title: editingUser ? 'Update User Failed' : 'Add User Failed', 
        description: `An error occurred: ${error.message || 'Please try again.'}`, 
        variant: 'destructive' 
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDeleteDialog = (user: User) => {
    setUserToDelete(user);
    setDeletePassword(''); 
    setIsDeleteUserDialogOpen(true);
  };

  const confirmDeleteUser = async () => {
    console.log("Attempting to delete Firestore record for:", userToDelete);
    if (!userToDelete || !deletePassword) {
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
      console.log("Re-authenticating admin...");
      await reauthenticateCurrentUser(deletePassword);
      toast({ title: 'Admin Re-authenticated', description: 'Proceeding with deletion.' });

      console.log("Deleting Firestore document for user ID:", userToDelete.id);
      await deleteDoc(doc(db, 'users', userToDelete.id));
      toast({ title: 'User Record Deleted', description: `${userToDelete.name}'s Firestore record removed successfully. Auth account (if any) not affected.` });
      
      setUserToDelete(null);
      setDeletePassword('');
      setIsDeleteUserDialogOpen(false);
      await fetchUsers();
    } catch (error: any) {
      console.error("Error deleting user record:", error);
      console.error("Full deletion error object:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      let errorMessage = 'Failed to delete user record.';
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
      
      // Keep dialog open if it was a re-auth error, otherwise close it
      if (!reAuthErrorCodes.includes(error.code) && error.code !== 'auth/too-many-requests' && error.code !== 'auth/requires-recent-login') {
         setIsDeleteUserDialogOpen(false); 
         setDeletePassword(''); 
      }
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (isLoading && users.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UsersIcon className="h-6 w-6 text-primary" /> User Management</CardTitle>
          <CardDescription>Manage student, teacher, and administrator accounts.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">Loading users...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><UsersIcon className="h-6 w-6 text-primary" /> User Management</CardTitle>
          <CardDescription>Manage student, teacher, and administrator accounts (Firestore records only).</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-sm">
            <Link href="/group-management">
              <FolderKanban className="size-3.5" />
              Manage Groups
            </Link>
          </Button>
          <Dialog open={isUserFormDialogOpen} onOpenChange={(isOpen) => {
            setIsUserFormDialogOpen(isOpen);
            if (!isOpen) {
              setEditingUser(null); 
              form.reset({
                  name: '', email: '', role: 'student', photoUrl: '',
                  level: undefined, notes: '', age: undefined, gender: undefined, preferredShift: undefined,
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-sm" onClick={handleOpenAddDialog}>
                <UserPlus className="size-3.5" />
                Add User Record
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingUser ? 'Edit User Record' : 'Add New User Record (Firestore Only)'}</DialogTitle>
                <DialogDescription>
                  {editingUser ? 'Update user details in Firestore.' : 'Fill in user details to add to Firestore. No Auth account will be created.'}
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleUserFormSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
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
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (Optional)</FormLabel>
                        <FormControl><Input type="email" placeholder="john.doe@example.com" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="role"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                          <FormControl><SelectTrigger><SelectValue placeholder="Select a role" /></SelectTrigger></FormControl>
                          <SelectContent>
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="caja">Caja</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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

                  {watchedRole === 'student' && (
                    <>
                      <FormField
                        control={form.control}
                        name="level"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Level (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value || undefined} defaultValue={field.value}>
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
                        control={form.control}
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
                        control={form.control}
                        name="gender"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Gender (Optional)</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value || undefined} defaultValue={field.value}>
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
                        control={form.control}
                        name="preferredShift"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Preferred Shift (Optional)</FormLabel>
                             <Select onValueChange={field.onChange} value={field.value || undefined} defaultValue={field.value}>
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
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes (Optional)</FormLabel>
                            <FormControl><Textarea placeholder="Any relevant notes about the student..." {...field} /></FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}
                  <DialogFooter>
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingUser ? 'Save Changes' : 'Add User Record'}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && users.length > 0 && (
             <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="ml-2 text-sm text-muted-foreground">Refreshing users...</p>
             </div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length > 0 ? users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.name}</TableCell>
                <TableCell>{user.email || 'N/A'}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                    user.role === 'admin' ? 'bg-purple-500/20 text-purple-700 dark:text-purple-400' :
                    user.role === 'teacher' ? 'bg-blue-500/20 text-blue-700 dark:text-blue-400' :
                    user.role === 'caja' ? 'bg-orange-500/20 text-orange-700 dark:text-orange-400' :
                    'bg-green-500/20 text-green-700 dark:text-green-400'
                  }`}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                </TableCell>
                <TableCell>{user.role === 'student' && user.age ? user.age : 'N/A'}</TableCell>
                <TableCell>{user.role === 'student' && user.gender ? user.gender.charAt(0).toUpperCase() + user.gender.slice(1) : 'N/A'}</TableCell>
                <TableCell>{user.role === 'student' && user.preferredShift ? user.preferredShift : 'N/A'}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="mr-2" onClick={() => handleOpenEditDialog(user)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleOpenDeleteDialog(user)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              !isLoading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">No users found.</TableCell>
                </TableRow>
              )
            )}
          </TableBody>
        </Table>
         {isLoading && users.length === 0 && (
             <div className="text-center py-4 text-sm text-muted-foreground">
                Loading initial user data...
             </div>
         )}
      </CardContent>
    </Card>

    {/* Delete User Confirmation Dialog */}
    <Dialog open={isDeleteUserDialogOpen} onOpenChange={(isOpen) => {
        setIsDeleteUserDialogOpen(isOpen);
        if (!isOpen) {
            setUserToDelete(null);
            setDeletePassword('');
        }
    }}>
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
                <DialogTitle>Delete User Record</DialogTitle>
                <DialogDescription>
                    Are you sure you want to delete the Firestore record for {userToDelete?.name}?
                    This action cannot be undone. Enter your admin password to confirm.
                    Auth account (if any) will NOT be deleted.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                 <div className="space-y-1.5">
                    <Label htmlFor="deleteAdminPassword">Admin's Current Password</Label>
                    <Input 
                        id="deleteAdminPassword"
                        type="password"
                        placeholder="Enter your admin password"
                        value={deletePassword}
                        onChange={(e) => setDeletePassword(e.target.value)}
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
                    onClick={confirmDeleteUser} 
                    disabled={isSubmitting || !deletePassword.trim()}
                >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Delete User Record
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  );
}

    
