
'use client';

import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, ClipboardList, Info, CheckCircle, AlertCircle, Award, Paperclip } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db, storage } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import type { Group, ClassroomItem as ClassroomItemType, ClassroomItemSubmission, Attachment } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO, isPast, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface DisplayableClassroomItem extends ClassroomItemType {
  submission?: ClassroomItemSubmission | null;
  isSubmitting?: boolean;
}

export default function StudentMyTasksPage() {
  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth(); 
  
  const [studentGroups, setStudentGroups] = useState<Group[]>([]);
  const [classroomItems, setClassroomItems] = useState<DisplayableClassroomItem[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [filesToSubmit, setFilesToSubmit] = useState<Record<string, FileList | null>>({});

  const handleFileSelection = (itemId: string, files: FileList | null) => {
    setFilesToSubmit(prev => ({ ...prev, [itemId]: files }));
  };

  const fetchStudentDataAndSubmissions = useCallback(async () => {
    if (!firestoreUser?.id || !firestoreUser.institutionId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      // Fetch student's groups
      const groupsQuery = query(
        collection(db, 'groups'),
        where('studentIds', 'array-contains', firestoreUser.id),
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const groupsSnapshot = await getDocs(groupsQuery);
      const groups = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setStudentGroups(groups);

      let fetchedItems: DisplayableClassroomItem[] = [];
      if (groups.length > 0) {
        const groupIds = groups.map(g => g.id);
        const itemsQuery = query(
          collection(db, 'classroomItems'),
          where('groupId', 'in', groupIds),
          where('institutionId', '==', firestoreUser.institutionId),
          where('status', '==', 'published')
          // Order by dueDate, then createdAt
        );
        const itemsSnapshot = await getDocs(itemsQuery);
        fetchedItems = itemsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
            dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString() : data.dueDate,
            submission: undefined, // Will be fetched next
          } as DisplayableClassroomItem;
        });
        
        fetchedItems.sort((a, b) => {
          if (a.dueDate && b.dueDate) return parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
          if (a.dueDate) return -1;
          if (b.dueDate) return 1;
          return parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime();
        });

        // Fetch submissions for these items by the current student
        if (fetchedItems.length > 0) {
          const itemIds = fetchedItems.map(item => item.id);
          const submissionsQuery = query(
            collection(db, 'classroomItemSubmissions'),
            where('studentId', '==', firestoreUser.id),
            where('itemId', 'in', itemIds),
            where('institutionId', '==', firestoreUser.institutionId)
          );
          const submissionsSnapshot = await getDocs(submissionsQuery);
          const submissionsMap = new Map<string, ClassroomItemSubmission>();
          submissionsSnapshot.forEach(doc => {
            submissionsMap.set(doc.data().itemId, { id: doc.id, ...doc.data() } as ClassroomItemSubmission);
          });

          fetchedItems = fetchedItems.map(item => ({
            ...item,
            submission: submissionsMap.get(item.id) || null,
          }));
        }
      }
      setClassroomItems(fetchedItems);
    } catch (error) {
      console.error('Error fetching student classroom data:', error);
      toast({ title: 'Error', description: 'Could not load your tasks and reminders.', variant: 'destructive' });
      setClassroomItems([]);
    }
    setIsLoadingData(false);
  }, [firestoreUser?.id, firestoreUser?.institutionId, toast]);

  useEffect(() => {
    if (!authLoading && firestoreUser && firestoreUser.institutionId) {
      fetchStudentDataAndSubmissions();
    }
  }, [authLoading, firestoreUser, fetchStudentDataAndSubmissions]);

  const handleMarkAsComplete = async (item: DisplayableClassroomItem) => {
    if (!firestoreUser || item.submission || item.isSubmitting) return;

    setClassroomItems(prevItems => prevItems.map(i => i.id === item.id ? { ...i, isSubmitting: true } : i));

    try {
      const submissionTime = new Date();
      const isItemLate = item.dueDate && isValid(parseISO(item.dueDate)) ? isPast(parseISO(item.dueDate)) : false;
      
      const newSubmissionData: Omit<ClassroomItemSubmission, 'id'> = {
        itemId: item.id,
        studentId: firestoreUser.id,
        institutionId: firestoreUser.institutionId,
        groupId: item.groupId,
        submittedAt: submissionTime.toISOString(),
        status: isItemLate ? 'late' : 'submitted',
        grade: null,
        feedback: null,
        attachments: [],
      };

      const submissionDocRef = await addDoc(collection(db, 'classroomItemSubmissions'), newSubmissionData);
      
      const filesForThisItem = filesToSubmit[item.id];
      let uploadedAttachments: Attachment[] = [];

      if (filesForThisItem && filesForThisItem.length > 0) {
        toast({ title: 'Submitting...', description: `Uploading ${filesForThisItem.length} file(s)...` });
        const attachmentPromises = Array.from(filesForThisItem).map(async (file) => {
          const storagePath = `submissions/${submissionDocRef.id}/${file.name}`;
          const storageRef = ref(storage, storagePath);
          await uploadBytes(storageRef, file);
          const url = await getDownloadURL(storageRef);
          return { name: file.name, url, path: storagePath };
        });
        uploadedAttachments = await Promise.all(attachmentPromises);
        
        // Update the submission document with the attachment details
        await db.collection('classroomItemSubmissions').doc(submissionDocRef.id).update({
          attachments: uploadedAttachments,
        });
      }

      setClassroomItems(prevItems => prevItems.map(i => 
        i.id === item.id ? { 
          ...i, 
          submission: { ...newSubmissionData, id: submissionDocRef.id, attachments: uploadedAttachments }, 
          isSubmitting: false 
        } : i
      ));
      toast({ title: 'Success', description: `"${item.title}" submitted successfully.` });
      setFilesToSubmit(prev => ({...prev, [item.id]: null}));

      const itemOwnerId = item.teacherId; // The user who created the item
      if (itemOwnerId) {
          const message = `${firestoreUser.name} has submitted the assignment "${item.title}".`;
          const newNotification = {
              userId: itemOwnerId,
              institutionId: firestoreUser.institutionId,
              message: message,
              read: false,
              createdAt: new Date().toISOString(),
              relatedUrl: `/classroom/assignments`,
          };
          await addDoc(collection(db, 'notifications'), newNotification);
      }

    } catch (error) {
      console.error('Error submitting item:', error);
      toast({ title: 'Error', description: 'Could not submit item.', variant: 'destructive' });
      setClassroomItems(prevItems => prevItems.map(i => i.id === item.id ? { ...i, isSubmitting: false } : i));
    }
  };

  if (authLoading || isLoadingData) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading your classroom tasks...</span></div>;
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-6 w-6 text-primary" /> My Classroom Tasks & Reminders</CardTitle>
          <CardDescription>Here are the assignments and reminders from your groups.</CardDescription>
        </CardHeader>
        <CardContent>
          {studentGroups.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed rounded-lg">
              <Info className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">You are not currently enrolled in any groups.</p>
              <p className="text-sm text-muted-foreground">If you believe this is an error, please contact your teacher or an administrator.</p>
            </div>
          )}
          {studentGroups.length > 0 && classroomItems.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed rounded-lg">
              <Info className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No tasks or reminders found for your groups at the moment.</p>
              <p className="text-sm text-muted-foreground">Check back later or ask your teacher!</p>
            </div>
          )}
          {classroomItems.map(item => {
            const groupName = studentGroups.find(g => g.id === item.groupId)?.name || 'Unknown Group';
            const isItemOverdue = item.dueDate && isValid(parseISO(item.dueDate)) && isPast(parseISO(item.dueDate));
            const submittedLate = item.submission?.status === 'late';
            const hasGradeOrFeedback = (item.submission?.grade != null) || (item.submission?.feedback != null);

            return (
              <Card key={item.id} className="mb-4">
                <CardHeader>
                  <CardTitle className="flex justify-between items-start">
                    <span className="text-lg">{item.title}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${item.itemType === 'assignment' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'}`}>
                      {item.itemType.charAt(0).toUpperCase() + item.itemType.slice(1)}
                    </span>
                  </CardTitle>
                  <CardDescription>
                    For Group: <span className="font-medium text-foreground">{groupName}</span>
                    {item.dueDate && (
                      <>
                        <br />Due: <span className={cn("font-medium", isItemOverdue && !item.submission ? "text-destructive" : "text-foreground")}>
                          {isValid(parseISO(item.dueDate)) ? format(parseISO(item.dueDate), 'PPP p') : 'Invalid Date'} {isItemOverdue && !item.submission && "(Overdue)"}
                          </span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{item.description || "No description provided."}</p>
                   
                   {item.attachments && item.attachments.length > 0 && (
                      <div className="mt-4">
                        <h4 className="text-sm font-medium text-muted-foreground mb-2">Teacher's Attachments</h4>
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
                   
                   {(hasGradeOrFeedback || (item.submission && item.submission.attachments && item.submission.attachments.length > 0)) && (
                      <Accordion type="single" collapsible className="w-full mt-4">
                        <AccordionItem value="submission-details">
                          <AccordionTrigger className="text-sm">
                             <div className="flex items-center gap-2">
                                <Award className="h-4 w-4 text-primary"/>
                                View Submission Details
                             </div>
                          </AccordionTrigger>
                          <AccordionContent className="pt-2 space-y-4">
                             {item.submission?.attachments && item.submission.attachments.length > 0 && (
                                <div>
                                  <p className="font-semibold mb-2">Your Submitted Files:</p>
                                  <div className="flex flex-wrap gap-2">
                                    {item.submission.attachments.map(att => (
                                       <a key={att.path} href={att.url} target="_blank" rel="noopener noreferrer" className="text-sm flex items-center gap-1.5 bg-muted hover:bg-muted/80 px-2 py-1 rounded-md text-foreground">
                                        <Paperclip className="h-4 w-4" />
                                        {att.name}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                             )}
                             {item.submission?.grade != null && (
                                <p><strong>Grade: </strong> <span className="text-lg font-bold text-primary">{item.submission.grade}</span></p>
                              )}
                              {item.submission?.feedback && (
                                <div>
                                  <p className="font-semibold">Feedback:</p>
                                  <p className="text-muted-foreground whitespace-pre-wrap">{item.submission.feedback}</p>
                                </div>
                              )}
                          </AccordionContent>
                        </AccordionItem>
                      </Accordion>
                    )}
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                  <span>Posted: {item.createdAt && isValid(parseISO(item.createdAt)) ? format(parseISO(item.createdAt), 'PPP p') : 'Not available'}</span>
                  {item.itemType === 'assignment' && (
                    <div className="w-full sm:w-auto">
                      {item.submission ? (
                        <div className="flex items-center justify-end gap-2">
                          <span className={cn(
                            "text-sm font-medium flex items-center",
                            submittedLate ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
                          )}>
                            {submittedLate ? <AlertCircle className="h-4 w-4 mr-1" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                            Submitted {submittedLate ? '(Late)' : '(On Time)'}
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:justify-end mt-2 sm:mt-0">
                          <Input
                            type="file"
                            multiple
                            className="h-9 text-xs file:mr-2 file:text-xs"
                            onChange={(e: ChangeEvent<HTMLInputElement>) => handleFileSelection(item.id, e.target.files)}
                            disabled={item.isSubmitting}
                          />
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => handleMarkAsComplete(item)}
                            disabled={item.isSubmitting || !!item.submission}
                            className="w-full sm:w-auto"
                          >
                            {item.isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Submit
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardFooter>
              </Card>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
