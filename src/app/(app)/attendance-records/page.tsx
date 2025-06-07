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
import { Pencil, Trash2, Download } from 'lucide-react';
import { mockAttendanceRecords, mockUsers, mockSessions, mockClasses } from '@/lib/mock-data'; // Assuming this path
import type { AttendanceRecord as AttendanceRecordType } from '@/types'; // Assuming this path

// This would come from a global store or context in a real app
const getLocalAttendanceRecords = (): AttendanceRecordType[] => {
  // For now, just return the mock. In a real app, this might be from localStorage or a state variable
  // updated by the attendance log page. We will use the mock data directly for display.
  return mockAttendanceRecords; 
};


export default function AttendanceRecordsPage() {
  const [records, setRecords] = useState<AttendanceRecordType[]>([]);

  useEffect(() => {
    // Simulating fetching records. In a real app, this would be an API call or from a shared state.
    setRecords(getLocalAttendanceRecords());
  }, []);

  const getStudentName = (userId: string) => mockUsers.find(u => u.id === userId)?.name || 'Unknown Student';
  const getSessionInfo = (sessionId: string) => {
    const session = mockSessions.find(s => s.id === sessionId);
    if (!session) return 'Unknown Session';
    const classInfo = mockClasses.find(c => c.id === session.classId);
    return `${classInfo?.name || 'Unknown Class'} (${session.date} ${session.time})`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attendance Records</CardTitle>
        <CardDescription>View and manage all logged attendance records.</CardDescription>
        <Button variant="outline" size="sm" className="ml-auto gap-1.5 text-sm">
          <Download className="size-3.5" />
          Export CSV (Coming Soon)
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.length > 0 ? records.map((record) => (
              <TableRow key={record.id}>
                <TableCell>{getStudentName(record.userId)}</TableCell>
                <TableCell>{getSessionInfo(record.sessionId)}</TableCell>
                <TableCell>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    record.status === 'present' ? 'bg-green-100 text-green-800' :
                    record.status === 'absent' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                  </span>
                </TableCell>
                <TableCell>{new Date(record.timestamp).toLocaleString()}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" className="mr-2">
                    <Pencil className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Delete</span>
                  </Button>
                </TableCell>
              </TableRow>
            )) : (
              <TableRow>
                <TableCell colSpan={5} className="text-center">No attendance records found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
