
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs, addDoc, query, where, orderBy, Timestamp } from 'firebase/firestore';
import type { User, Payment } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Search, UserCircle, Banknote, CalendarIcon } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const paymentFormSchema = z.object({
  amount: z.preprocess(
    (val) => Number(String(val).replace(/[^0-9.-]+/g, '')),
    z.number().positive({ message: 'El monto debe ser un número positivo.' })
  ),
  concept: z.string().min(3, { message: 'El concepto debe tener al menos 3 caracteres.' }).max(150),
  paymentDate: z.date({ required_error: 'La fecha de pago es requerida.' }),
});

type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export default function PaymentRegistrationPage() {
  const { firestoreUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [studentPayments, setStudentPayments] = useState<Payment[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const paymentForm = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      amount: 0,
      concept: '',
      paymentDate: new Date(),
    },
  });

  const canRegisterPayments = firestoreUser?.role === 'admin' || firestoreUser?.role === 'caja' || firestoreUser?.role === 'supervisor';

  const fetchStudents = useCallback(async () => {
    if (!firestoreUser?.institutionId || authLoading) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const studentsQuery = query(
        collection(db, 'users'),
        where('role', '==', 'student'),
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const studentsSnapshot = await getDocs(studentsQuery);
      setAllStudents(studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    } catch (error) {
      console.error("Error fetching students:", error);
      toast({ title: "Error", description: "Could not fetch student data.", variant: "destructive" });
    }
    setIsLoading(false);
  }, [firestoreUser?.institutionId, authLoading, toast]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);
  
  const fetchStudentPayments = useCallback(async (studentId: string) => {
     if (!firestoreUser?.institutionId) return;
     setIsLoadingPayments(true);
     try {
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('studentId', '==', studentId),
            where('institutionId', '==', firestoreUser.institutionId),
            orderBy('paymentDate', 'desc')
        );
        const paymentsSnapshot = await getDocs(paymentsQuery);
        setStudentPayments(paymentsSnapshot.docs.map(doc => ({id: doc.id, ...doc.data()} as Payment)));
     } catch(error) {
        console.error("Error fetching payments:", error);
        toast({ title: "Error", description: "Could not fetch payment history for this student.", variant: "destructive" });
     }
     setIsLoadingPayments(false);

  }, [firestoreUser?.institutionId, toast]);

  useEffect(() => {
    if (selectedStudent) {
        fetchStudentPayments(selectedStudent.id);
    } else {
        setStudentPayments([]);
    }
  }, [selectedStudent, fetchStudentPayments]);


  const filteredStudents = useMemo(() => {
    if (!searchTerm.trim()) return [];
    if (searchTerm.trim().length < 2) return [];
    return allStudents.filter(student =>
      student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (student.username && student.username.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [allStudents, searchTerm]);
  
  const handleSelectStudent = (student: User) => {
    setSelectedStudent(student);
    setSearchTerm(''); // Clear search after selection
  };
  
  const handlePaymentSubmit = async (data: PaymentFormValues) => {
    if (!selectedStudent || !firestoreUser) {
        toast({ title: "Error", description: "No student selected or user not logged in.", variant: "destructive"});
        return;
    }
    setIsSubmittingPayment(true);
    try {
        const newPayment: Omit<Payment, 'id'> = {
            studentId: selectedStudent.id,
            studentName: selectedStudent.name,
            amount: data.amount,
            concept: data.concept,
            paymentDate: data.paymentDate.toISOString(),
            createdAt: new Date().toISOString(),
            recordedByUid: firestoreUser.id,
            recordedByName: firestoreUser.name,
            institutionId: firestoreUser.institutionId,
        };
        await addDoc(collection(db, 'payments'), newPayment);
        toast({ title: "Payment Registered", description: `Payment of $${data.amount} for ${selectedStudent.name} was successfully registered.`});
        paymentForm.reset({ amount: 0, concept: '', paymentDate: new Date()});
        await fetchStudentPayments(selectedStudent.id); // Refresh payment history
    } catch(error) {
        console.error("Error registering payment:", error);
        toast({ title: "Error", description: "Could not register the payment.", variant: "destructive"});
    }
    setIsSubmittingPayment(false);
  };

  if (authLoading) {
    return <div className="flex justify-center items-center h-full"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  
  if (!canRegisterPayments) {
     return (
        <Card>
            <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
            <CardContent><p>You do not have the required role to register payments.</p></CardContent>
        </Card>
     );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Banknote className="h-6 w-6 text-primary" /> Payment Registration</CardTitle>
          <CardDescription>Search for a student to register a payment or view their payment history.</CardDescription>
        </CardHeader>
        <CardContent>
            <div className="max-w-md mx-auto space-y-4">
                <div>
                    <Label htmlFor="search-student">Search Student</Label>
                     <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="search-student"
                          type="search"
                          placeholder="Type student name or username..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-8 w-full"
                          disabled={isLoading}
                        />
                      </div>
                </div>
                 {searchTerm.length > 1 && (
                    <Card className="border-dashed">
                        <CardContent className="p-2 max-h-60 overflow-y-auto">
                            {isLoading ? (
                                <div className="text-center p-4 text-muted-foreground">Loading students...</div>
                            ) : filteredStudents.length > 0 ? (
                                filteredStudents.map(student => (
                                    <Button key={student.id} variant="ghost" className="w-full justify-start" onClick={() => handleSelectStudent(student)}>
                                        <UserCircle className="mr-2 h-4 w-4" />
                                        {student.name}
                                    </Button>
                                ))
                            ) : (
                                <div className="text-center p-4 text-muted-foreground">No students found matching "{searchTerm}".</div>
                            )}
                        </CardContent>
                    </Card>
                 )}
            </div>
        </CardContent>
      </Card>
      
      {selectedStudent && (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Register New Payment for: {selectedStudent.name}</CardTitle>
                    <CardDescription>Enter the payment details below and click save.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Form {...paymentForm}>
                        <form onSubmit={paymentForm.handleSubmit(handlePaymentSubmit)} className="space-y-6">
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <FormField control={paymentForm.control} name="amount" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Amount ($)</FormLabel>
                                        <FormControl><Input type="number" placeholder="0.00" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                 <FormField control={paymentForm.control} name="concept" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Concept</FormLabel>
                                        <FormControl><Input placeholder="e.g., Monthly Fee, Enrollment" {...field} /></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                                <FormField control={paymentForm.control} name="paymentDate" render={({ field }) => (
                                  <FormItem className="flex flex-col pt-2">
                                    <FormLabel>Payment Date</FormLabel>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <FormControl>
                                          <Button
                                            variant={"outline"}
                                            className={cn(
                                              "w-full pl-3 text-left font-normal",
                                              !field.value && "text-muted-foreground"
                                            )}
                                          >
                                            {field.value ? (
                                              format(field.value, "PPP")
                                            ) : (
                                              <span>Pick a date</span>
                                            )}
                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                          </Button>
                                        </FormControl>
                                      </PopoverTrigger>
                                      <PopoverContent className="w-auto p-0" align="start">
                                        <Calendar
                                          mode="single"
                                          selected={field.value}
                                          onSelect={field.onChange}
                                          initialFocus
                                        />
                                      </PopoverContent>
                                    </Popover>
                                    <FormMessage />
                                  </FormItem>
                                )}/>
                            </div>
                            <div className="flex justify-end">
                                <Button type="submit" disabled={isSubmittingPayment}>
                                    {isSubmittingPayment && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Save Payment
                                </Button>
                            </div>
                        </form>
                    </Form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Payment History for: {selectedStudent.name}</CardTitle>
                </CardHeader>
                <CardContent>
                    {isLoadingPayments ? (
                        <div className="flex items-center justify-center py-10"><Loader2 className="h-6 w-6 animate-spin"/></div>
                    ) : studentPayments.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Concept</TableHead>
                                    <TableHead>Recorded By</TableHead>
                                    <TableHead className="text-right">Amount</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {studentPayments.map(payment => (
                                    <TableRow key={payment.id}>
                                        <TableCell>{format(new Date(payment.paymentDate), 'PPP')}</TableCell>
                                        <TableCell>{payment.concept}</TableCell>
                                        <TableCell>{payment.recordedByName}</TableCell>
                                        <TableCell className="text-right font-medium">${payment.amount.toFixed(2)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                         <div className="text-center text-muted-foreground py-10">No payments have been recorded for this student.</div>
                    )}
                </CardContent>
                 <CardFooter>
                    <Button variant="link" onClick={() => setSelectedStudent(null)} className="text-sm">
                      Clear Selection & Search for Another Student
                    </Button>
                 </CardFooter>
            </Card>
        </>
      )}

    </div>
  );
}
