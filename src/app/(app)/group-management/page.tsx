
'use client';

import React, { useState, useEffect, useMemo } from 'react';
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
import { Loader2, PlusCircle, Users, Edit, Trash2, CalendarIcon, Search, UserCheck } from 'lucide-react';
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
  endDate: z.date().optional().nullable(),
  teacherId: z.string().optional(),
});

type GroupFormValues = z.infer<typeof groupFormSchema>;

export default function GroupManagementPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]); // Store all users
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGroupFormDialogOpen, setIsGroupFormDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  
  const [isManageStudentsDialogOpen, setIsManageStudentsDialogOpen] = useState(false);
  const [selectedGroupForStudentManagement, setSelectedGroupForStudentManagement] = useState<Group | null>(null);
  const [selectedStudentIdsForGroup, setSelectedStudentIdsForGroup] = useState<string[]>([]);
  const [studentSearchTerm, setStudentSearchTerm] = useState(''); // For student search in dialog
  const [isLoadingStudentsForDialog, setIsLoadingStudentsForDialog] = useState(false); // Separate loading for dialog students


  const { toast } = useToast();

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: '',
      type: 'Saturday',
      startDate: undefined,
      endDate: undefined,
      teacherId: '',
    },
  });

  const teachers = useMemo(() => allUsers.filter(user => user.role === 'teacher'), [allUsers]);
  const students = useMemo(() => allUsers.filter(user => user.role === 'student'), [allUsers]);

  const fetchInitialData = async () => {
    setIsLoadingData(true);
    try {
      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
      
      const usersSnapshot = await getDocs(collection(db, 'users'));
      setAllUsers(usersSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));

    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load groups or users.', variant: 'destructive' });
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleGroupFormSubmit = async (data: GroupFormValues) => {
    setIsSubmitting(true);
    try {
      const groupDataToSave = {
        name: data.name,
        type: data.type,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate ? data.endDate.toISOString() : null,
        teacherId: data.teacherId || null, // Store null if empty string
      };

      if (editingGroup) {
        const groupRef = doc(db, 'groups', editingGroup.id);
        await updateDoc(groupRef, {
            ...groupDataToSave,
            studentIds: editingGroup.studentIds || [] // Preserve existing studentIds
        });
        
        setGroups(prevGroups => prevGroups.map(g => 
          g.id === editingGroup.id ? { ...g, ...groupDataToSave, studentIds: g.studentIds } : g
        ));
        toast({ title: 'Group Updated', description: `Group "${data.name}" updated successfully.` });

      } else {
        const newGroupWithStudentIds = {
            ...groupDataToSave,
            studentIds: [], 
        };
        const docRef = await addDoc(collection(db, 'groups'), newGroupWithStudentIds);
        
        setGroups(prevGroups => [...prevGroups, { ...newGroupWithStudentIds, id: docRef.id }]);
        toast({ title: 'Group Created', description: `${data.name} created successfully.` });
      }
      
      form.reset({ name: '', type: 'Saturday', startDate: undefined, endDate: undefined, teacherId: '' });
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
      teacherId: group.teacherId || '',
    });
    setIsGroupFormDialogOpen(true);
  };

  const openAddGroupDialog = () => {
    setEditingGroup(null);
    form.reset({ name: '', type: 'Saturday', startDate: new Date(), endDate: undefined, teacherId: '' });
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
    setStudentSearchTerm(''); // Reset search term
    setIsManageStudentsDialogOpen(true);
    // Students are already fetched in allUsers, just need to filter them if a search term is present
    // No separate loading state needed here if allStudents is populated
  };

  const filteredStudentsForDialog = useMemo(() => {
    if (!studentSearchTerm) return students;
    return students.filter(student => 
      student.name.toLowerCase().includes(studentSearchTerm.toLowerCase())
    );
  }, [students, studentSearchTerm]);


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

  const getTeacherName = (teacherId?: string) => {
    if (!teacherId) return 'N/A';
    const teacher = teachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : 'Unknown Teacher';
  };


  if (isLoadingData && groups.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Group Management</CardTitle>
          <CardDescription>Create and manage student groups for specific days and durations.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading groups and users...</p>
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
            <CardDescription>Create and manage student groups, assign teachers, and manage student enrollments.</CardDescription>
          </div>
          <Dialog open={isGroupFormDialogOpen} onOpenChange={(isOpen) => {
            setIsGroupFormDialogOpen(isOpen);
            if (!isOpen) {
              form.reset({ name: '', type: 'Saturday', startDate: undefined, endDate: undefined, teacherId: '' });
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
                  {editingGroup ? 'Update the details for this group.' : 'Fill in the details for the new group.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={form.handleSubmit(handleGroupFormSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
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
                                        selected={field.value || undefined}
                                        onSelect={(date) => field.onChange(date || null)}
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
                
                <Controller
                  control={form.control}
                  name="teacherId"
                  render={({ field }) => (
                    <div>
                      <Label>Assign Teacher (Optional)</Label>
                      <Select onValueChange={field.onChange} value={field.value || ''} defaultValue={field.value || ""}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Select a teacher" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">No Teacher Assigned</SelectItem>
                          {teachers.map(teacher => (
                            <SelectItem key={teacher.id} value={teacher.id}>
                              {teacher.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {form.formState.errors.teacherId && (
                        <p className="text-sm text-destructive mt-1">{form.formState.errors.teacherId.message}</p>
                      )}
                    </div>
                  )}
                />


                <DialogFooter className="pt-4">
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
          {isLoadingData && groups.length > 0 && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="ml-2 text-sm text-muted-foreground">Refreshing groups...</p>
            </div>
          )}
          {groups.length === 0 && !isLoadingData ? (
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
                  <TableHead>Teacher</TableHead>
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
                    <TableCell>{getTeacherName(group.teacherId)}</TableCell>
                    <TableCell>{Array.isArray(group.studentIds) ? group.studentIds.length : 0}</TableCell>
                    <TableCell className="space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openManageStudentsDialog(group)} className="text-xs">
                        <UserCheck className="mr-1 h-3.5 w-3.5" /> Students
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
          setStudentSearchTerm('');
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Students for {selectedGroupForStudentManagement?.name}</DialogTitle>
            <DialogDescription>
              Select students to add or remove from this group. Search by name.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    type="search"
                    placeholder="Search student by name..."
                    value={studentSearchTerm}
                    onChange={(e) => setStudentSearchTerm(e.target.value)}
                    className="pl-8 w-full"
                />
            </div>
          </div>
          {isLoadingData && students.length === 0 ? ( // Check general loading if students aren't available yet
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-2">Loading students...</p>
            </div>
          ) : (
            <div className="py-2 space-y-2 max-h-60 overflow-y-auto">
              {filteredStudentsForDialog.length === 0 && (
                <p className="text-sm text-muted-foreground text-center">
                  {studentSearchTerm ? 'No students match your search.' : 'No students available.'}
                </p>
              )}
              {filteredStudentsForDialog.map(student => (
                <div key={student.id} className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded-md">
                  <Checkbox
                    id={`student-${student.id}`}
                    checked={selectedStudentIdsForGroup.includes(student.id)}
                    onCheckedChange={(checked) => handleStudentSelectionChange(student.id, !!checked)}
                  />
                  <Label htmlFor={`student-${student.id}`} className="font-normal flex-1 cursor-pointer">
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
            <Button type="button" onClick={handleSaveStudentAssignments} disabled={isSubmitting || (isLoadingData && students.length === 0) }>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Assignments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
