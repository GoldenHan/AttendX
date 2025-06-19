
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, ClipboardList, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import type { Group, ClassroomItem as ClassroomItemType, User } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO, isPast } from 'date-fns';

export default function StudentMyTasksPage() {
  const { toast } = useToast();
  const { firestoreUser, institutionId, loading: authLoading } = useAuth();
  
  const [studentGroups, setStudentGroups] = useState<Group[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [classroomItems, setClassroomItems] = useState<ClassroomItemType[]>([]); // Will be used when fetching from Firestore
  const [isLoadingData, setIsLoadingData] = useState(true);

  const fetchStudentData = useCallback(async () => {
    if (!firestoreUser?.id || !institutionId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      // 1. Fetch groups the student is part of
      const groupsQuery = query(
        collection(db, 'groups'),
        where('studentIds', 'array-contains', firestoreUser.id),
        where('institutionId', '==', institutionId)
      );
      const groupsSnapshot = await getDocs(groupsQuery);
      const groups = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setStudentGroups(groups);

      // 2. Fetch classroom items for those groups (placeholder)
      // In a real scenario, you'd query 'classroomItems' where groupId is in groups.map(g => g.id)
      // and status is 'published'
      if (groups.length > 0) {
        // const groupIds = groups.map(g => g.id);
        // This query might be complex for Firestore if groupIds is large.
        // Consider restructuring or fetching per group if necessary.
        // For now, simulating some data or an empty state:
        console.log(`Would fetch published classroom items for groups: ${groups.map(g => g.name).join(', ')}`);
        setClassroomItems([
            // Example data
            { id: 'task1', groupId: groups[0]?.id || 'group1', institutionId, teacherId: 'teacherX', title: 'Complete Chapter 1 Reading', description: 'Read pages 1-20 and prepare notes.', itemType: 'assignment', dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'published'},
            { id: 'task2', groupId: groups[0]?.id || 'group1', institutionId, teacherId: 'teacherY', title: 'Reminder: Quiz Next Week', description: 'Remember the quiz on Monday covering Chapters 1-3.', itemType: 'reminder', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: 'published'},
        ].filter(item => item.groupId === groups[0]?.id)); // Show example for first group only
      } else {
        setClassroomItems([]);
      }

    } catch (error) {
      console.error('Error fetching student classroom data:', error);
      toast({ title: 'Error', description: 'Could not load your tasks and reminders.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  }, [firestoreUser?.id, institutionId, toast]);

  useEffect(() => {
    if (firestoreUser && institutionId) {
      fetchStudentData();
    }
  }, [firestoreUser, institutionId, fetchStudentData]);

  if (authLoading || isLoadingData) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading your classroom tasks...</span></div>;
  }
  
  const itemsToDisplay = classroomItems
    .filter(item => item.status === 'published') // Only show published items to students
    .sort((a, b) => {
      if (a.dueDate && b.dueDate) return parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
      if (a.dueDate) return -1; // items with due date first
      if (b.dueDate) return 1;
      return parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime(); // then by creation date
    });

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
          {studentGroups.length > 0 && itemsToDisplay.length === 0 && (
            <div className="text-center py-10 border-2 border-dashed rounded-lg">
              <Info className="mx-auto h-12 w-12 text-muted-foreground mb-2" />
              <p className="text-muted-foreground">No tasks or reminders found for your groups at the moment.</p>
              <p className="text-sm text-muted-foreground">Check back later or ask your teacher!</p>
            </div>
          )}
          {itemsToDisplay.map(item => {
            const groupName = studentGroups.find(g => g.id === item.groupId)?.name || 'Unknown Group';
            const isOverdue = item.dueDate && isPast(parseISO(item.dueDate));
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
                        <br />Due: <span className={cn("font-medium", isOverdue ? "text-destructive" : "text-foreground")}>{format(parseISO(item.dueDate), 'PPP p')} {isOverdue && "(Overdue)"}</span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{item.description || "No description provided."}</p>
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground">
                  Posted: {format(parseISO(item.createdAt), 'PPP p')}
                  {/* Placeholder for submission button for assignments */}
                  {item.itemType === 'assignment' && (
                    <Button size="sm" variant="outline" className="ml-auto" disabled>Submit (Not Implemented)</Button>
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
