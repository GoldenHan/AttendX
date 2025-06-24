
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
  DialogDescription as DialogPrimitiveDescription, 
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Loader2, PlusCircle, Users, Edit, Trash2, CalendarIcon, Search, UserCheck, UserCircle2, Building, ArrowRightLeft } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, writeBatch, arrayUnion, arrayRemove } from 'firebase/firestore';
import type { Group, User, ClassScheduleConfiguration, Sede } from '@/types'; 
import { DEFAULT_CLASS_SCHEDULE_CONFIG } from '@/types'; 
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
import { useAuth } from '@/contexts/AuthContext';

const groupFormSchema = z.object({
  name: z.string().min(2, { message: "Group name must be at least 2 characters." }),
  type: z.enum(['Saturday', 'Sunday', 'SaturdayAndSunday', 'Daily'], { required_error: "Group type is required." }),
  startDate: z.date({ required_error: "Start date is required." }),
  endDate: z.date().optional().nullable(),
  teacherId: z.string().optional().or(z.literal('')),
  sedeId: z.string().optional().or(z.literal('')), // Added Sede ID
});

type GroupFormValues = z.infer<typeof groupFormSchema>;

const NO_TEACHER_ASSIGNED_VALUE = "##NO_TEACHER##";
const NO_SEDE_ASSIGNED_VALUE = "##NO_SEDE##";

