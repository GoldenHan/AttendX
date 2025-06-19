
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, PlusCircle, CalendarIcon, AlertTriangle, Info, Edit, Trash2, Users } from 'lucide-react'; // Added Users icon
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, orderBy, serverTimestamp, Timestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import type { Group, ClassroomItem as ClassroomItemType, ClassroomItemSubmission } from '@/types';
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

interface DisplayableClassroomItem extends ClassroomItemType {
  submissionCount?: number;
}

export default function ClassroomAssignmentsPage() {
  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth();
  const router = useRouter();

  const [manageableGroups, setManageableGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [classroomItems, setClassroomItems] = useState<DisplayableClassroomItem[]>([]);

  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);

  const [editingItem, setEditingItem] = useState<ClassroomItemType | null>(null);
  const [isConfirmDeleteDialogOpen, setIsConfirmDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<ClassroomItemType | null>(null);


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
      let groupsQuerySnapshot;
      if (firestoreUser.role === 'admin') {
        groupsQuerySnapshot = await getDocs(query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId)
        ));
      } else if (firestoreUser.role === 'supervisor') {
        if (!firestoreUser.sedeId) {
          toast({ title: "Sede Requerida", description: "Como supervisor, debes estar asignado a una Sede para gestionar tareas de classroom.", variant: "destructive"});
          setManageableGroups([]);
          setIsLoadingGroups(false);
          return;
        }
        groupsQuerySnapshot = await getDocs(query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId),
          where('sedeId', '==', firestoreUser.sedeId)
        ));
      } else if (firestoreUser.role === 'teacher') {
        groupsQuerySnapshot = await getDocs(query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId),
          where('teacherId', '==', firestoreUser.id)
        ));
      } else {
        setManageableGroups([]);
        setIsLoadingGroups(false);
        return;
      }

      const groups = groupsQuerySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setManageableGroups(groups);

      if (groups.length > 0 && !selectedGroupId) {
        const initialGroupId = groups[0].id;
        setSelectedGroupId(initialGroupId);
        form.setValue('groupId', initialGroupId);
      } else if (groups.length > 0 && selectedGroupId) {
        if (!groups.find(g => g.id === selectedGroupId)) {
           setSelectedGroupId(groups[0].id);
           form.setValue('groupId', groups[0].id);
        } else {
            form.setValue('groupId', selectedGroupId);
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
      const itemsSnapshot = await getDocs(itemsQuery);
      let fetchedItems: DisplayableClassroomItem[] = itemsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
          dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString() : (typeof data.dueDate === 'string' ? data.dueDate : null),
          submissionCount: 0, // Initialize, will be fetched next
        } as DisplayableClassroomItem;
      });

      // Fetch submission counts for assignment items
      if (fetchedItems.length > 0) {
        const assignmentItemIds = fetchedItems.filter(item => item.itemType === 'assignment').map(item => item.id);
        if (assignmentItemIds.length > 0) {
          // Firestore 'in' query limit is 30. For more items, batching or different strategy needed.
          const submissionsQuery = query(
            collection(db, 'classroomItemSubmissions'),
            where('itemId', 'in', assignmentItemIds),
            where('institutionId', '==', firestoreUser.institutionId)
          );
          const submissionsSnapshot = await getDocs(submissionsQuery);
          const counts = new Map<string, number>();
          submissionsSnapshot.forEach(subDoc => {
            const itemId = subDoc.data().itemId;
            counts.set(itemId, (counts.get(itemId) || 0) + 1);
          });
          fetchedItems = fetchedItems.map(item => ({
            ...item,
            submissionCount: item.itemType === 'assignment' ? (counts.get(item.id) || 0) : undefined,
          }));
        }
      }
      setClassroomItems(fetchedItems);
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
      setClassroomItems([]);
    }
  }, [selectedGroupId, firestoreUser?.institutionId, fetchClassroomItemsForGroup]);

  const openCreateFormDialog = () => {
    setEditingItem(null);
    form.reset({
      title: '',
      description: '',
      itemType: 'assignment',
      dueDate: null,
      groupId: selectedGroupId || (manageableGroups.length > 0 ? manageableGroups[0].id : ''),
      status: 'published',
    });
    setIsFormOpen(true);
  };

  const openEditFormDialog = (item: ClassroomItemType) => {
    setEditingItem(item);
    form.reset({
      title: item.title,
      description: item.description || '',
      itemType: item.itemType,
      dueDate: item.dueDate ? parseISO(item.dueDate) : null,
      groupId: item.groupId,
      status: item.status,
    });
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (data: ClassroomItemFormValues) => {
    if (!firestoreUser || !firestoreUser.institutionId || !data.groupId) {
        toast({title: "Error", description: "Missing user, institution, or group information.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);

    // Ensure dueDate is either a valid ISO string or null
    let dueDateISO: string | null = null;
    if (data.dueDate && isValid(data.dueDate)) {
        dueDateISO = data.dueDate.toISOString();
    }

    const itemDataPayload = {
        groupId: data.groupId,
        institutionId: firestoreUser.institutionId,
        teacherId: firestoreUser.id, // ID of the user creating/editing (admin/supervisor/teacher)
        title: data.title,
        description: data.description || '',
        itemType: data.itemType,
        dueDate: dueDateISO,
        status: data.status,
        updatedAt: serverTimestamp(),
    };

    try {
      if (editingItem) {
        const itemRef = doc(db, 'classroomItems', editingItem.id);
        // Explicitly cast to include serverTimestamp for updatedAt
        await updateDoc(itemRef, itemDataPayload as any);
        toast({ title: 'Success', description: `${data.itemType === 'assignment' ? 'Assignment' : 'Reminder'} "${data.title}" updated.` });
      } else {
        await addDoc(collection(db, 'classroomItems'), {
           ...itemDataPayload,
           createdAt: serverTimestamp(),
        });
        toast({ title: 'Success', description: `${data.itemType === 'assignment' ? 'Assignment' : 'Reminder'} "${data.title}" created.` });
      }
      fetchClassroomItemsForGroup(data.groupId); // Refresh items for the current group
      form.reset({
        title: '', description: '', itemType: 'assignment', dueDate: null,
        groupId: data.groupId, status: 'published',
      });
      setIsFormOpen(false);
      setEditingItem(null);
    } catch (error) {
      console.error("Error saving classroom item:", error);
      toast({ title: 'Error', description: `Could not ${editingItem ? 'update' : 'create'} the item.`, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const openDeleteConfirmationDialog = (item: ClassroomItemType) => {
    setItemToDelete(item);
    setIsConfirmDeleteDialogOpen(true);
  };

  const handleConfirmDeleteItem = async () => {
    if (!itemToDelete || !firestoreUser?.institutionId) {
      toast({ title: 'Error', description: 'No item selected for deletion or missing context.', variant: 'destructive' });
      setIsConfirmDeleteDialogOpen(false);
      return;
    }
    setIsSubmitting(true);
    try {
      const itemRef = doc(db, 'classroomItems', itemToDelete.id);
      await deleteDoc(itemRef);
      // Consider deleting related submissions if any:
      // const submissionsQuery = query(collection(db, 'classroomItemSubmissions'), where('itemId', '==', itemToDelete.id));
      // const submissionsSnapshot = await getDocs(submissionsQuery);
      // const batch = writeBatch(db);
      // submissionsSnapshot.forEach(subDoc => batch.delete(subDoc.ref));
      // await batch.commit();
      
      toast({ title: 'Item Deleted', description: `"${itemToDelete.title}" has been removed.` });
      fetchClassroomItemsForGroup(itemToDelete.groupId);
    } catch (error) {
      console.error('Error deleting classroom item:', error);
      toast({ title: 'Deletion Failed', description: 'Could not delete the item.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      setIsConfirmDeleteDialogOpen(false);
      setItemToDelete(null);
    }
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
            <Dialog open={isFormOpen} onOpenChange={(open) => {
              setIsFormOpen(open);
              if (!open) setEditingItem(null);
            }}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-sm" onClick={openCreateFormDialog} disabled={manageableGroups.length === 0 || isLoadingGroups}>
                  <PlusCircle className="size-3.5" /> New Item
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editingItem ? 'Edit Classroom Item' : 'Create New Classroom Item'}</DialogTitle>
                  <DialogPrimitiveDescription>Fill in the details for the item.</DialogPrimitiveDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                    <FormField control={form.control} name="groupId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group*</FormLabel>
                        <Select 
                            onValueChange={(value) => {
                                field.onChange(value);
                                setSelectedGroupId(value); // Also update page's selected group if form's group changes
                            }} 
                            value={field.value} 
                            disabled={manageableGroups.length === 0 || isLoadingGroups || !!editingItem}
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
                        {!!editingItem && <p className="text-xs text-muted-foreground mt-1">Group cannot be changed when editing.</p>}
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
                      <Button type="submit" disabled={isSubmitting || manageableGroups.length === 0 || !form.getValues('groupId')}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingItem ? 'Save Changes' : 'Create Item'}</Button>
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
                    if (value) form.setValue('groupId', value); // Update form's default group when page selection changes
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
          {!isLoadingGroups && !isLoadingItems && manageableGroups.length > 0 && !selectedGroupId && (
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
                        {item.itemType === 'assignment' && typeof item.submissionCount === 'number' && (
                            <span className="ml-2 inline-flex items-center">
                                <Users className="h-3.5 w-3.5 mr-1 text-muted-foreground"/>
                                {item.submissionCount} {item.submissionCount === 1 ? 'Submission' : 'Submissions'}
                            </span>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{item.description || "No description."}</p>
                    </CardContent>
                    <CardFooter className="text-xs text-muted-foreground flex justify-between items-center">
                      <span>Created: {item.createdAt && isValid(parseISO(item.createdAt)) ? format(parseISO(item.createdAt), 'PPP p') : 'Not available'}</span>
                      <div className="space-x-1">
                        <Button variant="ghost" size="icon" onClick={() => openEditFormDialog(item)} title="Edit Item">
                            <Edit className="h-4 w-4" />
                            <span className="sr-only">Edit</span>
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => openDeleteConfirmationDialog(item)} title="Delete Item">
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Delete</span>
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={isConfirmDeleteDialogOpen} onOpenChange={setIsConfirmDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the item
              "{itemToDelete?.title}". Related student submissions (if any) will NOT be deleted by this action yet.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setItemToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDeleteItem} disabled={isSubmitting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

