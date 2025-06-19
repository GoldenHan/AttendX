
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Loader2, ClipboardList, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp, orderBy } from 'firebase/firestore'; // Removed documentId
import type { Group, ClassroomItem as ClassroomItemType } from '@/types'; // Removed User type as firestoreUser is used
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO, isPast, isValid } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function StudentMyTasksPage() {
  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth(); // Renamed institutionId to firestoreUser.institutionId
  
  const [studentGroups, setStudentGroups] = useState<Group[]>([]);
  const [classroomItems, setClassroomItems] = useState<ClassroomItemType[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const fetchStudentData = useCallback(async () => {
    if (!firestoreUser?.id || !firestoreUser.institutionId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      const groupsQuery = query(
        collection(db, 'groups'),
        where('studentIds', 'array-contains', firestoreUser.id),
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const groupsSnapshot = await getDocs(groupsQuery);
      const groups = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setStudentGroups(groups);

      if (groups.length > 0) {
        const groupIds = groups.map(g => g.id);
        // Firestore 'in' queries are limited to 30 items. If a student is in more groups, this needs pagination or multiple queries.
        // For now, assuming a student won't be in an excessive number of groups simultaneously.
        const itemsQuery = query(
          collection(db, 'classroomItems'),
          where('groupId', 'in', groupIds),
          where('institutionId', '==', firestoreUser.institutionId),
          where('status', '==', 'published'),
          orderBy('dueDate', 'asc') // nulls last by default, or handle explicitly
          // Consider a secondary sort for items without due dates, e.g., orderBy('createdAt', 'desc')
        );
        const itemsSnapshot = await getDocs(itemsQuery);
        const fetchedItems = itemsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            createdAt: data.createdAt instanceof Timestamp ? data.createdAt.toDate().toISOString() : data.createdAt,
            updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate().toISOString() : data.updatedAt,
            dueDate: data.dueDate instanceof Timestamp ? data.dueDate.toDate().toISOString() : data.dueDate,
          } as ClassroomItemType;
        });
        
        // Manual sort for items without due dates to appear after those with due dates
        fetchedItems.sort((a, b) => {
          if (a.dueDate && b.dueDate) return parseISO(a.dueDate).getTime() - parseISO(b.dueDate).getTime();
          if (a.dueDate) return -1; // a has due date, b doesn't, a comes first
          if (b.dueDate) return 1;  // b has due date, a doesn't, b comes first
          // Both don't have due dates, sort by creation (newest first)
          return parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime();
        });

        setClassroomItems(fetchedItems);

      } else {
        setClassroomItems([]);
      }

    } catch (error) {
      console.error('Error fetching student classroom data:', error);
      toast({ title: 'Error', description: 'Could not load your tasks and reminders.', variant: 'destructive' });
      setClassroomItems([]);
    }
    setIsLoadingData(false);
  }, [firestoreUser?.id, firestoreUser?.institutionId, toast]);

  useEffect(() => {
    if (!authLoading && firestoreUser && firestoreUser.institutionId) {
      fetchStudentData();
    }
  }, [authLoading, firestoreUser, fetchStudentData]);

  if (authLoading || isLoadingData) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading your classroom tasks...</span></div>;
  }
  
  // No need for itemsToDisplay, classroomItems is already filtered and sorted by the query and sort logic.

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
            const isOverdue = item.dueDate && isValid(parseISO(item.dueDate)) && isPast(parseISO(item.dueDate));
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
                        <br />Due: <span className={cn("font-medium", isOverdue ? "text-destructive" : "text-foreground")}>
                          {isValid(parseISO(item.dueDate)) ? format(parseISO(item.dueDate), 'PPP p') : 'Invalid Date'} {isOverdue && "(Overdue)"}
                          </span>
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm whitespace-pre-wrap">{item.description || "No description provided."}</p>
                </CardContent>
                <CardFooter className="text-xs text-muted-foreground flex justify-between items-center">
                  <span>Posted: {item.createdAt && isValid(parseISO(item.createdAt)) ? format(parseISO(item.createdAt), 'PPP p') : 'Not available'}</span>
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

