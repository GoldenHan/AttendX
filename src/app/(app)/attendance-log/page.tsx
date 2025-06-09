
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import type { AttendanceRecord, User, ClassInfo, Session } from '@/types';
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, Timestamp, query, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

const attendanceFormSchema = z.object({
  userId: z.string().min(1, { message: 'Student selection is required.' }),
  classId: z.string().min(1, { message: 'Class selection is required.' }),
  sessionId: z.string().min(1, { message: 'Session selection is required.' }),
  status: z.enum(['present', 'absent', 'late'], { required_error: 'Status is required.' }),
  observation: z.string().optional(),
});

type AttendanceFormValues = z.infer<typeof attendanceFormSchema>;

export default function AttendanceLogPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const qrSessionId = searchParams.get('session_id');
  const qrUserId = searchParams.get('user_id');

  const [students, setStudents] = useState<User[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedClassId, setSelectedClassId] = useState<string | undefined>(undefined);

  const form = useForm<AttendanceFormValues>({
    resolver: zodResolver(attendanceFormSchema),
    defaultValues: {
      userId: '',
      classId: '',
      sessionId: '',
      status: 'present',
      observation: '',
    },
  });

  const watchedStatus = form.watch('status');

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        setStudents(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)).filter(u => u.role === 'student'));

        const classesSnapshot = await getDocs(collection(db, 'classes'));
        const fetchedClasses = classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClassInfo));
        setClasses(fetchedClasses);
        
        const sessionsSnapshot = await getDocs(collection(db, 'sessions'));
        const fetchedSessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session));
        setSessions(fetchedSessions);

        if (qrSessionId) {
          const session = fetchedSessions.find(s => s.id === qrSessionId);
          if (session) {
            form.setValue('sessionId', qrSessionId);
            form.setValue('classId', session.classId);
            setSelectedClassId(session.classId);
            if (qrUserId) form.setValue('userId', qrUserId);
            toast({
              title: "QR Session Loaded",
              description: `Session ${session.id} details pre-filled.`,
            });
          }
        }

      } catch (error) {
        console.error("Error fetching data: ", error);
        toast({ title: 'Error fetching data', description: 'Could not load students, classes, or sessions.', variant: 'destructive' });
      }
      setIsLoadingData(false);
    };
    fetchData();
  }, [form, toast, qrSessionId, qrUserId]);
  
  async function onSubmit(data: AttendanceFormValues) {
    setIsSubmitting(true);
    try {
      const newRecord: Omit<AttendanceRecord, 'id'> = {
        userId: data.userId,
        classId: data.classId, // Although not directly on AttendanceRecord, often useful context for queries
        sessionId: data.sessionId,
        status: data.status,
        timestamp: Timestamp.now().toDate().toISOString(),
      };
      if (data.status === 'absent' && data.observation) {
        newRecord.observation = data.observation;
      }

      const docRef = await addDoc(collection(db, 'attendanceRecords'), newRecord);
      toast({
        title: 'Attendance Logged',
        description: `Record ID: ${docRef.id} successfully saved.`,
      });
      form.reset({ userId: '', classId: '', sessionId: '', status: 'present', observation: '' });
      setSelectedClassId(undefined);
    } catch (error) {
      console.error("Error adding document: ", error);
      toast({ title: 'Logging Failed', description: 'Could not save attendance record.', variant: 'destructive' });
    }
    setIsSubmitting(false);
  }

  const availableSessions = selectedClassId ? sessions.filter(s => s.classId === selectedClassId) : [];

  if (isLoadingData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Log Attendance</CardTitle>
          <CardDescription>Record student attendance for classes and sessions.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log Attendance</CardTitle>
        <CardDescription>Record student attendance for classes and sessions.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <FormField
              control={form.control}
              name="classId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Class</FormLabel>
                  <Select
                    onValueChange={(value) => {
                      field.onChange(value);
                      setSelectedClassId(value);
                      form.setValue('sessionId', ''); 
                    }}
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a class" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {classes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sessionId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Session</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    value={field.value}
                    disabled={!selectedClassId}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a session" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableSessions.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.date} - {s.time}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Select class first to see available sessions.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="userId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Student</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a student" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {students.map((student) => (
                        <SelectItem key={student.id} value={student.id}>
                          {student.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select 
                    onValueChange={(value) => {
                      field.onChange(value);
                      if (value !== 'absent') {
                        form.setValue('observation', ''); // Clear observation if not absent
                      }
                    }} 
                    defaultValue={field.value}
                    value={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="present">Present</SelectItem>
                      <SelectItem value="absent">Absent</SelectItem>
                      <SelectItem value="late">Late</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {watchedStatus === 'absent' && (
              <FormField
                control={form.control}
                name="observation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observation / Justification for Absence</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter reason for absence..."
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <Button type="submit" disabled={isSubmitting || isLoadingData}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Log Attendance
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
