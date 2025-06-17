
'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { Loader2, Pencil, Trash2, UserPlus, FolderKanban, Briefcase, KeyRound, MailIcon } from 'lucide-react'; // Added KeyRound, MailIcon
import type { User, Group } from '@/types';
import { db, auth } from '@/lib/firebase'; // Import auth
import { collection, getDocs, deleteDoc, doc, addDoc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import { sendPasswordResetEmail } from 'firebase/auth'; // Import sendPasswordResetEmail
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
  username: z.string().min(3, "Username must be at least 3 characters.").regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, underscores, or hyphens.").optional().or(z.literal('')),
  email: z.string().email({ message: "Invalid email address." }).optional().or(z.literal('')),
  phoneNumber: z.string().optional().or(z.literal('')),
  role: z.enum(['teacher', 'admin', 'caja'], { required_error: "Role is required." }),
  photoUrl: z.string().url({ message: "Please enter a valid URL for photo." }).optional().or(z.literal('')),
  assignedGroupId: z.string().optional(),
  attendanceCode: z.string().min(4, "Code must be at least 4 characters.").max(20, "Code cannot exceed 20 characters.").optional().or(z.literal('')),
});

type StaffFormValues = z.infer<typeof staffFormSchema>;

const UNASSIGN_VALUE_KEY = "##UNASSIGNED##";

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

  const { toast } = useToast();
  const { reauthenticateCurrentUser, authUser } = useAuth();

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

  const handleOpenAddDialog = () => {
    setEditingStaff(null);
    form.reset({
      name: '', username: '', email: '', phoneNumber: '', role: 'teacher', photoUrl: '', assignedGroupId: undefined, attendanceCode: '',
    });
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
    setIsStaffFormDialogOpen(true);
  };

  const handleStaffFormSubmit = async (data: StaffFormValues) => {
    setIsSubmitting(true);

    const firestoreUserData: Partial<User> = {
      name: data.name,
      username: data.username || null,
      email: data.email || null,
      phoneNumber: data.phoneNumber || null,
      role: data.role,
      photoUrl: data.photoUrl || null,
      attendanceCode: data.role === 'teacher' ? (data.attendanceCode || null) : null,
    };

    let staffMemberId: string | undefined = editingStaff?.id;

    try {
      if (editingStaff) {
        const staffRef = doc(db, 'users', editingStaff.id);
        await updateDoc(staffRef, firestoreUserData);
        toast({ title: 'Staff User Updated', description: `${data.name}'s record updated successfully.` });
      } else {
        // Note: Creating a Firebase Auth user is separate. This only creates the Firestore record.
        // For users to log in, they need an Auth account, usually created via the /login page's signup.
        // If an admin creates a user here, they would need to tell the user to sign up with the SAME email
        // or the admin would need a more advanced tool to create Firebase Auth users (e.g., via Admin SDK).
        const docRef = await addDoc(collection(db, 'users'), firestoreUserData);
        staffMemberId = docRef.id;
        toast({
          title: 'Staff User Record Added',
          description: `${data.name} added to Firestore. If this user needs to log in, ensure they have a Firebase Authentication account (usually created via sign-up on the login page with the same email).`
        });
      }

      if (data.role === 'teacher' && staffMemberId) {
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
          toast({ title: 'Group Assignment Updated', description: `Teacher ${data.name}'s group assignment has been updated.` });
        }
      } else if (data.role !== 'teacher' && staffMemberId) {
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
      await fetchData();
    } catch (error: any) {
      toast({
        title: editingStaff ? 'Update Staff User Failed' : 'Add Staff User Failed',
        description: `An error occurred: ${error.message || 'Please try again.'}`,
        variant: 'destructive'
      });
      console.error("Firestore operation error:", error);
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
        description: `A password reset email has been sent to ${staffEmail}.`,
      });
    } catch (error: any) {
      let errorMessage = "Failed to send password reset email.";
      if (error.code === 'auth/user-not-found') {
        errorMessage = `No Firebase Authentication account found for ${staffEmail}. This user might only have a Firestore record.`;
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = `The email address ${staffEmail} is not valid.`;
      }
      toast({
        title: 'Password Reset Failed',
        description: errorMessage,
        variant: 'destructive',
      });
      console.error("Password reset error:", error);
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

      if (staffToDelete.role === 'teacher') {
        const assignedGroup = allGroups.find(g => g.teacherId === staffToDelete.id);
        if (assignedGroup) {
          const groupRef = doc(db, 'groups', assignedGroup.id);
          batch.update(groupRef, { teacherId: null });
        }
      }
      // IMPORTANT: Deleting Firebase Auth user is a separate, more sensitive operation.
      // This only deletes the Firestore record.
      // To delete the Auth user, you'd typically use Firebase Admin SDK on a backend.
      // Or, if the admin IS the user they want to delete (not typical for staff management),
      // they could call deleteUser(auth.currentUser).
      // For now, we only delete the Firestore record.

      await batch.commit();

      toast({ title: 'Staff User Record Deleted', description: `${staffToDelete.name}'s Firestore record removed and unassigned from groups if applicable. Auth account (if any) not affected.` });

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
         setIsDeleteStaffDialogOpen(true); // Keep dialog open if re-auth fails to allow retry
       }
    } finally {
      setIsSubmitting(false);
    }
  };

  const watchedRole = form.watch('role');

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

  return (
    <>
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Briefcase className="h-6 w-6 text-primary" /> Staff Management</CardTitle>
          <CardDescription>Manage teacher, admin, and cashier accounts. Assign teachers to groups, set attendance codes, and manage usernames.</CardDescription>
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
                <DialogDescription>
                  {editingStaff ? 'Update staff details in Firestore.' : 'Fill in staff details to add to Firestore.'}
                  {' '}Usernames are for login. Passwords are managed by users via Firebase Auth (admin can send reset email).
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleStaffFormSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
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
                        <FormLabel>Username (for login)</FormLabel>
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
                        <FormLabel>Email (for Firebase Auth & Password Resets)</FormLabel>
                        <FormControl><Input type="email" placeholder="jane.doe@example.com" {...field} /></FormControl>
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
                        <FormLabel>Role</FormLabel>
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
                  {watchedRole === 'teacher' && (
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
                                    {group.name} ({group.studentIds?.length || 0} students, Teacher: {group.teacherId ? allGroups.find(g=>g.id === group.id)?.name || 'Assigned' : 'None'})
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
                            <FormLabel>Attendance Code (for Teacher)</FormLabel>
                            <FormControl><Input placeholder="e.g., TCH001" {...field} /></FormControl>
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
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isSubmitting}>
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
              const assignedGroup = staff.role === 'teacher' ? allGroups.find(g => g.teacherId === staff.id) : null;
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
                <TableCell>{assignedGroup ? assignedGroup.name : (staff.role === 'teacher' ? 'Unassigned' : 'N/A')}</TableCell>
                <TableCell>{staff.role === 'teacher' ? (staff.attendanceCode || <span className="text-muted-foreground text-xs">Not set</span>) : 'N/A'}</TableCell>
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
                <DialogDescription>
                    Are you sure you want to delete the Firestore record for {staffToDelete?.name}?
                    This action cannot be undone. Enter your admin password to confirm.
                    Auth account (if any) will NOT be deleted. The teacher will also be unassigned from any group.
                </DialogDescription>
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