export default function GroupManagementPage() {
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allTeachers, setAllTeachers] = useState<User[]>([]);
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allSedes, setAllSedes] = useState<Sede[]>([]);
  const [classScheduleConfig, setClassScheduleConfig] = useState<ClassScheduleConfiguration>(DEFAULT_CLASS_SCHEDULE_CONFIG);
  
  const [isLoadingData, setIsLoadingData] = useState(true); // Combined loading state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGroupFormDialogOpen, setIsGroupFormDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  
  const [isManageStudentsDialogOpen, setIsManageStudentsDialogOpen] = useState(false);
  const [selectedGroupForManagement, setSelectedGroupForManagement] = useState<Group | null>(null);
  const [studentsToAssign, setStudentsToAssign] = useState<string[]>([]);
  const [studentsToRemove, setStudentsToRemove] = useState<string[]>([]);


  const { toast } = useToast();
  const { firestoreUser } = useAuth();

  const form = useForm<GroupFormValues>({
    resolver: zodResolver(groupFormSchema),
    defaultValues: {
      name: '',
      type: 'Saturday',
      startDate: new Date(),
      endDate: undefined,
      teacherId: '',
      sedeId: '',
    },
  });

  const fetchInitialData = useCallback(async () => {
    if (!firestoreUser?.institutionId) {
      setIsLoadingData(false);
      if(firestoreUser) toast({title: "Error", description: "No institution context for your account.", variant: "destructive"});
      return;
    }
    setIsLoadingData(true);
    try {
      const institutionId = firestoreUser.institutionId;

      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', institutionId));
      const teachersQuery = query(collection(db, 'users'), where('role', 'in', ['teacher', 'admin']), where('institutionId', '==', institutionId));
      const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId));
      const sedesQuery = query(collection(db, 'sedes'), where('institutionId', '==', institutionId));
      const scheduleConfigPromise = getDoc(doc(db, 'institutionScheduleConfigs', institutionId)); 

      const [groupsSnapshot, teachersSnapshot, studentsSnapshot, sedesSnapshot, scheduleConfigSnap] = await Promise.all([
        getDocs(groupsQuery),
        getDocs(teachersQuery),
        getDocs(studentsQuery),
        getDocs(sedesQuery),
        scheduleConfigPromise
      ]);

      setAllGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
      setAllTeachers(teachersSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));
      setAllStudents(studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));
      setAllSedes(sedesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Sede)));

      if (scheduleConfigSnap.exists()) {
        const configData = scheduleConfigSnap.data() as ClassScheduleConfiguration;
        setClassScheduleConfig(configData);
        if (configData.scheduleType !== 'NotSet' && configData.scheduleType !== 'Daily') {
            form.setValue('type', configData.scheduleType);
        } else if (configData.scheduleType === 'Daily') {
            form.setValue('type', 'Daily');
        }
      } else {
        setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG);
      }
    } catch (error) {
      console.error("Error fetching initial data for Group Management:", error);
      toast({ title: 'Error fetching data', description: 'Could not load necessary data for group management.', variant: 'destructive' });
    } finally {
      setIsLoadingData(false);
    }
  }, [toast, form, firestoreUser]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const canManageGroupsOverall = firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor';

  const displayedGroups = useMemo(() => {
    if (!firestoreUser) return [];
    if (firestoreUser.role === 'admin') {
      return allGroups; // Already filtered by institution
    }
    if (firestoreUser.role === 'supervisor') {
      return allGroups.filter(group => group.sedeId === firestoreUser.sedeId);
    }
    if (firestoreUser.role === 'teacher') {
      return allGroups.filter(group => group.teacherId === firestoreUser.id);
    }
    return [];
  }, [allGroups, firestoreUser]);

  const availableTeachersForAssignment = useMemo(() => {
    if (!firestoreUser || !allTeachers.length) return [];
    const currentSedeId = form.getValues('sedeId');
    if (firestoreUser.role === 'admin') {
      if (currentSedeId && currentSedeId !== NO_SEDE_ASSIGNED_VALUE) {
        return allTeachers.filter(t => t.sedeId === currentSedeId || !t.sedeId); 
      }
      return allTeachers;
    }
    if (firestoreUser.role === 'supervisor' && firestoreUser.sedeId) {
      return allTeachers.filter(t => t.sedeId === firestoreUser.sedeId);
    }
    return [];
  }, [allTeachers, firestoreUser, form.watch('sedeId')]);

  const availableSedesForGroupAssignment = useMemo(() => {
    if (!firestoreUser || firestoreUser.role !== 'admin' || !allSedes.length) return [];
    return allSedes; 
  }, [allSedes, firestoreUser]);


  const getValidatedStudentCount = useCallback((groupId: string) => {
    const group = allGroups.find(g => g.id === groupId);
    if (!group || !Array.isArray(group.studentIds) || group.studentIds.length === 0) return 0;
    return group.studentIds.filter(studentId => allStudents.some(s => s.id === studentId)).length;
  }, [allGroups, allStudents]);

  const handleGroupFormSubmit = async (data: GroupFormValues) => {
    if (!firestoreUser?.institutionId) {
      toast({ title: "Error", description: "No institution context for your account.", variant: "destructive" });
      return;
    }
    if (!canManageGroupsOverall) {
      toast({ title: 'Permission Denied', description: 'You do not have permission to create or edit groups.', variant: 'destructive' });
      return;
    }

    let sedeIdToSave = data.sedeId === NO_SEDE_ASSIGNED_VALUE ? null : data.sedeId || null;

    if (firestoreUser.role === 'supervisor') {
      if (!firestoreUser.sedeId) {
        toast({ title: "Sede Required", description: "Supervisors must be assigned to a Sede to manage groups.", variant: "destructive" });
        return;
      }
      sedeIdToSave = firestoreUser.sedeId; 
    }

    setIsSubmitting(true);
    try {
      const groupDataToSave: Omit<Group, 'id' | 'studentIds'> = {
        name: data.name,
        type: data.type,
        startDate: data.startDate.toISOString(),
        endDate: data.endDate ? data.endDate.toISOString() : null,
        teacherId: data.teacherId && data.teacherId !== NO_TEACHER_ASSIGNED_VALUE ? data.teacherId : null,
        institutionId: firestoreUser.institutionId,
        sedeId: sedeIdToSave,
      };

      if (editingGroup) {
        if (firestoreUser.role === 'supervisor' && editingGroup.sedeId !== firestoreUser.sedeId) {
          toast({ title: "Permission Denied", description: "Supervisors can only edit groups within their own Sede.", variant: "destructive" });
          setIsSubmitting(false); return;
        }
        const groupRef = doc(db, 'groups', editingGroup.id);
        await updateDoc(groupRef, { ...groupDataToSave });
        toast({ title: 'Group Updated', description: `Group "${data.name}" updated successfully.` });
      } else {
        await addDoc(collection(db, 'groups'), { ...groupDataToSave, studentIds: [] });
        toast({ title: 'Group Created', description: `${data.name} created successfully.` });
      }
      
      form.reset({ 
        name: '', 
        type: classScheduleConfig.scheduleType !== 'NotSet' ? classScheduleConfig.scheduleType : 'Saturday', 
        startDate: new Date(), 
        endDate: undefined, 
        teacherId: '',
        sedeId: firestoreUser.role === 'supervisor' ? firestoreUser.sedeId || '' : '',
      });
      setEditingGroup(null);
      setIsGroupFormDialogOpen(false);
      await fetchInitialData(); 
    } catch (error) {
      console.error("Error saving group:", error);
      toast({ title: editingGroup ? 'Update Group Failed' : 'Create Group Failed', description: 'Could not save the group.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditGroupDialog = (group: Group) => {
    if (!canManageGroupsOverall) {
      toast({ title: 'Permission Denied', description: 'You do not have permission to edit groups.', variant: 'destructive' });
      return;
    }
    if (firestoreUser?.role === 'supervisor' && group.sedeId !== firestoreUser.sedeId) {
       toast({ title: 'Permission Denied', description: "Supervisors can only edit groups in their Sede.", variant: 'destructive' });
      return;
    }
    setEditingGroup(group);
    form.reset({
      name: group.name,
      type: group.type,
      startDate: group.startDate ? parseISO(group.startDate) : new Date(),
      endDate: group.endDate ? parseISO(group.endDate) : null,
      teacherId: group.teacherId || '',
      sedeId: group.sedeId || '',
    });
    setIsGroupFormDialogOpen(true);
  };

  const openAddGroupDialog = () => {
    if (!canManageGroupsOverall) {
      toast({ title: 'Permission Denied', description: 'You do not have permission to add groups.', variant: 'destructive' });
      return;
    }
    setEditingGroup(null);
    const defaultType = classScheduleConfig.scheduleType !== 'NotSet' ? classScheduleConfig.scheduleType : 'Saturday';
    form.reset({ 
        name: '', 
        type: defaultType, 
        startDate: new Date(), 
        endDate: undefined, 
        teacherId: '',
        sedeId: firestoreUser?.role === 'supervisor' ? (firestoreUser.sedeId || '') : '', 
    });
    setIsGroupFormDialogOpen(true);
  };

  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    const groupToDelete = allGroups.find(g => g.id === groupId);
    if (!groupToDelete) return;

    if (!canManageGroupsOverall) {
      toast({ title: 'Permission Denied', description: 'You do not have permission to delete groups.', variant: 'destructive' });
      return;
    }
    if (firestoreUser?.role === 'supervisor' && groupToDelete.sedeId !== firestoreUser.sedeId) {
      toast({ title: 'Permission Denied', description: "Supervisors can only delete groups in their Sede.", variant: 'destructive' });
      return;
    }
    if (!confirm(`Are you sure you want to delete the group "${groupName}"? This action cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'groups', groupId));
      toast({ title: 'Group Deleted', description: `Group "${groupName}" removed successfully.` });
      await fetchInitialData();
    } catch (error)      {
      console.error("Error deleting group:", error);
      toast({ title: 'Delete Failed', description: 'Could not delete the group.', variant: 'destructive' });
    }
  };

  const openManageStudentsDialog = (group: Group) => {
    if (firestoreUser?.role === 'teacher' && group.teacherId !== firestoreUser.id) {
        toast({ title: 'Permission Denied', description: 'You can only manage students for your own groups.', variant: 'destructive' });
        return;
    }
    if (firestoreUser?.role === 'supervisor' && group.sedeId !== firestoreUser.sedeId) {
        toast({ title: 'Permission Denied', description: 'You can only manage students for groups in your Sede.', variant: 'destructive' });
        return;
    }
    setSelectedGroupForManagement(group);
    setStudentsToAssign([]);
    setStudentsToRemove([]);
    setIsManageStudentsDialogOpen(true);
  };

  const { studentsInCurrentGroup, availableStudents } = useMemo(() => {
    if (!selectedGroupForManagement) return { studentsInCurrentGroup: [], availableStudents: [] };

    const studentIdsInAnyGroup = new Set(allGroups.flatMap(g => g.studentIds));
    const studentsInGroup = allStudents.filter(s => selectedGroupForManagement.studentIds.includes(s.id));
    
    let potentialAvailable = allStudents.filter(s => !studentIdsInAnyGroup.has(s.id));
    if (firestoreUser?.role === 'supervisor' && firestoreUser.sedeId) {
        potentialAvailable = potentialAvailable.filter(s => s.sedeId === firestoreUser.sedeId || !s.sedeId);
    }
    
    return { studentsInCurrentGroup: studentsInGroup, availableStudents: potentialAvailable };
  }, [selectedGroupForManagement, allStudents, allGroups, firestoreUser]);

  const handleUpdateGroupMembers = async () => {
    if (!selectedGroupForManagement || !firestoreUser?.institutionId) return;
    if (studentsToAssign.length === 0 && studentsToRemove.length === 0) {
      toast({ title: 'No Changes', description: 'No students were selected to be added or removed.' });
      return;
    }
    setIsSubmitting(true);
    try {
        const groupRef = doc(db, 'groups', selectedGroupForManagement.id);
        const batch = writeBatch(db);

        if (studentsToRemove.length > 0) {
            batch.update(groupRef, { studentIds: arrayRemove(...studentsToRemove) });
        }
        if (studentsToAssign.length > 0) {
            batch.update(groupRef, { studentIds: arrayUnion(...studentsToAssign) });
            // If group has a Sede, assign that Sede to the new students
            if (selectedGroupForManagement.sedeId) {
                studentsToAssign.forEach(studentId => {
                    const studentRef = doc(db, 'users', studentId);
                    batch.update(studentRef, { sedeId: selectedGroupForManagement.sedeId });
                });
            }
        }
        
        await batch.commit();
        toast({ title: 'Group Updated', description: 'Student membership has been updated successfully.' });
        
        await fetchInitialData();
        
        // After fetching, find the updated group to keep the dialog fresh
        const updatedGroup = allGroups.find(g => g.id === selectedGroupForManagement.id) || selectedGroupForManagement;
        const newStudentIds = updatedGroup.studentIds.concat(studentsToAssign).filter(id => !studentsToRemove.includes(id));
        setSelectedGroupForManagement({...updatedGroup, studentIds: newStudentIds});

    } catch (error) {
        console.error("Error updating group members:", error);
        toast({ title: 'Update Failed', description: 'Could not update student membership.', variant: 'destructive' });
    } finally {
        setIsSubmitting(false);
        setIsManageStudentsDialogOpen(false);
    }
  };


  const formatDateDisplay = (dateInput?: Date | string | null) => {
    if (!dateInput) return 'N/A';
    let date: Date;
    if (typeof dateInput === 'string') date = parseISO(dateInput);
    else date = dateInput;
    return isValid(date) ? format(date, 'PPP') : 'Invalid Date';
  };

  const getTeacherName = (teacherId?: string | null) => {
    if (!teacherId) return 'N/A';
    const teacher = allTeachers.find(t => t.id === teacherId);
    return teacher ? teacher.name : 'Unknown Teacher';
  };
  
  const getSedeNameForGroup = (sedeId?: string | null) => {
    if (!sedeId) return 'N/A (No Sede)';
    const sede = allSedes.find(s => s.id === sedeId);
    return sede ? sede.name : 'Unknown Sede';
  };


  if (isLoadingData || !firestoreUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Group Management</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading data for your institution...</p>
        </CardContent>
      </Card>
    );
  }
  if (!firestoreUser.institutionId && !isLoadingData) {
     return (
      <Card>
        <CardHeader><CardTitle>Institution Not Set</CardTitle></CardHeader>
        <CardContent><p>Your account is not associated with an institution. Please contact platform support.</p></CardContent>
      </Card>
    );
  }
  if (firestoreUser.role === 'supervisor' && !firestoreUser.sedeId && !isLoadingData) {
    return (
      <Card>
        <CardHeader><CardTitle>Sede Not Assigned</CardTitle></CardHeader>
        <CardContent><p>Supervisors must be assigned to a Sede to manage groups. Please contact an administrator.</p></CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Users className="h-6 w-6 text-primary" /> Group Management</CardTitle>
            <CardDescription>
              {canManageGroupsOverall 
                ? "Create, manage groups, assign teachers and sedes, and add/remove students in bulk." 
                : "View groups you are assigned to and their student enrollments."}
            </CardDescription>
          </div>
          {canManageGroupsOverall && (
            <Dialog open={isGroupFormDialogOpen} onOpenChange={(isOpen) => {
              setIsGroupFormDialogOpen(isOpen);
              if (!isOpen) {
                const defaultType = classScheduleConfig.scheduleType !== 'NotSet' ? classScheduleConfig.scheduleType : 'Saturday';
                form.reset({ name: '', type: defaultType, startDate: new Date(), endDate: undefined, teacherId: '', sedeId: firestoreUser.role === 'supervisor' ? (firestoreUser.sedeId || '') : '' });
                setEditingGroup(null);
              }
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-sm" onClick={openAddGroupDialog}>
                  <PlusCircle className="size-3.5" /> Add New Group
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingGroup ? 'Edit Group' : 'Create New Group'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(handleGroupFormSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                  <FormField control={form.control} name="name" render={({ field }) => (<FormItem><FormLabel>Group Name*</FormLabel><Input placeholder="E.g., Saturday Morning Beginners" {...field} className="mt-1" /><FormMessage /></FormItem>)}/>
                  <Controller control={form.control} name="type" render={({ field }) => (
                      <FormItem><FormLabel>Group Type*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value || "Saturday"}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Select group type" /></SelectTrigger>
                          <SelectContent><SelectItem value="Saturday">Saturday Group</SelectItem><SelectItem value="Sunday">Sunday Group</SelectItem><SelectItem value="SaturdayAndSunday">Both Weekends (Sat & Sun)</SelectItem><SelectItem value="Daily">Daily Group (Weekdays)</SelectItem></SelectContent>
                        </Select><FormMessage />
                      </FormItem>)}/>
                  <Controller control={form.control} name="startDate" render={({ field }) => (
                      <FormItem className="flex flex-col"><FormLabel>Start Date*</FormLabel>
                          <Popover><PopoverTrigger asChild>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-1",!field.value && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button>
                          </PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent></Popover>
                          <FormMessage />
                      </FormItem>)}/>
                  <Controller control={form.control} name="endDate" render={({ field }) => (
                      <FormItem className="flex flex-col"><FormLabel>End Date (Optional)</FormLabel>
                        <Popover><PopoverTrigger asChild>
                          <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal mt-1", !field.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date or clear</span>}</Button>
                        </PopoverTrigger><PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value || undefined} onSelect={(date) => field.onChange(date || null)} initialFocus={!!field.value} /><Button variant="ghost" className="w-full mt-1 text-sm" onClick={() => field.onChange(null)}>Clear End Date</Button></PopoverContent></Popover>
                        <FormMessage />
                      </FormItem>)}/>
                  {firestoreUser?.role === 'admin' && (
                    <FormField control={form.control} name="sedeId" render={({ field }) => (
                      <FormItem><FormLabel>Assign to Sede (Optional)</FormLabel>
                        <Select onValueChange={(value) => field.onChange(value === NO_SEDE_ASSIGNED_VALUE ? '' : value)} value={field.value || NO_SEDE_ASSIGNED_VALUE}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Select a Sede" /></SelectTrigger>
                          <SelectContent><SelectItem value={NO_SEDE_ASSIGNED_VALUE}>No Sede Assigned</SelectItem>
                            {availableSedesForGroupAssignment.map(sede => (<SelectItem key={sede.id} value={sede.id}>{sede.name}</SelectItem>))}
                          </SelectContent>
                        </Select>
                        {availableSedesForGroupAssignment.length === 0 && <p className="text-xs text-muted-foreground mt-1">No Sedes available in your institution to assign.</p>}
                        <FormMessage />
                      </FormItem>)}/>
                  )}
                  {firestoreUser?.role === 'supervisor' && (
                    <FormItem><FormLabel>Sede</FormLabel><Input value={getSedeNameForGroup(firestoreUser.sedeId)} disabled className="mt-1 bg-muted" /><p className="text-xs text-muted-foreground mt-1">Groups created by supervisors are automatically assigned to their Sede.</p></FormItem>
                  )}
                  <Controller control={form.control} name="teacherId" render={({ field }) => (
                      <FormItem><FormLabel>Assign Teacher (Optional)</FormLabel>
                        <Select onValueChange={(value) => field.onChange(value === NO_TEACHER_ASSIGNED_VALUE ? '' : value)} value={field.value || NO_TEACHER_ASSIGNED_VALUE}>
                          <SelectTrigger className="mt-1"><SelectValue placeholder="Select a teacher" /></SelectTrigger>
                          <SelectContent><SelectItem value={NO_TEACHER_ASSIGNED_VALUE}>No Teacher Assigned</SelectItem>
                            {availableTeachersForAssignment.map(teacher => (<SelectItem key={teacher.id} value={teacher.id}>{teacher.name} ({teacher.role})</SelectItem>))}
                          </SelectContent>
                        </Select>
                        {availableTeachersForAssignment.length === 0 && <p className="text-xs text-muted-foreground mt-1">No teachers available for assignment based on current Sede/Institution selection or role.</p>}
                        <FormMessage />
                      </FormItem>)}/>
                  <DialogFooter className="pt-4">
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingGroup ? 'Save Changes' : 'Create Group'}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {displayedGroups.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-muted-foreground">
                {firestoreUser?.role === 'teacher' ? "You are not currently assigned to any groups." : 
                 firestoreUser?.role === 'supervisor' ? "No groups found in your Sede. Get started by adding a new group." :
                 "No groups found for your institution. Get started by adding a new group."}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                  <TableHead>Group Name</TableHead><TableHead>Type</TableHead><TableHead>Sede</TableHead>
                  <TableHead>Start Date</TableHead><TableHead>End Date</TableHead>
                  <TableHead>Teacher</TableHead><TableHead>Students</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {displayedGroups.map((group) => (
                  <TableRow key={group.id}>
                    <TableCell className="font-medium">{group.name}</TableCell>
                    <TableCell>{group.type === 'SaturdayAndSunday' ? 'Both Weekends' : group.type}</TableCell>
                    <TableCell>{getSedeNameForGroup(group.sedeId)}</TableCell>
                    <TableCell>{formatDateDisplay(group.startDate)}</TableCell>
                    <TableCell>{formatDateDisplay(group.endDate)}</TableCell>
                    <TableCell>{getTeacherName(group.teacherId)}</TableCell>
                    <TableCell>{getValidatedStudentCount(group.id)}</TableCell>
                    <TableCell className="space-x-1">
                      <Button variant="outline" size="sm" onClick={() => openManageStudentsDialog(group)} className="text-xs"><ArrowRightLeft className="mr-1 h-3.5 w-3.5" /> Manage Students</Button>
                      {canManageGroupsOverall && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEditGroupDialog(group)} disabled={firestoreUser?.role === 'supervisor' && group.sedeId !== firestoreUser.sedeId}><Edit className="h-4 w-4" /><span className="sr-only">Edit Group</span></Button>
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteGroup(group.id, group.name)} disabled={firestoreUser?.role === 'supervisor' && group.sedeId !== firestoreUser.sedeId}><Trash2 className="h-4 w-4" /><span className="sr-only">Delete Group</span></Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

     <Dialog open={isManageStudentsDialogOpen} onOpenChange={(isOpen) => { setIsManageStudentsDialogOpen(isOpen); if (!isOpen) setSelectedGroupForManagement(null); }}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>Manage Students for: {selectedGroupForManagement?.name}</DialogTitle>
            <DialogPrimitiveDescription>Add or remove students from this group. Only unassigned students can be added.</DialogPrimitiveDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-6 py-4">
            <div className="space-y-2">
              <h3 className="font-semibold">Students in Group ({studentsInCurrentGroup.length})</h3>
              <div className="h-64 overflow-y-auto rounded-md border p-2">
                {studentsInCurrentGroup.length > 0 ? (
                  studentsInCurrentGroup.map(student => (
                    <div key={student.id} className="flex items-center space-x-2 p-1">
                      <Checkbox
                        id={`remove-${student.id}`}
                        onCheckedChange={(checked) => {
                          setStudentsToRemove(prev => checked ? [...prev, student.id] : prev.filter(id => id !== student.id));
                        }}
                      />
                      <label htmlFor={`remove-${student.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {student.name}
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center p-4">No students in this group.</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <h3 className="font-semibold">Available Students ({availableStudents.length})</h3>
              <div className="h-64 overflow-y-auto rounded-md border p-2">
                {availableStudents.length > 0 ? (
                  availableStudents.map(student => (
                    <div key={student.id} className="flex items-center space-x-2 p-1">
                      <Checkbox
                        id={`add-${student.id}`}
                        onCheckedChange={(checked) => {
                          setStudentsToAssign(prev => checked ? [...prev, student.id] : prev.filter(id => id !== student.id));
                        }}
                      />
                      <label htmlFor={`add-${student.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                        {student.name}
                      </label>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center p-4">No unassigned students available.</p>
                )}
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleUpdateGroupMembers} disabled={isSubmitting || (studentsToAssign.length === 0 && studentsToRemove.length === 0)}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
    

    

    
