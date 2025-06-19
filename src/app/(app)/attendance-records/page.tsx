
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Pencil, Trash2, Download, Loader2, MessageSquareText } from 'lucide-react';
import type { AttendanceRecord as AttendanceRecordType, User, Session, Group } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from '@/contexts/AuthContext';

export default function AttendanceRecordsPage() {
  const [allRecords, setAllRecords] = useState<AttendanceRecordType[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | 'all'>('all');
  const { toast } = useToast();
  const { firestoreUser } = useAuth();

  const fetchData = useCallback(async () => {
    if (!firestoreUser?.institutionId) {
      setIsLoading(false);
      toast({ title: "Error", description: "No institution context found.", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const institutionId = firestoreUser.institutionId;
      const recordsQuery = query(collection(db, 'attendanceRecords'), where('institutionId', '==', institutionId));
      const usersQuery = query(collection(db, 'users'), where('institutionId', '==', institutionId)); // All users in institution
      const sessionsQuery = query(collection(db, 'sessions'), where('institutionId', '==', institutionId));
      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', institutionId));

      const [recordsSnapshot, usersSnapshot, sessionsSnapshot, groupsSnapshot] = await Promise.all([
        getDocs(recordsQuery),
        getDocs(usersQuery),
        getDocs(sessionsQuery),
        getDocs(groupsQuery),
      ]);

      setAllRecords(recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecordType)));
      setUsers(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
      setSessions(sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session)));
      setGroups(groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)));

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error fetching records', description: 'Could not load data from Firestore.', variant: 'destructive' });
    }
    setIsLoading(false);
  }, [toast, firestoreUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDeleteRecord = async (recordId: string) => {
    if (!confirm('Are you sure you want to delete this record?')) return;
    // Add institution check before deleting if necessary, though records are already filtered
    const recordToDelete = allRecords.find(r => r.id === recordId);
    if (recordToDelete?.institutionId !== firestoreUser?.institutionId) {
        toast({ title: 'Permission Denied', description: 'Cannot delete record from another institution.', variant: 'destructive' });
        return;
    }
    try {
      await deleteDoc(doc(db, 'attendanceRecords', recordId));
      setAllRecords(prevRecords => prevRecords.filter(r => r.id !== recordId));
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
    const groupInfo = groups.find(g => g.id === session.classId); 
    return `${groupInfo?.name || 'Unknown Group'} (${session.date} ${session.time})`;
  };

  const filteredRecords = useMemo(() => {
    if (selectedGroupId === 'all') {
      return allRecords;
    }
    const groupSessionIds = sessions
      .filter(session => session.classId === selectedGroupId)
      .map(session => session.id);
    
    return allRecords.filter(record => groupSessionIds.includes(record.sessionId));
  }, [allRecords, sessions, selectedGroupId]);
  
  if (isLoading || !firestoreUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance Records</CardTitle>
          <CardDescription>View and manage all logged attendance records.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
           <p className="ml-2">{!firestoreUser ? "Verifying user..." : "Loading records..."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Attendance Records</CardTitle>
              <CardDescription>View and manage logged attendance records for your institution. Filter by group.</CardDescription>
            </div>
            <div className="w-full sm:w-auto min-w-[200px]">
              <Label htmlFor="group-filter" className="sr-only">Filter by Group</Label>
              <Select value={selectedGroupId} onValueChange={setSelectedGroupId} disabled={isLoading || groups.length === 0}>
                <SelectTrigger id="group-filter">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Session (Group)</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Observation</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.length > 0 ? filteredRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{getStudentName(record.userId)}</TableCell>
                  <TableCell>{getSessionInfo(record.sessionId)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                      record.status === 'present' ? 'bg-green-500/20 text-green-700 dark:text-green-400' :
                      record.status === 'absent' ? 'bg-red-500/20 text-red-700 dark:text-red-400' :
                      'bg-yellow-500/20 text-yellow-700 dark:text-yellow-400' 
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
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteRecord(record.id)}>
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </TableCell>
                </TableRow>
              )) : (
                <TableRow>
                  <TableCell colSpan={6} className="text-center">
                    {selectedGroupId === 'all' ? 'No attendance records found for your institution.' : 'No attendance records found for the selected group.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}

