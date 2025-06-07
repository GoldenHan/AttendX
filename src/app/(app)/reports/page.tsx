
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { User, AttendanceRecord as AttendanceRecordType } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface UserAttendanceStats {
  userId: string;
  userName: string;
  totalSessionsWithRecord: number; // Renamed for clarity
  present: number;
  absent: number;
  late: number;
  attendanceRate: number; // (present + late) / totalSessionsWithRecord
}

export default function AttendanceReportsPage() {
  const [selectedUserId, setSelectedUserId] = useState<string | 'all'>('all');
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecordType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'));
        const usersSnapshot = await getDocs(studentQuery);
        setAllStudents(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));

        const attendanceSnapshot = await getDocs(collection(db, 'attendanceRecords'));
        setAllAttendanceRecords(attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecordType)));
      } catch (error) {
        console.error("Error fetching report data:", error);
        toast({ title: 'Error fetching data', description: 'Could not load data for reports.', variant: 'destructive' });
      }
      setIsLoading(false);
    };
    fetchData();
  }, [toast]);

  const userAttendanceStats = useMemo((): UserAttendanceStats[] => {
    if (isLoading) return [];
    return allStudents.map(student => {
      const studentRecords = allAttendanceRecords.filter(r => r.userId === student.id);
      const present = studentRecords.filter(r => r.status === 'present').length;
      const absent = studentRecords.filter(r => r.status === 'absent').length;
      const late = studentRecords.filter(r => r.status === 'late').length;
      
      const totalAttendedOrLate = present + late;
      const totalSessionsWithRecord = new Set(studentRecords.map(r => r.sessionId)).size;

      return {
        userId: student.id,
        userName: student.name,
        totalSessionsWithRecord: totalSessionsWithRecord,
        present,
        absent,
        late,
        attendanceRate: totalSessionsWithRecord > 0 ? (totalAttendedOrLate / totalSessionsWithRecord) * 100 : 0,
      };
    });
  }, [allStudents, allAttendanceRecords, isLoading]);

  const displayedStats = selectedUserId === 'all' 
    ? userAttendanceStats 
    : userAttendanceStats.filter(stat => stat.userId === selectedUserId);

  const chartData = displayedStats.map(stat => ({
    name: stat.userName.split(' ')[0], 
    Present: stat.present,
    Late: stat.late,
    Absent: stat.absent,
  }));
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance Reports</CardTitle>
          <CardDescription>View attendance statistics for students.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading report data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Attendance Reports</CardTitle>
          <CardDescription>View attendance statistics for students.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="w-[280px]">
                <SelectValue placeholder="Select a student or all" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Students</SelectItem>
                {allStudents.map(student => (
                  <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Sessions with Records</TableHead>
                <TableHead>Present</TableHead>
                <TableHead>Late</TableHead>
                <TableHead>Absent</TableHead>
                <TableHead>Attendance Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayedStats.length > 0 ? displayedStats.map((stat) => (
                <TableRow key={stat.userId}>
                  <TableCell>{stat.userName}</TableCell>
                  <TableCell>{stat.totalSessionsWithRecord}</TableCell>
                  <TableCell>{stat.present}</TableCell>
                  <TableCell>{stat.late}</TableCell>
                  <TableCell>{stat.absent}</TableCell>
                  <TableCell>{stat.attendanceRate.toFixed(1)}%</TableCell>
                </TableRow>
              )) : (
                 <TableRow>
                    <TableCell colSpan={6} className="text-center">
                    {selectedUserId === 'all' ? 'No student data available.' : 'No data for selected student.'}
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Attendance Overview Chart</CardTitle>
            <CardDescription>Visual representation of student attendance.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis allowDecimals={false}/>
                <Tooltip />
                <Legend />
                <Bar dataKey="Present" fill="hsl(var(--chart-1))" />
                <Bar dataKey="Late" fill="hsl(var(--chart-2))" />
                <Bar dataKey="Absent" fill="hsl(var(--chart-3))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
