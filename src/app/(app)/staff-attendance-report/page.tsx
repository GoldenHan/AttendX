
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
import { Loader2, Download, FileText, Calendar as CalendarIcon, ListChecks } from 'lucide-react';
import type { TeacherAttendanceRecord, User } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function StaffAttendanceReportPage() {
  const [records, setRecords] = useState<TeacherAttendanceRecord[]>([]);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedStaffId, setSelectedStaffId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth();
  
  const canViewPage = firestoreUser?.role === 'admin' || firestoreUser?.role === 'supervisor';

  const fetchData = useCallback(async () => {
    if (!firestoreUser?.institutionId || authLoading) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      const institutionId = firestoreUser.institutionId;
      
      const recordsQuery = query(collection(db, 'teacherAttendanceRecords'), where('institutionId', '==', institutionId));
      const recordsSnapshot = await getDocs(recordsQuery);
      let fetchedRecords = recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TeacherAttendanceRecord));

      const staffQuery = query(collection(db, 'users'), where('role', '!=', 'student'), where('institutionId', '==', institutionId));
      const staffSnapshot = await getDocs(staffQuery);
      let fetchedStaff = staffSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));

      // If user is a supervisor, filter both staff and records to their Sede
      if (firestoreUser.role === 'supervisor' && firestoreUser.sedeId) {
        const supervisorSedeId = firestoreUser.sedeId;
        const staffInSedeIds = new Set(fetchedStaff.filter(s => s.sedeId === supervisorSedeId).map(s => s.id));
        
        fetchedStaff = fetchedStaff.filter(s => staffInSedeIds.has(s.id));
        fetchedRecords = fetchedRecords.filter(r => staffInSedeIds.has(r.teacherId));
      }

      setRecords(fetchedRecords);
      setStaffUsers(fetchedStaff);

    } catch (error) {
      console.error("Error fetching staff attendance data:", error);
      toast({ title: "Error", description: "Could not load data for the report.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [firestoreUser, authLoading, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredRecords = useMemo(() => {
    let result = records;

    if (selectedStaffId !== 'all') {
      result = result.filter(r => r.teacherId === selectedStaffId);
    }

    if (dateRange?.from) {
        const fromDateStr = format(dateRange.from, 'yyyy-MM-dd');
        const toDateStr = format(dateRange.to || dateRange.from, 'yyyy-MM-dd');
        
        result = result.filter(r => {
            return r.date >= fromDateStr && r.date <= toDateStr;
        });
    }

    return result.sort((a, b) => parseISO(b.timestamp).getTime() - parseISO(a.timestamp).getTime());
  }, [records, selectedStaffId, dateRange]);

  const getFormattedDateTime = (isoString: string) => format(parseISO(isoString), 'PPP p');

  const handleExport = (formatType: 'csv' | 'html') => {
    if (filteredRecords.length === 0) {
      toast({ title: 'No data to export', variant: 'default' });
      return;
    }
    const headers = ['Staff Name', 'Timestamp', 'Attendance Code Used'];
    let content = '';

    if (formatType === 'csv') {
      content = headers.join(',') + '\n';
      filteredRecords.forEach(r => {
        const row = [
          `"${r.teacherName.replace(/"/g, '""')}"`,
          getFormattedDateTime(r.timestamp),
          r.attendanceCodeUsed,
        ].join(',');
        content += row + '\n';
      });
    } else { // html
      content = `
        <!DOCTYPE html><html><head><title>Staff Attendance Report</title>
        <style>body{font-family:sans-serif;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;} th{background-color:#f2f2f2;}</style>
        </head><body>
        <h2>Staff Attendance Report</h2>
        <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
        ${filteredRecords.map(r => `<tr>
            <td>${r.teacherName}</td>
            <td>${getFormattedDateTime(r.timestamp)}</td>
            <td>${r.attendanceCodeUsed}</td>
          </tr>`).join('')}
        </tbody></table></body></html>
      `;
    }
    
    const blob = new Blob([content], { type: formatType === 'csv' ? 'text/csv;charset=utf-8;' : 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `staff_attendance_report_${new Date().toISOString().split('T')[0]}.${formatType}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Export Successful', description: `Report exported as ${formatType.toUpperCase()}.` });
  };
  
  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading report data...</span></div>;
  }
  
  if (!canViewPage) {
    return <Card><CardHeader><CardTitle>Access Denied</CardTitle></CardHeader><CardContent><p>You do not have permission to view staff attendance reports.</p></CardContent></Card>
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                  <CardTitle className="flex items-center gap-2"><ListChecks className="h-6 w-6 text-primary" /> Staff Attendance Report</CardTitle>
                  <CardDescription>View, filter, and export staff arrival logs for your institution{firestoreUser?.role === 'supervisor' ? ' (Sede only)' : ''}.</CardDescription>
              </div>
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isLoading || filteredRecords.length === 0} className="gap-1.5 text-sm">
                          <Download className="size-3.5" /> Export
                      </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                      <DropdownMenuItem onSelect={() => handleExport('csv')}><FileText className="mr-2 h-4 w-4" /> Export to CSV</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => handleExport('html')}><FileText className="mr-2 h-4 w-4" /> Export to HTML</DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 border rounded-md bg-muted/50">
              <div>
                <Label htmlFor="staff-filter">Filter by Staff Member</Label>
                <Select value={selectedStaffId} onValueChange={setSelectedStaffId} disabled={staffUsers.length === 0}>
                  <SelectTrigger id="staff-filter">
                    <SelectValue placeholder="Select a staff member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Staff</SelectItem>
                    {staffUsers.map(s => (<SelectItem key={s.id} value={s.id}>{s.name} ({s.role})</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="date-range-picker">Filter by Date Range</Label>
                 <Popover>
                    <PopoverTrigger asChild>
                      <Button id="date" variant={"outline"} className={cn("w-full justify-start text-left font-normal",!dateRange && "text-muted-foreground")}>
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (dateRange.to ? (<>{format(dateRange.from, "LLL dd, y")} - {format(dateRange.to, "LLL dd, y")}</>) : (format(dateRange.from, "LLL dd, y"))) : (<span>Pick a date range</span>)}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar initialFocus mode="range" defaultMonth={dateRange?.from} selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
                    </PopoverContent>
                  </Popover>
              </div>
          </div>
          
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Staff Name</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Code Used</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.length > 0 ? (
                filteredRecords.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.teacherName}</TableCell>
                    <TableCell>{staffUsers.find(s => s.id === r.teacherId)?.role || 'N/A'}</TableCell>
                    <TableCell>{getFormattedDateTime(r.timestamp)}</TableCell>
                    <TableCell className="font-mono text-muted-foreground">{r.attendanceCodeUsed}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={4} className="h-24 text-center">No attendance logs found for the current filter selection.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
