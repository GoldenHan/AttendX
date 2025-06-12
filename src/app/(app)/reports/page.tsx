
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
import type { User, AttendanceRecord as AttendanceRecordType, Group } from '@/types'; // Added Group
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';

interface UserAttendanceStats {
  userId: string;
  userName: string;
  totalSessionsWithRecord: number;
  present: number;
  absent: number;
  late: number;
  attendanceRate: number;
}

export default function AttendanceReportsPage() {
  const [selectedGroupId, setSelectedGroupId] = useState<string | 'all'>('all');
  const [selectedUserId, setSelectedUserId] = useState<string | 'all'>('all');
  
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecordType[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const studentQuery = query(collection(db, 'students')); // Fetch from 'students' collection
        
        const [studentsSnapshot, attendanceSnapshot, groupsSnapshot] = await Promise.all([
          getDocs(studentQuery),
          getDocs(collection(db, 'attendanceRecords')),
          getDocs(collection(db, 'groups')),
        ]);

        setAllStudents(studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
        setAllAttendanceRecords(attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecordType)));
        setAllGroups(groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)));

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

  const studentsForFilterDropdown = useMemo(() => {
    if (selectedGroupId === 'all') {
      return allStudents;
    }
    const group = allGroups.find(g => g.id === selectedGroupId);
    if (group?.studentIds) {
      return allStudents.filter(s => group.studentIds.includes(s.id));
    }
    return [];
  }, [allStudents, allGroups, selectedGroupId]);

  const displayedStats = useMemo(() => {
    let statsToDisplay = userAttendanceStats;

    if (selectedGroupId !== 'all') {
      const group = allGroups.find(g => g.id === selectedGroupId);
      const studentIdsInGroup = group?.studentIds || [];
      statsToDisplay = statsToDisplay.filter(stat => studentIdsInGroup.includes(stat.userId));
    }

    if (selectedUserId !== 'all') {
      statsToDisplay = statsToDisplay.filter(stat => stat.userId === selectedUserId);
    }
    return statsToDisplay;
  }, [userAttendanceStats, selectedGroupId, selectedUserId, allGroups]);


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
          <CardDescription>View attendance statistics for students, filterable by group.</CardDescription>
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
          <CardDescription>View attendance statistics for students. Filter by group and then by student.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="group-filter">Filter by Group</Label>
              <Select 
                value={selectedGroupId} 
                onValueChange={(value) => {
                  setSelectedGroupId(value);
                  setSelectedUserId('all'); // Reset student filter when group changes
                }}
              >
                <SelectTrigger id="group-filter" className="w-full md:w-[280px]">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {allGroups.map(group => (
                    <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="student-filter">Filter by Student</Label>
              <Select 
                value={selectedUserId} 
                onValueChange={setSelectedUserId}
                disabled={studentsForFilterDropdown.length === 0 && selectedGroupId !== 'all'}
              >
                <SelectTrigger id="student-filter" className="w-full md:w-[280px]">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {selectedGroupId === 'all' ? 'All Students (Global)' : 
                     studentsForFilterDropdown.length > 0 ? 'All Students in Group' : 'No students in group'}
                  </SelectItem>
                  {studentsForFilterDropdown.map(student => (
                    <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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
                    <TableCell colSpan={6} className="text-center h-24">
                    {selectedGroupId !== 'all' && studentsForFilterDropdown.length === 0 
                        ? 'No students found in the selected group.'
                        : 'No attendance data available for the current selection.'
                    }
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
            <CardDescription>Visual representation of student attendance based on current filters.</CardDescription>
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
