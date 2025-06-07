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
import { mockUsers, mockClasses, mockSessions } from '@/lib/mock-data';
import type { AttendanceRecord } from '@/types';
import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

const attendanceFormSchema = z.object({
  userId: z.string().min(1, { message: 'Student selection is required.' }),
  classId: z.string().min(1, { message: 'Class selection is required.' }),
  sessionId: z.string().min(1, { message: 'Session selection is required.' }),
  status: z.enum(['present', 'absent', 'late'], { required_error: 'Status is required.' }),
});

type AttendanceFormValues = z.infer<typeof attendanceFormSchema>;

// This would typically be stored in a global state or database
let localAttendanceRecords: AttendanceRecord[] = [];

export default function AttendanceLogPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const qrSessionId = searchParams.get('session_id');
  const qrUserId = searchParams.get('user_id'); // Assuming QR might also encode user

  const [selectedClassId, setSelectedClassId] = useState<string | undefined>(qrSessionId ? mockSessions.find(s => s.id === qrSessionId)?.classId : undefined);

  const form = useForm<AttendanceFormValues>({
    resolver: zodResolver(attendanceFormSchema),
    defaultValues: {
      userId: qrUserId || '',
      classId: selectedClassId || '',
      sessionId: qrSessionId || '',
      status: 'present',
    },
  });
  
  useEffect(() => {
    if (qrSessionId) {
      const session = mockSessions.find(s => s.id === qrSessionId);
      if (session) {
        form.setValue('sessionId', qrSessionId);
        form.setValue('classId', session.classId);
        setSelectedClassId(session.classId);
        if(qrUserId) form.setValue('userId', qrUserId);

        toast({
          title: "QR Session Loaded",
          description: `Session ${qrSessionId} details pre-filled. Please select a student if not already selected.`,
        });
      }
    }
  }, [qrSessionId, qrUserId, form, toast]);


  function onSubmit(data: AttendanceFormValues) {
    const newRecord: AttendanceRecord = {
      id: `ar-${Date.now()}`, // simple unique ID
      ...data,
      timestamp: new Date().toISOString(),
    };
    localAttendanceRecords.push(newRecord);
    toast({
      title: 'Attendance Logged',
      description: (
        <pre className="mt-2 w-[340px] rounded-md bg-slate-950 p-4">
          <code className="text-white">{JSON.stringify(newRecord, null, 2)}</code>
        </pre>
      ),
    });
    form.reset({ userId: '', classId: '', sessionId: '', status: 'present' });
    setSelectedClassId(undefined);
  }

  const students = mockUsers.filter(u => u.role === 'student');
  const availableSessions = selectedClassId ? mockSessions.filter(s => s.classId === selectedClassId) : [];

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
                      form.setValue('sessionId', ''); // Reset session on class change
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
                      {mockClasses.map((c) => (
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
                    onValueChange={field.onChange} 
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
            <Button type="submit">Log Attendance</Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
