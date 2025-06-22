
'use client';

import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Loader2, PlusCircle, CalendarIcon, AlertTriangle, Info, Edit, Trash2, Users, Save, Paperclip, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, query, where, addDoc, orderBy, serverTimestamp, Timestamp, doc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import type { Group, ClassroomItem as ClassroomItemType, ClassroomItemSubmission, EnrichedSubmission, User, Attachment } from '@/types';
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
  
  const [isSubmissionsDialogOpen, setIsSubmissionsDialogOpen] = useState(false);
  const [selectedItemForSubmissions, setSelectedItemForSubmissions] = useState<DisplayableClassroomItem | null>(null);
  const [submissions, setSubmissions] = useState<EnrichedSubmission[]>([]);
  const [editableSubmissions, setEditableSubmissions] = useState<EnrichedSubmission[]>([]);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [isSavingGrades, setIsSavingGrades] = useState(false);

  const [filesToUpload, setFilesToUpload] = useState<FileList | null>(null);

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
        const counts = new Map<string, number>();

        if (assignmentItemIds.length > 0) {
            // Firestore 'in' query is limited to 30 values. Chunk the requests.
            const chunks = [];
            for (let i = 0; i < assignmentItemIds.length; i += 30) {
                chunks.push(assignmentItemIds.slice(i, i + 30));
            }

            for (const chunk of chunks) {
                if (chunk.length > 0) {
                    const submissionsQuery = query(
                        collection(db, 'classroomItemSubmissions'),
                        where('itemId', 'in', chunk),
                        where('institutionId', '==', firestoreUser.institutionId)
                    );
                    const submissionsSnapshot = await getDocs(submissionsQuery);
                    submissionsSnapshot.forEach(subDoc => {
                        const itemId = subDoc.data().itemId;
                        counts.set(itemId, (counts.get(itemId) || 0) + 1);
                    });
                }
            }
        }
        fetchedItems = fetchedItems.map(item => ({
          ...item,
          submissionCount: item.itemType === 'assignment' ? (counts.get(item.id) || 0) : undefined,
        }));
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
    setFilesToUpload(null);
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
    setFilesToUpload(null);
    setIsFormOpen(true);
  };

  const uploadFiles = async (files: FileList, itemId: string): Promise<Attachment[]> => {
    const attachmentPromises = Array.from(files).map(async (file) => {
      const storagePath = `classroom-items/${itemId}/${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      return { name: file.name, url, path: storagePath };
    });
    return Promise.all(attachmentPromises);
  };

  const handleFormSubmit = async (data: ClassroomItemFormValues) => {
    if (!firestoreUser || !firestoreUser.institutionId || !data.groupId) {
        toast({title: "Error", description: "Missing user, institution, or group information.", variant: "destructive"});
        return;
    }
    setIsSubmitting(true);

    let dueDateISO: string | null = null;
    if (data.dueDate && isValid(data.dueDate)) {
        dueDateISO = data.dueDate.toISOString();
    }

    try {
      if (editingItem) {
        const itemRef = doc(db, 'classroomItems', editingItem.id);
        let newAttachments: Attachment[] = [];
        if (filesToUpload && filesToUpload.length > 0) {
          newAttachments = await uploadFiles(filesToUpload, editingItem.id);
        }
        const updatedAttachments = [...(editingItem.attachments || []), ...newAttachments];
        
        await updateDoc(itemRef, {
            title: data.title,
            description: data.description || '',
            itemType: data.itemType,
            dueDate: dueDateISO,
            status: data.status,
            updatedAt: serverTimestamp(),
            attachments: updatedAttachments
        });
        toast({ title: 'Success', description: `${data.itemType === 'assignment' ? 'Assignment' : 'Reminder'} "${data.title}" updated.` });

      } else {
        const itemDataPayload = {
            groupId: data.groupId,
            institutionId: firestoreUser.institutionId,
            teacherId: firestoreUser.id, 
            title: data.title,
            description: data.description || '',
            itemType: data.itemType,
            dueDate: dueDateISO,
            status: data.status,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            attachments: [],
        };
        const docRef = await addDoc(collection(db, 'classroomItems'), itemDataPayload);
        
        if (filesToUpload && filesToUpload.length > 0) {
          const attachments = await uploadFiles(filesToUpload, docRef.id);
          await updateDoc(docRef, { attachments });
        }
        
        if (data.status === 'published') {
            const group = manageableGroups.find(g => g.id === data.groupId);
            if (group && group.studentIds.length > 0) {
                const notificationPromises = group.studentIds.map(studentId => {
                    const message = `A new ${data.itemType} "${data.title}" has been posted in your group: ${group.name}.`;
                    const newNotification = {
                        userId: studentId,
                        institutionId: firestoreUser.institutionId,
                        message: message,
                        read: false,
                        createdAt: new Date().toISOString(),
                        relatedUrl: '/classroom/my-tasks',
                    };
                    return addDoc(collection(db, 'notifications'), newNotification);
                });
                await Promise.all(notificationPromises);
            }
        }
        
        toast({ title: 'Success', description: `${data.itemType === 'assignment' ? 'Assignment' : 'Reminder'} "${data.title}" created.` });
      }
      fetchClassroomItemsForGroup(data.groupId); 
      setIsFormOpen(false);
      
    } catch (error) {
      console.error("Error saving classroom item:", error);
      toast({ title: 'Error', description: `Could not ${editingItem ? 'update' : 'create'} the item.`, variant: 'destructive' });
    }
    setIsSubmitting(false);
  };

  const handleRemoveAttachment = async (item: ClassroomItemType, attachmentToRemove: Attachment) => {
    if (!confirm(`Are you sure you want to remove the file "${attachmentToRemove.name}"?`)) return;
    try {
      const storageRef = ref(storage, attachmentToRemove.path);
      await deleteObject(storageRef);

      const updatedAttachments = item.attachments?.filter(att => att.path !== attachmentToRemove.path) || [];
      const itemRef = doc(db, 'classroomItems', item.id);
      await updateDoc(itemRef, { attachments: updatedAttachments });

      toast({ title: 'Attachment Removed', description: `File "${attachmentToRemove.name}" has been removed.` });
      fetchClassroomItemsForGroup(item.groupId);
      // If the form is open for this item, update its state
      if (editingItem && editingItem.id === item.id) {
        setEditingItem(prev => prev ? {...prev, attachments: updatedAttachments} : null);
      }
    } catch (error) {
      console.error("Error removing attachment:", error);
      toast({ title: 'Error', description: 'Could not remove the attachment.', variant: 'destructive' });
    }
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
      // Delete attachments from storage first
      if (itemToDelete.attachments && itemToDelete.attachments.length > 0) {
        const deletePromises = itemToDelete.attachments.map(att => {
          const storageRef = ref(storage, att.path);
          return deleteObject(storageRef);
        });
        await Promise.all(deletePromises);
      }

      const itemRef = doc(db, 'classroomItems', itemToDelete.id);
      await deleteDoc(itemRef);
      
      toast({ title: 'Item Deleted', description: `"${itemToDelete.title}" and its attachments have been removed.` });
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
  
  const fetchSubmissionsForItem = useCallback(async (itemId: string): Promise<EnrichedSubmission[]> => {
    if (!firestoreUser?.institutionId) return [];

    const submissionsQuery = query(
        collection(db, 'classroomItemSubmissions'),
        where('itemId', '==', itemId),
        where('institutionId', '==', firestoreUser.institutionId),
        orderBy('submittedAt', 'asc')
    );
    const submissionsSnapshot = await getDocs(submissionsQuery);
    const submissionData = submissionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClassroomItemSubmission));

    if (submissionData.length > 0) {
        const studentIds = [...new Set(submissionData.map(sub => sub.studentId))];
        const usersMap = new Map<string, User>();

        const chunks: string[][] = [];
        for (let i = 0; i < studentIds.length; i += 30) {
            chunks.push(studentIds.slice(i, i + 30));
        }

        for (const chunk of chunks) {
            if (chunk.length > 0) {
                const usersQuery = query(collection(db, 'users'), where('id', 'in', chunk));
                const usersSnapshot = await getDocs(usersQuery);
                usersSnapshot.forEach(userDoc => usersMap.set(userDoc.id, { id: userDoc.id, ...userDoc.data() } as User));
            }
        }
        
        const enrichedSubmissions: EnrichedSubmission[] = submissionData.map(sub => ({
            ...sub,
            studentName: usersMap.get(sub.studentId)?.name || 'Unknown Student',
            studentPhotoUrl: usersMap.get(sub.studentId)?.photoUrl || null,
        }));
        return enrichedSubmissions;
    }
    return [];
  }, [firestoreUser?.institutionId]);

  const handleViewSubmissions = async (item: DisplayableClassroomItem) => {
    setSelectedItemForSubmissions(item);
    setIsSubmissionsDialogOpen(true);
    setIsLoadingSubmissions(true);
    setSubmissions([]);
    setEditableSubmissions([]);

    try {
        const enrichedSubmissions = await fetchSubmissionsForItem(item.id);
        setSubmissions(enrichedSubmissions);
        setEditableSubmissions(enrichedSubmissions); // Initialize editable state
    } catch (error) {
        console.error("Error fetching submissions:", error);
        toast({ title: "Error", description: "Could not fetch submission details.", variant: "destructive" });
    } finally {
        setIsLoadingSubmissions(false);
    }
  };

  const handleGradeInputChange = (submissionId: string, field: 'grade' | 'feedback', value: string | number) => {
    setEditableSubmissions(prev => 
        prev.map(sub => {
            if (sub.id === submissionId) {
                if (field === 'grade') {
                    const gradeValue = value === '' ? null : Number(value);
                    return { ...sub, grade: isNaN(gradeValue) ? sub.grade : gradeValue };
                }
                return { ...sub, [field]: value };
            }
            return sub;
        })
    );
  };

  const handleSaveGrades = async () => {
    if (!selectedItemForSubmissions || !firestoreUser?.institutionId) return;
    setIsSavingGrades(true);
    const batch = writeBatch(db);

    let changesMade = false;
    editableSubmissions.forEach(editableSub => {
      const originalSub = submissions.find(s => s.id === editableSub.id);
      if (!originalSub) return;
      
      const gradeChanged = editableSub.grade !== originalSub.grade && !(editableSub.grade == null && originalSub.grade == null);
      const feedbackChanged = editableSub.feedback !== originalSub.feedback && !(editableSub.feedback == null && originalSub.feedback == null);

      if (gradeChanged || feedbackChanged) {
        changesMade = true;
        const submissionRef = doc(db, 'classroomItemSubmissions', editableSub.id);
        const dataToUpdate: { grade?: number | null; feedback?: string | null } = {};
        
        if (gradeChanged) dataToUpdate.grade = editableSub.grade ?? null;
        if (feedbackChanged) dataToUpdate.feedback = editableSub.feedback ?? null;
        
        batch.update(submissionRef, dataToUpdate);
      }
    });

    if (!changesMade) {
        toast({ title: "No Changes", description: "No grades or feedback were modified.", variant: "default" });
        setIsSavingGrades(false);
        return;
    }

    try {
        await batch.commit();
        toast({ title: "Success", description: "Grades and feedback have been saved." });

        const notificationPromises: Promise<any>[] = [];
        editableSubmissions.forEach(editableSub => {
            const originalSub = submissions.find(s => s.id === editableSub.id);
            if (!originalSub) return;
            
            const gradeChanged = editableSub.grade !== originalSub.grade && !(editableSub.grade == null && originalSub.grade == null);
            const feedbackChanged = editableSub.feedback !== originalSub.feedback && !(editableSub.feedback == null && originalSub.feedback == null);
        
            if (gradeChanged || feedbackChanged) {
                const message = `Your submission for "${selectedItemForSubmissions.title}" has been reviewed.`;
                const newNotification = {
                    userId: editableSub.studentId,
                    institutionId: firestoreUser.institutionId,
                    message: message,
                    read: false,
                    createdAt: new Date().toISOString(),
                    relatedUrl: '/classroom/my-tasks',
                };
                notificationPromises.push(addDoc(collection(db, 'notifications'), newNotification));
            }
        });
        await Promise.all(notificationPromises);

        // Refresh data in dialog
        setIsLoadingSubmissions(true);
        const newSubmissions = await fetchSubmissionsForItem(selectedItemForSubmissions.id);
        setSubmissions(newSubmissions);
        setEditableSubmissions(newSubmissions);
    } catch (error) {
        console.error("Error saving grades:", error);
        toast({ title: "Error", description: "Could not save grades and feedback.", variant: "destructive" });
    } finally {
        setIsSavingGrades(false);
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
              <CardDescription>Manage assignments and reminders for your groups. Attach files as needed.</CardDescription>
            </div>
            <Dialog open={isFormOpen} onOpenChange={(open) => {
              setIsFormOpen(open);
              if (!open) {
                setEditingItem(null);
                setFilesToUpload(null);
              }
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
                                setSelectedGroupId(value); 
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
                     <FormItem>
                        <FormLabel>Attachments (Optional)</FormLabel>
                        <FormControl>
                          <Input type="file" multiple onChange={(e) => setFilesToUpload(e.target.files)} />
                        </FormControl>
                     </FormItem>

                     {editingItem?.attachments && editingItem.attachments.length > 0 && (
                        <div>
                          <p className="text-sm font-medium text-muted-foreground">Current attachments:</p>
                          <ul className="mt-2 space-y-1">
                            {editingItem.attachments.map(att => (
                              <li key={att.path} className="text-sm flex items-center justify-between bg-muted p-2 rounded-md">
                                <a href={att.url} target="_blank" rel="noopener noreferrer" className="truncate hover:underline text-blue-600 dark:text-blue-400">
                                  <Paperclip className="inline-block h-4 w-4 mr-1" />
                                  {att.name}
                                </a>
                                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleRemoveAttachment(editingItem, att)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

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
                    if (value) form.setValue('groupId', value); 
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
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{item.description || "No description."}</p>
                       {item.attachments && item.attachments.length > 0 && (
                        <div className="mt-4">
                          <h4 className="text-sm font-medium text-muted-foreground mb-2">Attachments</h4>
                          <div className="flex flex-wrap gap-2">
                            {item.attachments.map(att => (
                              <a key={att.path} href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm flex items-center gap-1.5 bg-secondary/50 hover:bg-secondary/80 px-2 py-1 rounded-md text-secondary-foreground">
                                <Paperclip className="h-4 w-4" />
                                {att.name}
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                    <CardFooter className="text-xs text-muted-foreground flex justify-between items-center">
                      <span>Created: {item.createdAt && isValid(parseISO(item.createdAt)) ? format(parseISO(item.createdAt), 'PPP p') : 'Not available'}</span>
                      <div className="flex items-center gap-1">
                        {item.itemType === 'assignment' && (
                            <Button variant="outline" size="sm" onClick={() => handleViewSubmissions(item)}>
                                <Users className="h-3.5 w-3.5 mr-1.5" />
                                Submissions ({item.submissionCount || 0})
                            </Button>
                        )}
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
              This action cannot be undone. This will permanently delete the item "{itemToDelete?.title}" and all its attachments. Student submissions for this item will NOT be deleted by this action.
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
      
      <Dialog open={isSubmissionsDialogOpen} onOpenChange={setIsSubmissionsDialogOpen}>
        <DialogContent className="sm:max-w-4xl">
            <DialogHeader>
                <DialogTitle>Submissions for: {selectedItemForSubmissions?.title}</DialogTitle>
                <DialogPrimitiveDescription>
                    Review student submissions, view attachments, provide grades, and leave feedback.
                </DialogPrimitiveDescription>
            </DialogHeader>
            <div className="max-h-[60vh] overflow-y-auto">
                {isLoadingSubmissions ? (
                    <div className="flex justify-center items-center py-10">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                ) : editableSubmissions.length > 0 ? (
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Student</TableHead>
                                <TableHead>Submitted At</TableHead>
                                <TableHead>Attachments</TableHead>
                                <TableHead className="w-[100px]">Grade</TableHead>
                                <TableHead>Feedback</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {editableSubmissions.map(sub => (
                                <TableRow key={sub.id}>
                                    <TableCell className="font-medium flex items-center gap-2">
                                        <Avatar className="h-8 w-8">
                                            <AvatarImage src={sub.studentPhotoUrl || undefined} alt={sub.studentName} />
                                            <AvatarFallback>{sub.studentName?.charAt(0).toUpperCase()}</AvatarFallback>
                                        </Avatar>
                                        {sub.studentName}
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <span>{format(parseISO(sub.submittedAt), 'PPP p')}</span>
                                            <span className={cn("text-xs font-semibold", sub.status === 'late' ? "text-orange-600" : "text-green-600")}>
                                              {sub.status === 'late' ? 'Late' : 'On Time'}
                                            </span>
                                        </div>
                                    </TableCell>
                                     <TableCell>
                                        {sub.attachments && sub.attachments.length > 0 ? (
                                            <div className="flex flex-col gap-1">
                                                {sub.attachments.map(att => (
                                                    <a key={att.path} href={att.url} target="_blank" rel="noopener noreferrer" className="text-xs hover:underline text-blue-600 flex items-center gap-1">
                                                      <Paperclip className="h-3 w-3" /> {att.name}
                                                    </a>
                                                ))}
                                            </div>
                                        ) : (
                                            <span className="text-xs text-muted-foreground">None</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Input 
                                            type="number"
                                            placeholder="N/A"
                                            value={sub.grade ?? ''}
                                            onChange={(e) => handleGradeInputChange(sub.id, 'grade', e.target.value)}
                                            className="h-8"
                                        />
                                    </TableCell>
                                     <TableCell>
                                        <Textarea
                                            placeholder="Leave feedback..."
                                            value={sub.feedback ?? ''}
                                            onChange={(e) => handleGradeInputChange(sub.id, 'feedback', e.target.value)}
                                            rows={1}
                                            className="min-w-[200px]"
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                ) : (
                    <p className="text-center text-muted-foreground py-10">No submissions found for this assignment yet.</p>
                )}
            </div>
            <DialogFooter>
                 <DialogClose asChild>
                    <Button type="button" variant="outline">Close</Button>
                </DialogClose>
                <Button onClick={handleSaveGrades} disabled={isSavingGrades || isLoadingSubmissions}>
                    {isSavingGrades ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Changes
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
