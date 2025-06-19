
'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { Loader2, PlusCircle, CalendarIcon, AlertTriangle, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc } from 'firebase/firestore';
import type { Group, ClassroomItem as ClassroomItemType } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format, isValid, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'; // Added missing imports

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
  const { firestoreUser, institutionId, loading: authLoading } = useAuth();
  
  const [teacherGroups, setTeacherGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [classroomItems, setClassroomItems] = useState<ClassroomItemType[]>([]); // Will be used when fetching from Firestore
  
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
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

  const fetchTeacherGroups = useCallback(async () => {
    if (!firestoreUser?.id || !institutionId) {
      setIsLoadingGroups(false);
      return;
    }
    setIsLoadingGroups(true);
    try {
      const groupsQuery = query(
        collection(db, 'groups'),
        where('teacherId', '==', firestoreUser.id),
        where('institutionId', '==', institutionId)
      );
      const snapshot = await getDocs(groupsQuery);
      const groups = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setTeacherGroups(groups);
      if (groups.length > 0 && !selectedGroupId) {
        setSelectedGroupId(groups[0].id);
        form.setValue('groupId', groups[0].id);
      }
    } catch (error) {
      console.error('Error fetching teacher groups:', error);
      toast({ title: 'Error', description: 'Could not load your groups.', variant: 'destructive' });
    }
    setIsLoadingGroups(false);
  }, [firestoreUser?.id, institutionId, toast, form, selectedGroupId]);

  useEffect(() => {
    if (firestoreUser && institutionId) {
      fetchTeacherGroups();
    }
  }, [firestoreUser, institutionId, fetchTeacherGroups]);
  
  // Placeholder for fetching assignments for the selected group - to be implemented later
  useEffect(() => {
    if (selectedGroupId && firestoreUser) {
      // console.log(`Would fetch assignments for group ${selectedGroupId} of institution ${institutionId}`);
      // setClassroomItems([]); // Clear previous items for now
    }
  }, [selectedGroupId, firestoreUser, institutionId]);


  const handleFormSubmit = async (data: ClassroomItemFormValues) => {
    if (!firestoreUser || !institutionId || !data.groupId) {
        toast({title: "Error", description: "Missing user, institution, or group information.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);
    
    // Placeholder for Firestore save logic
    const newItemData: Omit<ClassroomItemType, 'id' | 'createdAt' | 'updatedAt'> = {
        groupId: data.groupId,
        institutionId: institutionId,
        teacherId: firestoreUser.id,
        title: data.title,
        description: data.description || '',
        itemType: data.itemType,
        dueDate: data.dueDate ? data.dueDate.toISOString() : null,
        status: data.status,
    };

    console.log("New Item Data to save (simulation):", newItemData);
    // Simulating API call
    await new Promise(resolve => setTimeout(resolve, 1000));

    // In a real scenario, you would save to Firestore and then refresh the list:
    // try {
    //   const docRef = await addDoc(collection(db, 'classroomItems'), {
    //      ...newItemData,
    //      createdAt: new Date().toISOString(),
    //      updatedAt: new Date().toISOString(),
    //   });
    //   toast({ title: 'Success', description: `${data.itemType === 'assignment' ? 'Assignment' : 'Reminder'} "${data.title}" created.` });
    //   form.reset();
    //   setIsFormOpen(false);
    //   // fetchAssignmentsForGroup(selectedGroupId); // Re-fetch
    // } catch (error) {
    //   console.error("Error creating classroom item:", error);
    //   toast({ title: 'Error', description: 'Could not create the item.', variant: 'destructive' });
    // }

    toast({ title: 'Simulated Success', description: `${data.itemType === 'assignment' ? 'Assignment' : 'Reminder'} "${data.title}" would be created.` });
    // For now, just add to local state for demo
    const demoItem: ClassroomItemType = {
        id: Math.random().toString(36).substring(2,9),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...newItemData,
    };
    setClassroomItems(prev => [demoItem, ...prev]);


    form.reset({
      title: '',
      description: '',
      itemType: 'assignment',
      dueDate: null,
      groupId: data.groupId, // Keep selected group
      status: 'published',
    });
    setIsFormOpen(false);
    setIsSubmitting(false);
  };

  if (authLoading || (!firestoreUser && !institutionId)) {
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
                <Button size="sm" className="gap-1.5 text-sm" disabled={teacherGroups.length === 0 || isLoadingGroups}>
                  <PlusCircle className="size-3.5" /> New Assignment/Reminder
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create New Classroom Item</DialogTitle>
                  <DialogPrimitiveDescription>Fill in the details for the new assignment or reminder.</DialogPrimitiveDescription>
                </DialogHeader>
                <Form {...form}> {/* Encapsulate with Form provider */}
                  <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
                    <FormField control={form.control} name="groupId" render={({ field }) => (
                      <FormItem>
                        <FormLabel>Group*</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={teacherGroups.length === 0}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select a group" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {teacherGroups.map(group => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
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
                    <FormField control={form.control} name="dueDate" render={({ field }) => ( // Changed Controller to FormField
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
                      <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create Item</Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
           <div className="mt-2">
            <Label htmlFor="group-selector-classroom">Select Group to View/Manage</Label>
            <Select value={selectedGroupId} onValueChange={(value) => {
                setSelectedGroupId(value);
                form.setValue('groupId', value); // Update form if dialog is opened for this group
            }} disabled={isLoadingGroups || teacherGroups.length === 0}>
                <SelectTrigger id="group-selector-classroom">
                    <SelectValue placeholder="Select a group"/>
                </SelectTrigger>
                <SelectContent>
                    {teacherGroups.map(group => (
                        <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {teacherGroups.length === 0 && !isLoadingGroups && (
                 <p className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                    You are not assigned to any groups. Please contact an administrator.
                </p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingGroups && <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mr-2 inline-block" />Loading group data...</div>}
          {!isLoadingGroups && teacherGroups.length > 0 && !selectedGroupId && (
             <div className="text-center py-4 text-muted-foreground">Please select a group to see its assignments.</div>
          )}
          {!isLoadingGroups && selectedGroupId && (
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">
                Tasks for: {teacherGroups.find(g => g.id === selectedGroupId)?.name || 'Selected Group'}
              </h3>
              {classroomItems.filter(item => item.groupId === selectedGroupId).length === 0 ? (
                <div className="text-center py-10 border-2 border-dashed rounded-lg">
                  <Info className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
                  <p className="text-muted-foreground">No assignments or reminders found for this group yet.</p>
                  <p className="text-sm text-muted-foreground">Click "New Assignment/Reminder" to add one.</p>
                </div>
              ) : (
                classroomItems.filter(item => item.groupId === selectedGroupId).map(item => (
                  <Card key={item.id}>
                    <CardHeader>
                      <CardTitle className="flex justify-between items-center">
                        {item.title}
                        <span className={`text-xs px-2 py-0.5 rounded-full ${item.itemType === 'assignment' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {item.itemType.charAt(0).toUpperCase() + item.itemType.slice(1)}
                        </span>
                      </CardTitle>
                      <CardDescription>
                        Status: <span className={item.status === 'published' ? 'text-green-600' : 'text-orange-600'}>{item.status.charAt(0).toUpperCase() + item.status.slice(1)}</span>
                        {item.dueDate && ` | Due: ${format(parseISO(item.dueDate), 'PPP p')}`}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{item.description || "No description."}</p>
                    </CardContent>
                    <CardFooter className="text-xs text-muted-foreground">
                      Created: {format(parseISO(item.createdAt), 'PPP p')}
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
