
'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Loader2, PlusCircle, Users, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc } from 'firebase/firestore';
import type { Group } from '@/types';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const groupFormSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
});

type GroupFormValues = z.infer<typeof groupFormSchema>;

export default function GroupManagementPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddGroupDialogOpen, setIsAddGroupDialogOpen] = useState(false);
  const { toast } = useToast();

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: '',
    },
  });

  const fetchGroups = async () => {
    setIsLoading(true);
    try {
      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setGroups(groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)));
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast({ title: 'Error fetching groups', description: 'Could not load groups from Firestore.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleAddGroupSubmit = async (data: GroupFormValues) => {
    setIsSubmitting(true);
    try {
      const newGroup: Omit<Group, 'id'> = {
        name: data.name,
        studentIds: [], // Initialize with no students
      };
      await addDoc(collection(db, 'groups'), newGroup);
      toast({ title: 'Group Created', description: `${data.name} created successfully.` });
      form.reset();
      setIsAddGroupDialogOpen(false);
      await fetchGroups();
    } catch (error) {
      console.error("Error adding group:", error);
      toast({ title: 'Create Group Failed', description: 'Could not create the group.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This action cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      toast({ title: 'Group Deleted', description: `Group "${groupName}" removed successfully.` });
      await fetchGroups();
    } catch (error) {
      console.error("Error deleting group:", error);
      toast({ title: 'Delete Failed', description: 'Could not delete the group.', variant: 'destructive' });
    }
  };
  
  // Placeholder for edit functionality
  const handleEditGroup = (group: Group) => {
    toast({ title: 'Not Implemented', description: `Edit functionality for "${group.name}" will be added soon.` });
  };

  // Placeholder for managing students in a group
  const handleManageStudents = (group: Group) => {
    toast({ title: 'Not Implemented', description: `Managing students for "${group.name}" will be added soon.` });
  };


  if (isLoading && groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Group Management</CardTitle>
          <CardDescription>Create and manage student groups.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading groups...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Group Management</CardTitle>
          <CardDescription>Create and manage student groups.</CardDescription>
        </div>
        <Dialog open={isAddGroupDialogOpen} onOpenChange={(isOpen) => {
          setIsAddGroupDialogOpen(isOpen);
          if (!isOpen) form.reset();
        }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5 text-sm">
              <PlusCircle className="size-3.5" />
              Add New Group
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Group</DialogTitle>
              <DialogDescription>
                Enter a name for the new group. You can add students later.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(handleAddGroupSubmit)} className="space-y-4 py-4">
              <div>
                <Label htmlFor="groupName">Group Name</Label>
                <Input
                  id="groupName"
                  placeholder="E.g., Morning Study Group"
                  {...form.register('name')}
                  className="mt-1"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
                )}
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Group
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading && groups.length > 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="ml-2 text-sm text-muted-foreground">Refreshing groups...</p>
          </div>
        )}
        {groups.length === 0 && !isLoading ? (
          <div className="text-center py-10">
            <p className="text-muted-foreground">No groups found. Get started by adding a new group.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Group Name</TableHead>
                <TableHead>Students</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell className="font-medium">{group.name}</TableCell>
                  <TableCell>{group.studentIds.length} student(s)</TableCell>
                  <TableCell className="space-x-1">
                    <Button variant="outline" size="sm" onClick={() => handleManageStudents(group)}>
                      <Users className="mr-1 h-3.5 w-3.5" /> Manage Students
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleEditGroup(group)}>
                      <Edit className="h-4 w-4" />
                      <span className="sr-only">Edit Group</span>
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteGroup(group.id, group.name)}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete Group</span>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
