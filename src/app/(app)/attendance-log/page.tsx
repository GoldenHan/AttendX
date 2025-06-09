
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, Controller } from 'react-hook-form';
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
import type { AttendanceRecord, User, Group, Session } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, Timestamp, query, where, doc, writeBatch } from 'firebase/firestore';
import { Loader2, CalendarIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format, isValid } from 'date-fns';
import { cn } from '@/lib/utils';

const studentAttendanceSchema = z.object({
  userId: z.string(),
  name: z.string(),
  status: z.enum(['present', 'absent'], { required_error: 'Status is required.' }),
  observation: z.string().optional(),
});

const attendanceLogFormSchema = z.object({
  groupId: z.string().min(1, { message: 'Group selection is required.' }),
  sessionDate: z.date({ required_error: 'Session date is required.' }),
  sessionTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Invalid time format. Use HH:MM.' }),
  attendances: z.array(studentAttendanceSchema),
});

type AttendanceLogFormValues = z.infer<typeof attendanceLogFormSchema>;

export default function AttendanceLogPage() {
  const { toast } = useToast();
  const [groups, setGroups] = useState<Group[]>([]);
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AttendanceLogFormValues>({
    resolver: zodResolver(attendanceLogFormSchema),
    defaultValues: {
      groupId: '',
      sessionDate: new Date(),
      sessionTime: '09:00',
      attendances: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'attendances',
    keyName: 'fieldId',
  });

  const watchedGroupId = form.watch('groupId');

  const populateStudentsForGroup = useCallback((groupId: string) => {
    remove(); 
    const selectedGroup = groups.find(g => g.id === groupId);
    if (selectedGroup && Array.isArray(selectedGroup.studentIds)) {
      const studentsInGroup = selectedGroup.studentIds.map(studentId => {
        const student = allStudents.find(s => s.id === studentId);
        return student ? { userId: student.id, name: student.name, status: 'present' as 'present' | 'absent', observation: '' } : null;
      }).filter(Boolean);
      
      studentsInGroup.forEach(studentData => {
        if (studentData) append(studentData);
      });
    }
  }, [groups, allStudents, append, remove]);

  useEffect(() => {
    if (watchedGroupId && groups.length > 0 && allStudents.length > 0) {
      populateStudentsForGroup(watchedGroupId);
    }
  }, [watchedGroupId, groups, allStudents, populateStudentsForGroup]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const groupsSnapshot = await getDocs(collection(db, 'groups'));
        setGroups(groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group)));

        const studentsSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
        setAllStudents(studentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));

      } catch (error) {
        console.error("Error fetching data: ", error);
        toast({ title: 'Error fetching data', description: 'Could not load groups or students.', variant: 'destructive' });
      }
      setIsLoadingData(false);
    };
    fetchData();
  }, [toast]);

  const findOrCreateSession = async (groupId: string, date: Date, time: string): Promise<string> => {
    const sessionDateStr = format(date, 'yyyy-MM-dd');
    const sessionsRef = collection(db, 'sessions');
    const q = query(sessionsRef, 
      where('classId', '==', groupId),
      where('date', '==', sessionDateStr),
      where('time', '==', time)
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].id;
    } else {
      const newSessionData: Omit<Session, 'id'> = {
        classId: groupId,
        date: sessionDateStr,
        time: time,
      };
      const sessionDocRef = await addDoc(sessionsRef, newSessionData);
      return sessionDocRef.id;
    }
  };
  
  async function onSubmit(data: AttendanceLogFormValues) {
    setIsSubmitting(true);
    try {
      const sessionId = await findOrCreateSession(data.groupId, data.sessionDate, data.sessionTime);
      
      const batch = writeBatch(db);
      const attendanceRecordsCollectionRef = collection(db, 'attendanceRecords');

      data.attendances.forEach(att => {
        const newRecordRef = doc(attendanceRecordsCollectionRef); // Auto-generate ID
        const record: Omit<AttendanceRecord, 'id'> = {
          userId: att.userId,
          sessionId: sessionId,
          status: att.status,
          timestamp: Timestamp.now().toDate().toISOString(),
        };
        if (att.status === 'absent' && att.observation) {
          record.observation = att.observation;
        }
        batch.set(newRecordRef, record);
      });

      await batch.commit();

      toast({
        title: 'Attendance Logged',
        description: `Attendance for group recorded successfully for session ID: ${sessionId}.`,
      });
      form.reset({
        groupId: '',
        sessionDate: new Date(),
        sessionTime: '09:00',
        attendances: [],
      });
      remove(); 
    } catch (error) {
      console.error("Error logging attendance: ", error);
      toast({ title: 'Logging Failed', description: 'Could not save attendance records.', variant: 'destructive' });
    }
    setIsSubmitting(false);
  }
  
  if (isLoadingData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Log Group Attendance</CardTitle>
          <CardDescription>Record student attendance for a specific group, date, and time.</CardDescription>
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
        <CardTitle>Log Group Attendance</CardTitle>
        <CardDescription>Select a group, date, and time, then mark attendance for each student.</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
            <div className="grid md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="groupId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Group</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a group" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
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
                name="sessionDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Session Date</FormLabel>
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
                          disabled={(date) =>
                            date > new Date() || date < new Date("1900-01-01")
                          }
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sessionTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Session Time (HH:MM)</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                     <FormDescription>Enter time in 24-hour format (e.g., 14:30).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {fields.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Student Attendance</h3>
                {fields.map((item, index) => (
                  <Card key={item.fieldId} className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center gap-4">
                      <p className="font-medium flex-1">{form.getValues(`attendances.${index}.name`)}</p>
                      
                      <Controller
                        control={form.control}
                        name={`attendances.${index}.status`}
                        render={({ field: statusField }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <RadioGroup
                                onValueChange={(value) => {
                                  statusField.onChange(value);
                                  if (value !== 'absent') {
                                    form.setValue(`attendances.${index}.observation`, '');
                                  }
                                }}
                                value={statusField.value}
                                className="flex space-x-2"
                              >
                                <FormItem className="flex items-center space-x-1 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="present" />
                                  </FormControl>
                                  <FormLabel className="font-normal">Present</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-1 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="absent" />
                                  </FormControl>
                                  <FormLabel className="font-normal">Absent</FormLabel>
                                </FormItem>
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      {form.watch(`attendances.${index}.status`) === 'absent' && (
                        <Controller
                          control={form.control}
                          name={`attendances.${index}.observation`}
                          render={({ field: obsField }) => (
                            <FormItem className="flex-1 min-w-[200px]">
                              <FormLabel className="sr-only">Observation</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Reason for absence..."
                                  {...obsField}
                                  rows={1}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {fields.length === 0 && watchedGroupId && !isLoadingData && (
                <p className="text-muted-foreground">No students found in the selected group or group data is still loading.</p>
            )}


            <Button type="submit" disabled={isSubmitting || isLoadingData || fields.length === 0}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Log All Attendance
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

