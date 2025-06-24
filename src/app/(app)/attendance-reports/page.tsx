
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { User, AttendanceRecord as AttendanceRecordType, Group, Session } from '@/types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Loader2, CalendarIcon, Download, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';


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
  const [reportType, setReportType] = useState<'overall' | 'customRange'>('overall');
  
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allAttendanceRecords, setAllAttendanceRecords] = useState<AttendanceRecordType[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  
  const [customStartDate, setCustomStartDate] = useState<Date | null>(null);
  const [customEndDate, setCustomEndDate] = useState<Date | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const { toast } = useToast();
  const { firestoreUser } = useAuth();

  const fetchData = useCallback(async () => {
    if (!firestoreUser?.institutionId) {
      setIsLoadingData(false);
      toast({ title: "Error", description: "No institution context found.", variant: "destructive" });
      return;
    }
    setIsLoadingData(true);
    try {
      const institutionId = firestoreUser.institutionId;

      const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId));
      const attendanceQuery = query(collection(db, 'attendanceRecords'), where('institutionId', '==', institutionId));
      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', institutionId));
      const sessionsQuery = query(collection(db, 'sessions'), where('institutionId', '==', institutionId));
      
      const [
        studentsSnapshot, 
        attendanceSnapshot, 
        groupsSnapshot, 
        sessionsSnapshot,
      ] = await Promise.all([
        getDocs(studentQuery),
        getDocs(attendanceQuery),
        getDocs(groupsQuery),
        getDocs(sessionsQuery),
      ]);

      setAllStudents(studentsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      setAllAttendanceRecords(attendanceSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecordType)));
      setAllGroups(groupsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
      setAllSessions(sessionsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Session)));

    } catch (error) {
      console.error("Error fetching report data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load data for reports.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  }, [toast, firestoreUser]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const userAttendanceStats = useMemo((): UserAttendanceStats[] => {
    if (isLoadingData || !firestoreUser) return [];

    let relevantRecords = allAttendanceRecords; // Already institution-scoped
    let relevantSessionIds = new Set(allSessions.map(s => s.id)); // Already institution-scoped

    if (reportType === 'customRange' && customStartDate && customEndDate) {
      const rangeStart = new Date(customStartDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(customEndDate);
      rangeEnd.setHours(23, 59, 59, 999);

      const rangeSessionIdsFiltered = new Set<string>();
      allSessions.forEach(session => {
        const sessionDateParts = session.date.split('-').map(Number);
        const sessionDate = new Date(sessionDateParts[0], sessionDateParts[1] - 1, sessionDateParts[2]);
        if (sessionDate >= rangeStart && sessionDate <= rangeEnd) {
          rangeSessionIdsFiltered.add(session.id);
        }
      });
      relevantSessionIds = rangeSessionIdsFiltered;
      relevantRecords = allAttendanceRecords.filter(r => relevantSessionIds.has(r.sessionId));
    }
    
    // Filter students for the current institution, in case allStudents was not pre-filtered (though it should be by fetchData)
    const institutionStudents = allStudents.filter(s => s.institutionId === firestoreUser.institutionId);

    return institutionStudents.map(student => {
      const studentRecords = relevantRecords.filter(r => r.userId === student.id);
      const present = studentRecords.filter(r => r.status === 'present').length;
      const absent = studentRecords.filter(r => r.status === 'absent').length;
      const late = studentRecords.filter(r => r.status === 'late').length;
      
      const totalAttendedOrLate = present + late;
      
      let actualExpectedSessionsForStudent = 0;
      const studentGroup = allGroups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(student.id));
      if (studentGroup) {
        allSessions.forEach(session => {
            if (session.classId === studentGroup.id && relevantSessionIds.has(session.id)) {
                actualExpectedSessionsForStudent++;
            }
        });
      }
      
      const uniqueSessionIdsForStudentRecords = new Set(studentRecords.map(r => r.sessionId));
      const totalSessionsWithRecord = uniqueSessionIdsForStudentRecords.size;

      const baseForRate = actualExpectedSessionsForStudent > 0 ? actualExpectedSessionsForStudent : totalSessionsWithRecord;

      return {
        userId: student.id,
        userName: student.name,
        totalSessionsWithRecord: totalSessionsWithRecord, 
        present,
        absent,
        late,
        attendanceRate: baseForRate > 0 ? (totalAttendedOrLate / baseForRate) * 100 : 0,
      };
    });
  }, [allStudents, allAttendanceRecords, allSessions, allGroups, isLoadingData, reportType, customStartDate, customEndDate, firestoreUser]);

  const studentsForFilterDropdown = useMemo(() => {
    if (!firestoreUser) return [];
    const institutionStudents = allStudents.filter(s => s.institutionId === firestoreUser.institutionId);
    if (selectedGroupId === 'all') {
      return institutionStudents;
    }
    const group = allGroups.find(g => g.id === selectedGroupId && g.institutionId === firestoreUser.institutionId);
    if (group?.studentIds) {
      return institutionStudents.filter(s => group.studentIds.includes(s.id));
    }
    return [];
  }, [allStudents, allGroups, selectedGroupId, firestoreUser]);

  const displayedStats = useMemo(() => {
    let statsToDisplay = userAttendanceStats; // Already institution-scoped from calculation

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

  const reportDateDescription = reportType === 'customRange' && customStartDate && customEndDate
    ? `from ${format(customStartDate, "PPP")} to ${format(customEndDate, "PPP")}`
    : (reportType === 'customRange' ? "(select date range)" : "overall");

  const handleExportToCSV = () => {
    if (displayedStats.length === 0) {
      toast({ title: 'No data to export', description: 'There is no data for the current selection.', variant: 'default' });
      return;
    }

    const headers = ['Student Name', 'Sessions w/ Record', 'Present', 'Late', 'Absent', 'Attendance Rate (%)'];
    const csvRows = [
      headers.join(','),
      ...displayedStats.map(stat => [
        `"${stat.userName.replace(/"/g, '""')}"`, // Handle names with quotes
        stat.totalSessionsWithRecord,
        stat.present,
        stat.late,
        stat.absent,
        stat.attendanceRate.toFixed(1)
      ].join(','))
    ];

    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const today = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Attendance_Report_${today}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Export Successful', description: 'Attendance report exported as CSV.' });
  };
  
  const handleExportToHTML = () => {
    if (displayedStats.length === 0) {
      toast({ title: 'No data to export', description: 'There is no data for the current selection.', variant: 'default' });
      return;
    }
    
    let htmlString = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Attendance Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; }
          table { border-collapse: collapse; width: 100%; font-size: 0.9em; }
          th, td { border: 1px solid #ddd; padding: 8px; }
          th { background-color: #f2f2f2; text-align: left; }
          tr:nth-child(even) { background-color: #f9f9f9; }
          h2, p { color: #333; }
        </style>
      </head>
      <body>
        <h2>Attendance Report ${reportDateDescription}</h2>
        <p>Filters: Group - ${allGroups.find(g => g.id === selectedGroupId)?.name || 'All'}, Student - ${allStudents.find(s => s.id === selectedUserId)?.name || 'All'}</p>
        <table>
          <thead>
            <tr>
              <th>Student Name</th>
              <th>Sessions w/ Record</th>
              <th>Present</th>
              <th>Late</th>
              <th>Absent</th>
              <th>Attendance Rate</th>
            </tr>
          </thead>
          <tbody>
    `;

    displayedStats.forEach(stat => {
      htmlString += `
        <tr>
          <td>${stat.userName}</td>
          <td>${stat.totalSessionsWithRecord}</td>
          <td>${stat.present}</td>
          <td>${stat.late}</td>
          <td>${stat.absent}</td>
          <td>${stat.attendanceRate.toFixed(1)}%</td>
        </tr>
      `;
    });

    htmlString += `
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob([htmlString], { type: 'text/html' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    const today = new Date().toISOString().split('T')[0];
    link.download = `Attendance_Report_${today}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast({ title: 'Export Successful', description: 'Attendance report exported as HTML.' });
  };

  if (isLoadingData || !firestoreUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Attendance Reports</CardTitle>
          <CardDescription>View attendance statistics for students.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">{!firestoreUser ? "Verifying user..." : "Loading report data..."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>Attendance Reports</CardTitle>
              <CardDescription>
                View attendance statistics for your institution {reportDateDescription}. Filter by report type, group, and then by student.
                The "Attendance Rate" is based on sessions where the student has at least one record or expected sessions.
              </CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isLoadingData || displayedStats.length === 0}
                  className="gap-1.5 text-sm"
                >
                  <Download className="size-3.5" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={handleExportToCSV}>
                  <FileText className="mr-2 h-4 w-4" />
                  Export to CSV
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={handleExportToHTML}>
                  <FileText className="mr-2 h-4 w-4" />
                  Export to HTML
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
                <Label htmlFor="report-type-filter">Report Type</Label>
                <Select 
                    value={reportType} 
                    onValueChange={(value) => {
                        setReportType(value as 'overall' | 'customRange');
                        if (value === 'overall') {
                            setCustomStartDate(null);
                            setCustomEndDate(null);
                        }
                    }}
                >
                    <SelectTrigger id="report-type-filter" className="w-full">
                    <SelectValue placeholder="Select report type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="overall">Overall Attendance</SelectItem>
                        <SelectItem value="customRange">Custom Date Range</SelectItem>
                    </SelectContent>
                </Select>
            </div>
            <div>
              <Label htmlFor="group-filter">Filter by Group</Label>
              <Select 
                value={selectedGroupId} 
                onValueChange={(value) => {
                  setSelectedGroupId(value);
                  setSelectedUserId('all'); 
                }}
                disabled={allGroups.length === 0}
              >
                <SelectTrigger id="group-filter" className="w-full">
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
                <SelectTrigger id="student-filter" className="w-full">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {selectedGroupId === 'all' ? 'All Students in Institution' : 
                     studentsForFilterDropdown.length > 0 ? 'All Students in Group' : 'No students in group'}
                  </SelectItem>
                  {studentsForFilterDropdown.map(student => (
                    <SelectItem key={student.id} value={student.id}>{student.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {reportType === 'customRange' && (
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-md bg-muted/50">
              <div>
                <Label htmlFor="customStartDate">Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="customStartDate"
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !customStartDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customStartDate ? format(customStartDate, "PPP") : <span>Pick a start date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customStartDate || undefined}
                      onSelect={(date) => setCustomStartDate(date || null)}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label htmlFor="customEndDate">End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      id="customEndDate"
                      variant={"outline"}
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !customEndDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {customEndDate ? format(customEndDate, "PPP") : <span>Pick an end date</span>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={customEndDate || undefined}
                      onSelect={(date) => setCustomEndDate(date || null)}
                      disabled={(date) => customStartDate && date < customStartDate}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Sessions w/ Record</TableHead>
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
                        ? 'No students found in the selected group for your institution.'
                        : 'No attendance data available for the current selection in your institution.'
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
            <CardDescription>
                Visual representation of student attendance for your institution based on current filters {reportDateDescription}.
            </CardDescription>
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
