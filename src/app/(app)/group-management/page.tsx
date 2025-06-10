
'use client';

import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Loader2, PlusCircle, Users, Edit, Trash2, CalendarIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where } from 'firebase/firestore';
import type { Group, User } from '@/types';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, isValid, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';

const groupFormSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  type: z.enum(['Saturday', 'Sunday'], { required_error: "Group type is required." }),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date().optional().nullable(), // Allow null for optional end date
});

type GroupFormValues = z.infer<typeof groupFormSchema>;

export default function GroupManagementPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGroupFormDialogOpen, setIsGroupFormDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  
  const [isManageStudentsDialogOpen, setIsManageStudentsDialogOpen] = useState(false);
  const [selectedGroupForStudentManagement, setSelectedGroupForStudentManagement] = useState<Group | null>(null);
  const [selectedStudentIdsForGroup, setSelectedStudentIdsForGroup] = useState<string[]>([]);
  const [studentsForDialog, setStudentsForDialog] = useState<User[]>([]);
  const [isLoadingStudentsForDialog, setIsLoadingStudentsForDialog] = useState(false);

  const { toast } = useToast();

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: '',
      type: 'Saturday',
      startDate: undefined,
      endDate: undefined,
    },
  });

  const fetchGroups = async () => {
    setIsLoadingGroups(true);
    try {
      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
    } catch (error) {
      console.error("Error fetching groups:", error);
      toast({ title: 'Error fetching groups', description: 'Could not load groups from Firestore.', variant: 'destructive' });
    } finally {
      setIsLoadingGroups(false);
    }
  };

  useEffect(() => {
    fetchGroups();
  }, []);

  const handleGroupFormSubmit = async (data: GroupFormValues) => {
    setIsSubmitting(true);
    try {
      if (editingGroup) { // Update existing group
        const groupRef = doc(db, 'groups', editingGroup.id);
        const updatedGroupData = {
          name: data.name,
          type: data.type,
          startDate: data.startDate.toISOString(),
          endDate: data.endDate ? data.endDate.toISOString() : null, // Store as null if undefined
        };
        await updateDoc(groupRef, updatedGroupData);
        
        setGroups(prevGroups => prevGroups.map(g => 
          g.id === editingGroup.id ? { ...g, ...updatedGroupData, studentIds: g.studentIds } : g // Preserve studentIds
        ));
        toast({ title: 'Group Updated', description: `Group "${data.name}" updated successfully.` });

      } else { // Create new group
        const newGroupDataToSave = {
          name: data.name,
          type: data.type,
          startDate: data.startDate.toISOString(),
          endDate: data.endDate ? data.endDate.toISOString() : null, // Store as null if undefined
          studentIds: [], 
        };
        const docRef = await addDoc(collection(db, 'groups'), newGroupDataToSave);
        
        const newGroupWithId: Group = {
          ...(newGroupDataToSave as Omit<Group, 'id' | 'studentIds'> & {studentIds: string[]}), // Type assertion for studentIds
          id: docRef.id,
          studentIds: []
        };
        setGroups(prevGroups => [...prevGroups, newGroupWithId]);
        toast({ title: 'Group Created', description: `${data.name} created successfully.` });
      }
      
      form.reset({ name: '', type: 'Saturday', startDate: undefined, endDate: undefined });
      setEditingGroup(null);
      setIsGroupFormDialogOpen(false);
    } catch (error) {
      console.error("Error saving group:", error);
      toast({ title: editingGroup ? 'Update Group Failed' : 'Create Group Failed', description: 'Could not save the group.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditGroupDialog = (group: Group) => {
    setEditingGroup(group);
    form.reset({
      name: group.name,
      type: group.type,
      startDate: group.startDate ? parseISO(group.startDate) : new Date(),
      endDate: group.endDate ? parseISO(group.endDate) : null,
    });
    setIsGroupFormDialogOpen(true);
  };

  const openAddGroupDialog = () => {
    setEditingGroup(null);
    form.reset({ name: '', type: 'Saturday', startDate: new Date(), endDate: undefined });
    setIsGroupFormDialogOpen(true);
  };


  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This action cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      setGroups(prevGroups => prevGroups.filter(g => g.id !== groupId));
      toast({ title: 'Group Deleted', description: `Group "${groupName}" removed successfully.` });
    } catch (error)      {
      console.error("Error deleting group:", error);
      toast({ title: 'Delete Failed', description: 'Could not delete the group.', variant: 'destructive' });
    }
  };
  
  const openManageStudentsDialog = async (group: Group) => {
    setSelectedGroupForStudentManagement(group);
    setSelectedStudentIdsForGroup(Array.isArray(group.studentIds) ? [...group.studentIds] : []);
    setIsManageStudentsDialogOpen(true);
    
    setIsLoadingStudentsForDialog(true);
    setStudentsForDialog([]); 
    try {
      const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'));
      const studentsSnapshot = await getDocs(studentQuery);
      setStudentsForDialog(studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));
    } catch (error) {
      console.error("Error fetching students for dialog:", error);
      toast({ title: 'Error fetching students', description: 'Could not load students for the dialog.', variant: 'destructive' });
    } finally {
      setIsLoadingStudentsForDialog(false);
    }
  };

  const handleStudentSelectionChange = (studentId: string, checked: boolean) => {
    setSelectedStudentIdsForGroup(prev => 
      checked ? [...prev, studentId] : prev.filter(id => id !== studentId)
    );
  };

  const handleSaveStudentAssignments = async () => {
    if (!selectedGroupForStudentManagement) return;
    setIsSubmitting(true);
    try {
      const groupRef = doc(db, 'groups', selectedGroupForStudentManagement.id);
      await updateDoc(groupRef, { studentIds: selectedStudentIdsForGroup });
      
      setGroups(prevGroups => prevGroups.map(g => 
        g.id === selectedGroupForStudentManagement.id 
        ? { ...g, studentIds: selectedStudentIdsForGroup } 
        : g
      ));

      toast({ title: 'Students Updated', description: `Student assignments for group "${selectedGroupForStudentManagement.name}" updated.` });
      setIsManageStudentsDialogOpen(false);
      setSelectedGroupForStudentManagement(null);
    } catch (error) {
      console.error("Error updating students in group:", error);
      toast({ title: 'Update Failed', description: 'Could not update student assignments.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatDateDisplay = (dateInput?: Date | string | null) => {
    if (!dateInput) return 'N/A';
    let date: Date;
    if (typeof dateInput === 'string') {
      date = parseISO(dateInput);
    } else {
      date = dateInput;
    }
    return isValid(date) ? format(date, 'PPP') : 'Invalid Date';
  };


  if (isLoadingGroups && groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Group Management</CardTitle>
          <CardDescription>Create and manage student groups for specific days and durations.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading groups...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Group Management</CardTitle>
            <CardDescription>Create and manage student groups for specific days and durations.</CardDescription>
          </div>
          <Dialog open={isGroupFormDialogOpen} onOpenChange={(isOpen) => {
            setIsGroupFormDialogOpen(isOpen);
            if (!isOpen) {
              form.reset({ name: '', type: 'Saturday', startDate: undefined, endDate: undefined });
              setEditingGroup(null);
            }
          }}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-sm" onClick={openAddGroupDialog}>
                <PlusCircle className="size-3.5" />
                Add New Group
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingGroup ? 'Edit Group' : 'Create New Group'}</DialogTitle>
                <DialogDescription>
                  {editingGroup ? 'Update the details for this group.' : 'Fill in the details for the new group. You can add students later.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(handleGroupFormSubmit)} className="space-y-4 py-4">
                <div>
                  <Label htmlFor="groupName">Group Name</Label>
                  <Input
                    id="groupName"
                    placeholder="E.g., Saturday Morning Beginners"
                    {...form.register('name')}
                    className="mt-1"
                  />
                  {form.formState.errors.name && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.name.message}</p>
                  )}
                </div>

                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <div>
                      <Label>Group Type</Label>
                      <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value || "Saturday"}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select group type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Saturday">Saturday Group</SelectItem>
                          <SelectItem value="Sunday">Sunday Group</SelectItem>
                        </SelectContent>
                      </Select>
                      {form.formState.errors.type && (
                        <p className="text-sm text-destructive mt-1">{form.formState.errors.type.message}</p>
                      )}
                    </div>
                  )}
                />
                
                <Controller
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                        <div>
                            <Label>Start Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal mt-1",
                                    !field.value && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                <Calendar
                                    mode="single"
                                    selected={field.value}
                                    onSelect={field.onChange}
                                    initialFocus
                                />
                                </PopoverContent>
                            </Popover>
                            {form.formState.errors.startDate && (
                                <p className="text-sm text-destructive mt-1">{form.formState.errors.startDate.message}</p>
                            )}
                        </div>
                    )}
                />

                <Controller
                    control={form.control}
                    name="endDate"
                    render={({ field }) => (
                        <div>
                            <Label>End Date (Optional)</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                <Button
                                    variant={"outline"}
                                    className={cn(
                                    "w-full justify-start text-left font-normal mt-1",
                                    !field.value && "text-muted-foreground"
                                    )}
                                >
                                    <CalendarIcon className="mr-2 h-4 w-4" />
                                    {field.value ? format(field.value, "PPP") : <span>Pick a date or clear</span>}
                                </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                        mode="single"
                                        selected={field.value || undefined} // Pass undefined if null to allow deselection in Calendar
                                        onSelect={(date) => field.onChange(date || null)} // Set to null if date is undefined (cleared)
                                        initialFocus={!!field.value}
                                    />
                                    <Button variant="ghost" className="w-full mt-1 text-sm" onClick={() => field.onChange(null)}>Clear End Date</Button>
                                </PopoverContent>
                            </Popover>
                             {form.formState.errors.endDate && (
                                <p className="text-sm text-destructive mt-1">{form.formState.errors.endDate.message}</p>
                            )}
                        </div>
                    )}
                />

                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      Cancel
                    </Button>
                  </DialogClose>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {editingGroup ? 'Save Changes' : 'Create Group'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {isLoadingGroups && groups.length > 0 && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="ml-2 text-sm text-muted-foreground">Refreshing groups...</p>
            </div>
          )}
          {groups.length === 0 && !isLoadingGroups ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">No groups found. Get started by adding a new group.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Group Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Students</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>{group.type}</TableCell>
                    <TableCell>{formatDateDisplay(group.startDate)}</TableCell>
                    <TableCell>{formatDateDisplay(group.endDate)}</TableCell>
                    <TableCell>{Array.isArray(group.studentIds) ? group.studentIds.length : 0} student(s)</TableCell>
                    <TableCell className="space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openManageStudentsDialog(group)}>
                        <Users className="mr-1 h-3.5 w-3.5" /> Manage Students
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditGroupDialog(group)}>
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

      {/* Manage Students Dialog */}
      <Dialog open={isManageStudentsDialogOpen} onOpenChange={(isOpen) => {
        setIsManageStudentsDialogOpen(isOpen);
        if (!isOpen) {
          setSelectedGroupForStudentManagement(null);
          setSelectedStudentIdsForGroup([]);
          setStudentsForDialog([]); 
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Students for {selectedGroupForStudentManagement?.name}</DialogTitle>
            <DialogDescription>
              Select students to add or remove from this group.
            </DialogDescription>
          </DialogHeader>
          {isLoadingStudentsForDialog ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading students...</p>
            </div>
          ) : (
            <div className="py-4 space-y-2 max-h-60 overflow-y-auto">
              {studentsForDialog.length === 0 && <p className="text-sm text-muted-foreground">No students found to add.</p>}
              {studentsForDialog.map(student => (
                <div key={student.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`student-${student.id}`}
                    checked={selectedStudentIdsForGroup.includes(student.id)}
                    onCheckedChange={(checked) => handleStudentSelectionChange(student.id, !!checked)}
                  />
                  <Label htmlFor={`student-${student.id}`} className="font-normal">
                    {student.name}
                  </Label>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSaveStudentAssignments} disabled={isSubmitting || isLoadingStudentsForDialog}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

