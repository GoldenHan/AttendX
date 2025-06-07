'use client';

import React, { useState, useMemo } from 'react';
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
import { mockUsers, mockAttendanceRecords, mockSessions } from '@/lib/mock-data';
import type { User } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface UserAttendanceStats {
  userId: string;
  userName: string;
  totalSessions: number;
  present: number;
  absent: number;
  late: number;
  attendanceRate: number;
}

export default function AttendanceReportsPage() {
  const [selectedUserId, setSelectedUserId] = useState<string | 'all'>('all');

  const students = mockUsers.filter(user => user.role === 'student');

  const userAttendanceStats = useMemo((): UserAttendanceStats[] => {
    return students.map(student => {
      const studentRecords = mockAttendanceRecords.filter(r => r.userId === student.id);
      const present = studentRecords.filter(r => r.status === 'present').length;
      const absent = studentRecords.filter(r => r.status === 'absent').length;
      const late = studentRecords.filter(r => r.status === 'late').length;
      const totalAttendedOrLate = present + late;
      // Total sessions for a student could be complex. For simplicity, count distinct sessions they have a record for.
      // A better approach would be to count total scheduled sessions for their classes.
      const totalSessionsForStudent = new Set(studentRecords.map(r => r.sessionId)).size;

      return {
        userId: student.id,
        userName: student.name,
        totalSessions: totalSessionsForStudent,
        present,
        absent,
        late,
        attendanceRate: totalSessionsForStudent > 0 ? (totalAttendedOrLate / totalSessionsForStudent) * 100 : 0,
      };
    });
  }, [students]);

  const displayedStats = selectedUserId === 'all' 
    ? userAttendanceStats 
    : userAttendanceStats.filter(stat => stat.userId === selectedUserId);

  const chartData = displayedStats.map(stat => ({
    name: stat.userName.split(' ')[0], // Short name for chart
    Present: stat.present,
    Late: stat.late,
    Absent: stat.absent,
  }));

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
                {students.map(student => (
                  <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Total Sessions</TableHead>
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
                  <TableCell>{stat.totalSessions}</TableCell>
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
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="Present" fill="hsl(var(--primary))" />
                <Bar dataKey="Late" fill="hsl(var(--accent))" />
                <Bar dataKey="Absent" fill="hsl(var(--destructive))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
