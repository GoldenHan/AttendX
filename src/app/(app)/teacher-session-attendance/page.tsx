
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
import { Loader2, CalendarIcon, UserCheck } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';

const studentAttendanceSchema = z.object({
  userId: z.string(),
  name: z.string(), // For display purposes
  status: z.enum(['present', 'absent'], { required_error: 'Status is required.' }),
  observation: z.string().optional(),
}).refine(data => {
    if (data.status === 'present' && data.observation && data.observation.trim() !== '') {
        return false;
    }
    return true;
}, {
    message: "Observations are only for absent students.",
    path: ["observation"],
});


const teacherAttendanceFormSchema = z.object({
  groupId: z.string().min(1, { message: 'Group selection is required.' }),
  sessionDate: z.date({ required_error: 'Session date is required.' }),
  sessionTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'Invalid time format. Use HH:MM (e.g., 09:00 or 14:30).' }),
  attendances: z.array(studentAttendanceSchema),
});

type TeacherAttendanceFormValues = z.infer<typeof teacherAttendanceFormSchema>;

export default function TeacherSessionAttendancePage() {
  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth();
  
  const [availableGroups, setAvailableGroups] = useState<Group[]>([]); // Groups available for selection
  const [allStudents, setAllStudents] = useState<User[]>([]); 
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TeacherAttendanceFormValues>({
    resolver: zodResolver(teacherAttendanceFormSchema),
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
    const selectedGroup = availableGroups.find(g => g.id === groupId);
    if (selectedGroup && Array.isArray(selectedGroup.studentIds)) {
      const studentsInGroup = selectedGroup.studentIds.map(studentId => {
        const student = allStudents.find(s => s.id === studentId);
        return student ? { userId: student.id, name: student.name, status: 'present' as 'present' | 'absent', observation: '' } : null;
      }).filter(Boolean);
      
      studentsInGroup.forEach(studentData => {
        if (studentData) append(studentData);
      });
    }
  }, [availableGroups, allStudents, append, remove]);


  useEffect(() => {
    const fetchPrerequisites = async () => {
      if (!firestoreUser || authLoading) {
        setIsLoadingData(true);
        return;
      }
      setIsLoadingData(true);
      try {
        let groupsQuery;
        if (firestoreUser.role === 'admin') {
          groupsQuery = query(collection(db, 'groups')); // Admin sees all groups
        } else if (firestoreUser.role === 'teacher') {
          groupsQuery = query(collection(db, 'groups'), where('teacherId', '==', firestoreUser.id)); // Teacher sees their assigned groups
        } else {
          setAvailableGroups([]); // Other roles see no groups here
          setIsLoadingData(false);
          return;
        }

        const groupsSnapshot = await getDocs(groupsQuery);
        const fetchedGroups = groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group));
        setAvailableGroups(fetchedGroups);

        const studentsSnapshot = await getDocs(collection(db, 'students'));
        setAllStudents(studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));
        
        if (fetchedGroups.length === 1 && firestoreUser.role === 'teacher') {
          form.setValue('groupId', fetchedGroups[0].id);
        }

      } catch (error) {
        console.error("Error fetching groups or students: ", error);
        toast({ title: 'Error fetching data', description: 'Could not load groups or student list.', variant: 'destructive' });
      }
      setIsLoadingData(false);
    };
    fetchPrerequisites();
  }, [firestoreUser, authLoading, toast, form]);

  useEffect(() => {
    if (watchedGroupId && availableGroups.length > 0 && allStudents.length > 0) {
      populateStudentsForGroup(watchedGroupId);
    } else if (!watchedGroupId) {
      remove(); 
    }
  }, [watchedGroupId, availableGroups, allStudents, populateStudentsForGroup, remove]);


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
  
  async function onSubmit(data: TeacherAttendanceFormValues) {
    setIsSubmitting(true);
    try {
      const sessionId = await findOrCreateSession(data.groupId, data.sessionDate, data.sessionTime);
      
      const batch = writeBatch(db);
      const attendanceRecordsCollectionRef = collection(db, 'attendanceRecords');

      data.attendances.forEach(att => {
        const newRecordRef = doc(attendanceRecordsCollectionRef); 
        const record: Omit<AttendanceRecord, 'id'> = {
          userId: att.userId, 
          sessionId: sessionId,
          status: att.status,
          timestamp: Timestamp.fromDate(new Date(`${format(data.sessionDate, 'yyyy-MM-dd')}T${data.sessionTime}:00`)).toDate().toISOString(),
        };
        if (att.status === 'absent' && att.observation && att.observation.trim() !== '') {
          record.observation = att.observation.trim();
        }
        batch.set(newRecordRef, record);
      });

      await batch.commit();

      toast({
        title: 'Attendance Logged',
        description: `Attendance for group recorded successfully for session on ${format(data.sessionDate, 'PPP')} at ${data.sessionTime}.`,
      });
      form.setValue('attendances', []); 
      if (firestoreUser?.role === 'admin' || (firestoreUser?.role === 'teacher' && availableGroups.length > 1)) {
         form.setValue('groupId', ''); 
      }
      remove();

    } catch (error) {
      console.error("Error logging attendance: ", error);
      toast({ title: 'Logging Failed', description: 'Could not save attendance records.', variant: 'destructive' });
    }
    setIsSubmitting(false);
  }
  
  if (authLoading || (isLoadingData && !firestoreUser)) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserCheck className="h-6 w-6 text-primary" /> Session Attendance</CardTitle>
          <CardDescription>Take attendance for group sessions.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading user and group data...</p>
        </CardContent>
      </Card>
    );
  }

  if (!firestoreUser) {
     return (
      <Card>
        <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
        <CardContent><p>You must be logged in to access this page.</p></CardContent>
      </Card>
    );
  }
  
  if (!isLoadingData && firestoreUser.role !== 'admin' && firestoreUser.role !== 'teacher') {
    return (
      <Card>
        <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
        <CardContent><p>This page is for teachers and administrators only.</p></CardContent>
      </Card>
    );
  }
  
  if (!isLoadingData && availableGroups.length === 0 && firestoreUser.role === 'teacher') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserCheck className="h-6 w-6 text-primary" /> Session Attendance</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-4">You are not currently assigned to any groups. Please contact an administrator.</p>
        </CardContent>
      </Card>
    );
  }


  return (
    <Card>
      <CardHeader>
        <CardTitle  className="flex items-center gap-2"><UserCheck className="h-6 w-6 text-primary" /> Session Attendance</CardTitle>
        <CardDescription>
          {firestoreUser?.role === 'admin' ? 'Select any group to manage session attendance.' : 'Select your assigned group, session date and time, then mark student attendance.'}
        </CardDescription>
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
                    <FormLabel>{firestoreUser?.role === 'admin' ? 'Select Group (Admin View)' : 'Your Assigned Group'}</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                      value={field.value}
                      disabled={isLoadingData || availableGroups.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={firestoreUser?.role === 'admin' ? 'Select any group' : 'Select your group'} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableGroups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {availableGroups.length === 0 && !isLoadingData && <FormDescription>No groups available.</FormDescription>}
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
                          disabled={(date) => date > new Date() || date < new Date("2000-01-01")}
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
                    <FormLabel>Session Time</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormDescription>Use HH:MM format (e.g., 14:30).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {fields.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Student Attendance List</h3>
                {fields.map((item, index) => (
                  <Card key={item.fieldId} className="p-4 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate" title={form.getValues(`attendances.${index}.name`)}>{form.getValues(`attendances.${index}.name`)}</p>
                        <p className="text-xs text-muted-foreground">Student ID: {form.getValues(`attendances.${index}.userId`)}</p>
                      </div>
                      
                      <Controller
                        control={form.control}
                        name={`attendances.${index}.status`}
                        render={({ field: statusField }) => (
                          <FormItem className="space-y-1 md:pt-1">
                            <FormControl>
                              <RadioGroup
                                onValueChange={(value) => {
                                  statusField.onChange(value);
                                  if (value === 'present') {
                                    form.setValue(`attendances.${index}.observation`, '');
                                  }
                                }}
                                value={statusField.value}
                                className="flex space-x-3"
                              >
                                <FormItem className="flex items-center space-x-1.5 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="present" />
                                  </FormControl>
                                  <FormLabel className="font-normal cursor-pointer">Present</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-1.5 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="absent" />
                                  </FormControl>
                                  <FormLabel className="font-normal cursor-pointer">Absent</FormLabel>
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
                            <FormItem className="flex-1 md:min-w-[250px] min-w-full">
                              <FormLabel className="text-xs text-muted-foreground">Observation (if absent)</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Reason for absence..."
                                  {...obsField}
                                  rows={1}
                                  className="mt-1"
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
                <p className="text-muted-foreground py-4 text-center">No students found in the selected group, or student data is still loading for this group.</p>
            )}
             {fields.length === 0 && !watchedGroupId && !isLoadingData && (
                <p className="text-muted-foreground py-4 text-center">Please select a group to see the student list.</p>
            )}

            <Button type="submit" disabled={isSubmitting || isLoadingData || fields.length === 0 || !watchedGroupId}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save All Attendance
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}

