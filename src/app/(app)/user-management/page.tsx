
'use client';

import React, { useState, useEffect } from 'react';
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
import { Loader2, Pencil, Trash2, PlusCircle, Users } from 'lucide-react';
import type { User } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
// TODO: Implement Add/Edit User Dialog/Form
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from "@/components/ui/dialog";
// import { Input } from "@/components/ui/input";
// import { Label } from "@/components/ui/label";
// import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function UserManagementPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      setUsers(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    } catch (error) {
      console.error("Error fetching users:", error);
      toast({ title: 'Error fetching users', description: 'Could not load users from Firestore.', variant: 'destructive' });
    }
    setIsLoading(false);
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

  // Placeholder for Add User functionality
  const handleAddUser = () => {
    toast({ title: 'Not Implemented', description: 'Add user functionality will be implemented soon.' });
    // TODO: Open Add User Dialog
  };

  // Placeholder for Edit User functionality
  const handleEditUser = (userId: string) => {
    toast({ title: 'Not Implemented', description: `Edit user (ID: ${userId}) functionality will be implemented soon.` });
    // TODO: Open Edit User Dialog with user data
  };
  
  if (isLoading) {
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
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> User Management</CardTitle>
        <CardDescription>Manage student, teacher, and administrator accounts.</CardDescription>
        <Button size="sm" className="ml-auto gap-1.5 text-sm" onClick={handleAddUser}>
          <PlusCircle className="size-3.5" />
          Add User (Soon)
        </Button>
      </CardHeader>
      <CardContent>
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
                    'bg-green-500/20 text-green-700 dark:text-green-400' // student
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
              <TableRow>
                <TableCell colSpan={4} className="text-center">No users found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

