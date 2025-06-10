
'use client';

import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, Download, Loader2, MessageSquareText } from 'lucide-react';
import type { AttendanceRecord as AttendanceRecordType, User, Session, Group } from '@/types'; // Changed ClassInfo to Group
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function AttendanceRecordsPage() {
  const [records, setRecords] = useState<AttendanceRecordType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<Group[]>([]); // Changed classes to groups, ClassInfo to Group
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [recordsSnapshot, usersSnapshot, sessionsSnapshot, groupsSnapshot] = await Promise.all([ // Changed classesSnapshot to groupsSnapshot
        getDocs(collection(db, 'attendanceRecords')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'sessions')),
        getDocs(collection(db, 'groups')), // Fetch from 'groups' collection
      ]);

      setRecords(recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecordType)));
      setUsers(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
      setSessions(sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session)));
      setGroups(groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group))); // Use Group type

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error fetching records', description: 'Could not load data from Firestore.', variant: 'destructive' });
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [toast]); // Added toast to dependency array as it's used in fetchData

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    try {
      await deleteDoc(doc(db, 'attendanceRecords', recordId));
      setRecords(prevRecords => prevRecords.filter(r => r.id !== recordId));
      toast({ title: 'Record Deleted', description: 'Attendance record removed successfully.' });
    } catch (error) {
      console.error("Error deleting record:", error);
      toast({ title: 'Delete Failed', description: 'Could not delete the record.', variant: 'destructive' });
    }
  };

  const getStudentName = (userId: string) => users.find(u => u.id === userId)?.name || 'Unknown Student';
  const getSessionInfo = (sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (!session) return 'Unknown Session';
    // Session.classId now refers to a Group.id
    const groupInfo = groups.find(g => g.id === session.classId); 
    return `${groupInfo?.name || 'Unknown Group'} (${session.date} ${session.time})`;
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>View and manage all logged attendance records.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">Loading records...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>View and manage all logged attendance records.</CardDescription>
          {/* TODO: Implement Export CSV
          <Button variant="outline" size="sm" className="ml-auto gap-1.5 text-sm">
            <Download className="size-3.5" />
            Export CSV (Coming Soon)
          </Button>
          */}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Session (Group)</TableHead> {/* Updated header */}
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Observation</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length > 0 ? records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{getStudentName(record.userId)}</TableCell>
                  <TableCell>{getSessionInfo(record.sessionId)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      record.status === 'present' ? 'bg-green-500/20 text-green-700 dark:text-green-400' :
                      record.status === 'absent' ? 'bg-red-500/20 text-red-700 dark:text-red-400' :
                      'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' // Assuming 'late' might be a status
                    }`}>
                      {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                    </span>
                  </TableCell>
                  <TableCell>{new Date(record.timestamp).toLocaleString()}</TableCell>
                  <TableCell>
                    {record.observation ? (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="cursor-default">
                            <MessageSquareText className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs break-words">
                          <p>{record.observation}</p>
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {/* TODO: Implement Edit Record
                    <Button variant="ghost" size="icon" className="mr-2" onClick={() => alert('Edit not implemented yet.')}>
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    */}
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRecord(record.id)}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">No attendance records found.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
