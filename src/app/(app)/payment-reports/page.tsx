
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Download, FileText, Calendar as CalendarIcon, Receipt } from 'lucide-react';
import type { Payment, User, Group } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { DateRange } from 'react-day-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function PaymentReportsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth();

  const canViewPage = firestoreUser?.role === 'admin' || firestoreUser?.role === 'caja' || firestoreUser?.role === 'supervisor';

  const fetchData = useCallback(async () => {
    if (!firestoreUser?.institutionId || authLoading) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);

    try {
      const institutionId = firestoreUser.institutionId;
      const isSupervisor = firestoreUser.role === 'supervisor';
      const supervisorSedeId = isSupervisor ? firestoreUser.sedeId : null;

      // Fetch groups first to determine which students belong to the supervisor's sede if needed
      const groupsQuery = isSupervisor && supervisorSedeId
        ? query(collection(db, 'groups'), where('institutionId', '==', institutionId), where('sedeId', '==', supervisorSedeId))
        : query(collection(db, 'groups'), where('institutionId', '==', institutionId));
      
      const groupsSnapshot = await getDocs(groupsQuery);
      const fetchedGroups = groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setGroups(fetchedGroups);
      
      const studentIdsInScope = new Set<string>();
      if(isSupervisor && supervisorSedeId) {
         const studentsInSedeQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId), where('sedeId', '==', supervisorSedeId));
         const studentsInSedeSnapshot = await getDocs(studentsInSedeQuery);
         studentsInSedeSnapshot.forEach(doc => studentIdsInScope.add(doc.id));
      }

      // Fetch students
      const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId));
      const studentsSnapshot = await getDocs(studentsQuery);
      setStudents(studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
     
      // Fetch payments
      const paymentsCollection = collection(db, 'payments');
      let paymentsQuery;

      if (isSupervisor && supervisorSedeId) {
        // If we have students in scope, filter by them. Otherwise, there are no payments to fetch for this Sede.
        if (studentIdsInScope.size > 0) {
            paymentsQuery = query(paymentsCollection, where('institutionId', '==', institutionId), where('studentId', 'in', Array.from(studentIdsInScope)));
        } else {
            setPayments([]); // No students in this Sede, so no payments.
            setIsLoading(false);
            return;
        }
      } else {
        paymentsQuery = query(paymentsCollection, where('institutionId', '==', institutionId));
      }
      
      const paymentsSnapshot = await getDocs(paymentsQuery);
      setPayments(paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment)));

    } catch (error) {
      console.error("Error fetching payment reports data:", error);
      toast({ title: "Error", description: "Could not load data for reports.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [firestoreUser, authLoading, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredPayments = useMemo(() => {
    let result = payments;

    if (selectedGroupId !== 'all') {
      const group = groups.find(g => g.id === selectedGroupId);
      const studentIdsInGroup = group?.studentIds || [];
      result = result.filter(p => studentIdsInGroup.includes(p.studentId));
    }

    if (dateRange?.from) {
        const fromDate = dateRange.from;
        const toDate = dateRange.to || fromDate; // If no 'to' date, use 'from' as single day
        fromDate.setHours(0,0,0,0);
        toDate.setHours(23,59,59,999);
        
        result = result.filter(p => {
            const paymentDate = parseISO(p.paymentDate);
            return paymentDate >= fromDate && paymentDate <= toDate;
        });
    }

    return result.sort((a,b) => parseISO(b.paymentDate).getTime() - parseISO(a.paymentDate).getTime());
  }, [payments, selectedGroupId, dateRange, groups]);
  
  const totalAmount = useMemo(() => {
    return filteredPayments.reduce((sum, payment) => sum + payment.amount, 0);
  }, [filteredPayments]);
  
  const getFormattedDate = (isoString: string) => format(parseISO(isoString), 'PPP');
  
  const handleExport = (format: 'csv' | 'html') => {
    if (filteredPayments.length === 0) {
      toast({ title: 'No data to export', variant: 'default' });
      return;
    }
    const headers = ['Payment Date', 'Student Name', 'Concept', 'Amount', 'Recorded By'];
    let content = '';

    if (format === 'csv') {
      content = headers.join(',') + '\n';
      filteredPayments.forEach(p => {
        const row = [
          getFormattedDate(p.paymentDate),
          `"${p.studentName.replace(/"/g, '""')}"`,
          `"${p.concept.replace(/"/g, '""')}"`,
          p.amount.toFixed(2),
          `"${p.recordedByName.replace(/"/g, '""')}"`,
        ].join(',');
        content += row + '\n';
      });
    } else { // html
      content = `
        <!DOCTYPE html><html><head><title>Payment Report</title>
        <style>body{font-family:sans-serif;} table{border-collapse:collapse;width:100%;} th,td{border:1px solid #ddd;padding:8px;} th{background-color:#f2f2f2;}</style>
        </head><body>
        <h2>Payment Report</h2>
        <p>Filters: Group - ${groups.find(g => g.id === selectedGroupId)?.name || 'All'}, Date Range: ${dateRange?.from ? `${format(dateRange.from, "PPP")} to ${format(dateRange.to || dateRange.from, "PPP")}` : 'All Time'}</p>
        <p><strong>Total Amount: $${totalAmount.toFixed(2)}</strong></p>
        <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
        ${filteredPayments.map(p => `<tr>
            <td>${getFormattedDate(p.paymentDate)}</td>
            <td>${p.studentName}</td>
            <td>${p.concept}</td>
            <td>$${p.amount.toFixed(2)}</td>
            <td>${p.recordedByName}</td>
          </tr>`).join('')}
        </tbody></table></body></html>
      `;
    }
    
    const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'text/html' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `payment_report_${new Date().toISOString().split('T')[0]}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast({ title: 'Export Successful', description: `Report exported as ${format.toUpperCase()}.` });
  };


  if (isLoading || authLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /> <span className="ml-2">Loading financial data...</span></div>;
  }
  
  if (!canViewPage) {
    return <Card><CardHeader><CardTitle>Access Denied</CardTitle></CardHeader><CardContent><p>You do not have permission to view payment reports.</p></CardContent></Card>
  }
  
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                  <CardTitle className="flex items-center gap-2"><Receipt className="h-6 w-6 text-primary" /> Payment Reports</CardTitle>
                  <CardDescription>View, filter, and export payment records for your institution{firestoreUser?.role === 'supervisor' ? ' (Sede only)' : ''}.</CardDescription>
              </div>
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" disabled={isLoading || filteredPayments.length === 0} className="gap-1.5 text-sm">
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
                <Label htmlFor="group-filter">Filter by Group</Label>
                <Select value={selectedGroupId} onValueChange={setSelectedGroupId} disabled={groups.length === 0}>
                  <SelectTrigger id="group-filter">
                    <SelectValue placeholder="Select a group" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Groups {firestoreUser?.role === 'supervisor' ? '(in your Sede)' : ''}</SelectItem>
                    {groups.map(g => (<SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>))}
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
          
          <Card className="mb-6">
              <CardHeader>
                  <CardTitle className="text-lg">Report Summary</CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="text-2xl font-bold">${totalAmount.toFixed(2)}</div>
                  <p className="text-sm text-muted-foreground">Total amount from {filteredPayments.length} payments based on current filters.</p>
              </CardContent>
          </Card>
          
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Payment Date</TableHead>
                <TableHead>Student Name</TableHead>
                <TableHead>Concept</TableHead>
                <TableHead>Recorded By</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.length > 0 ? (
                filteredPayments.map(p => (
                  <TableRow key={p.id}>
                    <TableCell>{getFormattedDate(p.paymentDate)}</TableCell>
                    <TableCell className="font-medium">{p.studentName}</TableCell>
                    <TableCell>{p.concept}</TableCell>
                    <TableCell className="text-muted-foreground">{p.recordedByName}</TableCell>
                    <TableCell className="text-right font-semibold">${p.amount.toFixed(2)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow><TableCell colSpan={5} className="h-24 text-center">No payments found for the current filter selection.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
