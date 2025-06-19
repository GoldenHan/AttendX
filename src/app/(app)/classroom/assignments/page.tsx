
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, PlusCircle, CalendarIcon, AlertTriangle, Info, Edit, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import type { Group, ClassroomItem as ClassroomItemType } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isValid, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';

const classroomItemFormSchema = z.object({
  title: z.string().min(3, { message: 'Title must be at least 3 characters.' }).max(100, {message: 'Title cannot exceed 100 characters.'}),
  description: z.string().max(5000, {message: 'Description cannot exceed 5000 characters.'}).optional(),
  itemType: z.enum(['assignment', 'reminder'], { required_error: 'Item type is required.' }),
  dueDate: z.date().optional().nullable(),
  groupId: z.string().min(1, { message: 'Group selection is required.' }),
  status: z.enum(['published', 'draft']).default('published'),
});

type ClassroomItemFormValues = z.infer<typeof classroomItemFormSchema>;

export default function ClassroomAssignmentsPage() {
  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth(); // Renamed institutionId to firestoreUser.institutionId for clarity
  const router = useRouter();

  const [manageableGroups, setManageableGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [classroomItems, setClassroomItems] = useState<ClassroomItemType[]>([]);

  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const form = useForm<ClassroomItemFormValues>({
    resolver: zodResolver(classroomItemFormSchema),
    defaultValues: {
      title: '',
      description: '',
      itemType: 'assignment',
      dueDate: null,
      groupId: '',
      status: 'published',
    },
  });

  const fetchManageableGroups = useCallback(async () => {
    if (!firestoreUser || !firestoreUser.institutionId || authLoading) {
      setIsLoadingGroups(false);
      return;
    }
    setIsLoadingGroups(true);
    try {
      let groupsQuery;
      if (firestoreUser.role === 'admin') {
        groupsQuery = query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId)
        );
      } else if (firestoreUser.role === 'supervisor') {
        if (!firestoreUser.sedeId) {
          toast({ title: "Sede Requerida", description: "Como supervisor, debes estar asignado a una Sede para gestionar tareas de classroom.", variant: "destructive"});
          setManageableGroups([]);
          setIsLoadingGroups(false);
          return;
        }
        groupsQuery = query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId),
          where('sedeId', '==', firestoreUser.sedeId)
        );
      } else if (firestoreUser.role === 'teacher') {
        groupsQuery = query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId),
          where('teacherId', '==', firestoreUser.id)
        );
      } else {
        setManageableGroups([]);
        setIsLoadingGroups(false);
        return;
      }

      const snapshot = await getDocs(groupsQuery);
      const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setManageableGroups(groups);
      if (groups.length > 0 && !selectedGroupId) {
        const initialGroupId = groups[0].id;
        setSelectedGroupId(initialGroupId);
        form.setValue('groupId', initialGroupId);
      } else if (groups.length > 0 && selectedGroupId) {
        // If a group was already selected, ensure it's still valid, otherwise reset
        if (!groups.find(g => g.id === selectedGroupId)) {
           setSelectedGroupId(groups[0].id);
           form.setValue('groupId', groups[0].id);
        } else {
            form.setValue('groupId', selectedGroupId); // Ensure form is in sync
        }
      } else if (groups.length === 0) {
        setSelectedGroupId('');
        form.setValue('groupId', '');
      }
    } catch (error) {
      console.error('Error fetching manageable groups:', error);
      toast({ title: 'Error', description: 'Could not load your groups.', variant: 'destructive' });
      setManageableGroups([]);
    }
    setIsLoadingGroups(false);
  }, [firestoreUser, toast, form, selectedGroupId, authLoading]);

  const fetchClassroomItemsForGroup = useCallback(async (groupId: string) => {
    if (!groupId || !firestoreUser?.institutionId) {
      setClassroomItems([]);
      return;
    }
    setIsLoadingItems(true);
    try {
      const itemsQuery = query(
        collection(db, 'classroomItems'),
        where('groupId', '==', groupId),
        where('institutionId', '==', firestoreUser.institutionId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(itemsQuery);
      const items = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          // Ensure timestamps are handled correctly if they come from serverTimestamp
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
          dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString() : data.dueDate,
        } as ClassroomItemType;
      });
      setClassroomItems(items);
    } catch (error) {
      console.error('Error fetching classroom items:', error);
      toast({ title: 'Error', description: 'Could not load items for the selected group.', variant: 'destructive' });
      setClassroomItems([]);
    }
    setIsLoadingItems(false);
  }, [firestoreUser?.institutionId, toast]);

  useEffect(() => {
    if (!authLoading && firestoreUser && firestoreUser.institutionId) {
      fetchManageableGroups();
    }
  }, [authLoading, firestoreUser, fetchManageableGroups]);

  useEffect(() => {
    if (selectedGroupId && firestoreUser?.institutionId) {
      fetchClassroomItemsForGroup(selectedGroupId);
    } else {
      setClassroomItems([]); // Clear items if no group is selected
    }
  }, [selectedGroupId, firestoreUser?.institutionId, fetchClassroomItemsForGroup]);


  const handleFormSubmit = async (data: ClassroomItemFormValues) => {
    if (!firestoreUser || !firestoreUser.institutionId || !data.groupId) {
        toast({title: "Error", description: "Missing user, institution, or group information.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);

    const newItemData: Omit<ClassroomItemType, 'id' | 'createdAt' | 'updatedAt'> = {
        groupId: data.groupId,
        institutionId: firestoreUser.institutionId,
        teacherId: firestoreUser.id, 
        title: data.title,
        description: data.description || '',
        itemType: data.itemType,
        dueDate: data.dueDate ? data.dueDate.toISOString() : null,
        status: data.status,
    };

    try {
      const docRef = await addDoc(collection(db, 'classroomItems'), {
         ...newItemData,
         createdAt: serverTimestamp(), // Use Firestore server timestamp
         updatedAt: serverTimestamp(),
      });
      toast({ title: 'Success', description: `${data.itemType === 'assignment' ? 'Assignment' : 'Reminder'} "${data.title}" created.` });
      fetchClassroomItemsForGroup(data.groupId); // Re-fetch after creation
      form.reset({
        title: '',
        description: '',
        itemType: 'assignment',
        dueDate: null,
        groupId: data.groupId, 
        status: 'published',
      });
      setIsFormOpen(false);
    } catch (error) {
      console.error("Error creating classroom item:", error);
      toast({ title: 'Error', description: 'Could not create the item.', variant: 'destructive' });
    }

    setIsSubmitting(false);
  };

  if (authLoading || (!firestoreUser && !firestoreUser?.institutionId)) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading user data...</span></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Classroom Administration</CardTitle>
              <CardDescription>Manage assignments and reminders for your groups.</CardDescription>
            </div>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-sm" disabled={manageableGroups.length === 0 || isLoadingGroups}>
                  <PlusCircle className="size-3.5" /> New Item
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Classroom Item</DialogTitle>
                  <DialogPrimitiveDescription>Fill in the details for the new assignment or reminder.</DialogPrimitiveDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                    <FormField control={form.control} name="groupId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group*</FormLabel>
                        <Select 
                            onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedGroupId(value); // Also update the page's selected group
                            }} 
                            value={field.value} 
                            disabled={manageableGroups.length === 0 || isLoadingGroups}
                        >
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select a group" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {manageableGroups.map(group => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {manageableGroups.length === 0 && !isLoadingGroups && (
                             <p className="text-xs text-muted-foreground mt-1">No groups available for assignment.</p>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="title" render={({ field }) => (
                      <FormItem><FormLabel>Title*</FormLabel><FormControl><Input placeholder="e.g., Chapter 5 Reading, Project Deadline" {...field} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="description" render={({ field }) => (
                      <FormItem><FormLabel>Description (Optional)</FormLabel><FormControl><Textarea placeholder="Provide details about the assignment or reminder..." {...field} rows={5} /></FormControl><FormMessage /></FormItem>
                    )}/>
                    <FormField control={form.control} name="itemType" render={({ field }) => (
                      <FormItem><FormLabel>Item Type*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                           <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select item type" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="assignment">Assignment</SelectItem>
                            <SelectItem value="reminder">Reminder</SelectItem>
                          </SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                    )}/>
                    <FormField control={form.control} name="dueDate" render={({ field }) => (
                      <FormItem className="flex flex-col"><FormLabel>Due Date (Optional)</FormLabel>
                        <Popover><PopoverTrigger asChild>
                          <FormControl>
                            <Button variant={"outline"} className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />{field.value ? format(field.value, "PPP") : <span>Pick a date</span>}</Button>
                          </FormControl>
                        </PopoverTrigger><PopoverContent className="w-auto p-0"><Calendar mode="single" selected={field.value || undefined} onSelect={field.onChange} initialFocus /></PopoverContent></Popover>
                        <FormMessage />
                      </FormItem>
                    )}/>
                     <FormField control={form.control} name="status" render={({ field }) => (
                      <FormItem><FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                           <FormControl>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="published">Published (Visible to Students)</SelectItem>
                            <SelectItem value="draft">Draft (Saved for Later)</SelectItem>
                          </SelectContent>
                        </Select><FormMessage />
                      </FormItem>
                    )}/>
                    <DialogFooter className="pt-4">
                      <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                      <Button type="submit" disabled={isSubmitting || manageableGroups.length === 0 || !form.getValues('groupId')}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Item</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
           <div className="mt-2">
            <Label htmlFor="group-selector-classroom">Select Group to View/Manage</Label>
            <Select 
                value={selectedGroupId} 
                onValueChange={(value) => {
                    setSelectedGroupId(value);
                    form.setValue('groupId', value); // Keep form in sync for new item creation
                }} 
                disabled={isLoadingGroups || manageableGroups.length === 0}
            >
                <SelectTrigger id="group-selector-classroom">
                    <SelectValue placeholder={isLoadingGroups ? "Loading groups..." : (manageableGroups.length === 0 ? "No groups available" : "Select a group")}/>
                </SelectTrigger>
                <SelectContent>
                    {manageableGroups.map(group => (
                        <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {manageableGroups.length === 0 && !isLoadingGroups && (
                 <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    {firestoreUser?.role === 'teacher' ? "You are not assigned to any groups." :
                     firestoreUser?.role === 'supervisor' ? "No groups found in your Sede." :
                     "No groups found in this institution."}
                    { (firestoreUser?.role === 'admin' || (firestoreUser?.role === 'supervisor' && firestoreUser.sedeId)) &&
                        <span className="ml-1">You can <Button variant="link" size="sm" className="p-0 h-auto" onClick={() => router.push('/group-management')}>create groups in Group Management</Button>.</span>
                    }
                </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(isLoadingGroups || isLoadingItems) && (
            <div className="text-center py-4">
              <Loader2 className="h-5 w-5 animate-spin mr-2 inline-block" />
              {isLoadingGroups ? "Loading group data..." : "Loading items..."}
            </div>
          )}
          {!isLoadingGroups && manageableGroups.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed rounded-lg">
              <Info className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                {firestoreUser?.role === 'teacher' ? "You are not assigned to any groups yet." :
                 firestoreUser?.role === 'supervisor' ? "No groups found in your Sede." :
                 "No groups found in this institution yet."}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {firestoreUser?.role === 'teacher' ? "Please contact an administrator to be assigned to a group." :
                 (firestoreUser?.role === 'admin' || (firestoreUser?.role === 'supervisor' && firestoreUser.sedeId)) ?
                 "Please create or assign groups in 'Group Management' to start adding classroom items." :
                 "Please create groups first to manage classroom assignments."
                }
              </p>
              {(firestoreUser?.role === 'admin' || (firestoreUser?.role === 'supervisor' && firestoreUser.sedeId)) && (
                <Button asChild className="mt-4">
                  <Link href="/group-management">Go to Group Management</Link>
                </Button>
              )}
            </div>
          )}
          {!isLoadingGroups && manageableGroups.length > 0 && !selectedGroupId && !isLoadingItems && (
             <div className="text-center py-4 text-muted-foreground">
                Please select a group to view or add assignments.
             </div>
          )}
          {!isLoadingGroups && !isLoadingItems && manageableGroups.length > 0 && selectedGroupId && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">
                Items for: {manageableGroups.find(g => g.id === selectedGroupId)?.name || 'Selected Group'}
              </h3>
              {classroomItems.length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed rounded-lg">
                  <Info className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No assignments or reminders found for this group yet.</p>
                  <p className="text-sm text-muted-foreground">Click "New Item" to add one.</p>
                </div>
              ) : (
                classroomItems.map(item => (
                  <Card key={item.id}>
                    <CardHeader>
                      <CardTitle className="flex justify-between items-center">
                        {item.title}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${item.itemType === 'assignment' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'}`}>
                          {item.itemType.charAt(0).toUpperCase() + item.itemType.slice(1)}
                        </span>
                      </CardTitle>
                      <CardDescription>
                        Status: <span className={item.status === 'published' ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span>
                        {item.dueDate && ` | Due: ${isValid(parseISO(item.dueDate)) ? format(parseISO(item.dueDate), 'PPP p') : 'Invalid Date'}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{item.description || "No description."}</p>
                    </CardContent>
                    <CardFooter className="text-xs text-muted-foreground flex justify-between items-center">
                      <span>Created: {item.createdAt && isValid(parseISO(item.createdAt)) ? format(parseISO(item.createdAt), 'PPP p') : 'Not available'}</span>
                       {/* Placeholder for Edit/Delete actions */}
                      <div className="space-x-1">
                        <Button variant="ghost" size="icon" disabled><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" disabled><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
