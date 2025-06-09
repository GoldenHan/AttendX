
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
import { Loader2, Pencil, Trash2, PlusCircle, Users, UserPlus, FolderKanban } from 'lucide-react';
import type { User } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, addDoc } from 'firebase/firestore';
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
import { Label } from "@/components/ui/label";
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

const userFormSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters." }),
  email: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')),
  role: z.enum(['student', 'teacher', 'admin'], { required_error: "Role is required." }),
  photoUrl: z.string().url({ message: "Please enter a valid URL for photo." }).optional().or(z.literal('')),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'Other']).optional(),
  notes: z.string().optional(),
});

type UserFormValues = z.infer<typeof userFormSchema>;

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: {
      name: '',
      email: '',
      role: 'student',
      photoUrl: '',
      level: undefined,
      notes: '',
    },
  });

  const watchedRole = form.watch('role');

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      setUsers(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
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

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) return;
    try {
      await deleteDoc(doc(db, 'users', userId));
      setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));
      toast({ title: 'User Deleted', description: 'User removed successfully.' });
    } catch (error) {
      console.error("Error deleting user:", error);
      toast({ title: 'Delete Failed', description: 'Could not delete the user.', variant: 'destructive' });
    }
  };

  const handleAddUserSubmit = async (data: UserFormValues) => {
    setIsSubmitting(true);
    try {
      const newUser: Omit<User, 'id'> = {
        name: data.name,
        email: data.email || undefined, // Store as undefined if empty for Firestore
        role: data.role,
      };

      if (data.role === 'student') {
        if (data.photoUrl) newUser.photoUrl = data.photoUrl; else delete newUser.photoUrl;
        if (data.level) newUser.level = data.level; else delete newUser.level;
        if (data.notes) newUser.notes = data.notes; else delete newUser.notes;
      }

      await addDoc(collection(db, 'users'), newUser);
      toast({ title: 'User Added', description: `${data.name} added successfully.` });
      form.reset({
        name: '',
        email: '',
        role: 'student',
        photoUrl: '',
        level: undefined,
        notes: '',
      });
      setIsAddUserDialogOpen(false);
      await fetchUsers(); 
    } catch (error) {
      console.error("Error adding user:", error);
      toast({ title: 'Add User Failed', description: 'Could not add the user.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditUser = (userId: string) => {
    toast({ title: 'Not Implemented', description: `Edit user (ID: ${userId}) functionality will be implemented soon.` });
  };
  
  if (isLoading && users.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> User Management</CardTitle>
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
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> User Management</CardTitle>
          <CardDescription>Manage student, teacher, and administrator accounts.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline" className="gap-1.5 text-sm">
            <Link href="/group-management">
              <FolderKanban className="size-3.5" />
              Manage Groups
            </Link>
          </Button>
          <Dialog open={isAddUserDialogOpen} onOpenChange={(isOpen) => {
            setIsAddUserDialogOpen(isOpen);
            if (!isOpen) {
              form.reset({
                  name: '',
                  email: '',
                  role: 'student',
                  photoUrl: '',
                  level: undefined,
                  notes: '',
              });
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-sm" onClick={() => form.reset({ role: 'student' })}>
                <UserPlus className="size-3.5" />
                Add User
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Add New User</DialogTitle>
                <DialogDescription>
                  Fill in the details for the new user. Click save when you're done.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleAddUserSubmit)} className="space-y-4 py-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
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
                        <FormControl>
                          <Input type="email" placeholder="john.doe@example.com" {...field} />
                        </FormControl>
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
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select a role" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="student">Student</SelectItem>
                            <SelectItem value="teacher">Teacher</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {watchedRole === 'student' && (
                    <>
                      <FormField
                        control={form.control}
                        name="photoUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Photo URL (Optional)</FormLabel>
                            <FormControl>
                              <Input type="url" placeholder="https://placehold.co/100x100.png" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="level"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Level (Optional)</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select student's level" />
                                </SelectTrigger>
                              </FormControl>
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
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Notes (Optional)</FormLabel>
                            <FormControl>
                              <Textarea placeholder="Any relevant notes about the student..." {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <DialogFooter>
                    <DialogClose asChild>
                      <Button type="button" variant="outline">
                        Cancel
                      </Button>
                    </DialogClose>
                    <Button type="submit" disabled={isSubmitting}>
                      {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Save User
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
                    'bg-green-500/20 text-green-700 dark:text-green-400'
                  }`}>
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </span>
                </TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="mr-2" onClick={() => handleEditUser(user.id)}>
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteUser(user.id)}>
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              !isLoading && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center">No users found.</TableCell>
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
  );
}
