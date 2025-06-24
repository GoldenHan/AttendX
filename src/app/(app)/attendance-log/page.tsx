
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
import type { AttendanceRecord, User, Group, Session, ClassScheduleConfiguration } from '@/types';
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, Timestamp, query, where, doc, writeBatch } from 'firebase/firestore';
import { Loader2, CalendarIcon, QrCode as QrCodeIcon } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import QRCode from 'qrcode.react';

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
  const { firestoreUser, classScheduleConfig, loading: authLoading } = useAuth();

  const [groups, setGroups] = useState<Group[]>([]);
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [qrCodeValue, setQrCodeValue] = useState<string | null>(null);
  
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  

  const form = useForm<AttendanceLogFormValues>({
    resolver: zodResolver(attendanceLogFormSchema),
    defaultValues: {
      groupId: '',
      sessionDate: new Date(),
      sessionTime: classScheduleConfig.startTime,
      attendances: [],
    },
  });

  useEffect(() => {
    if (classScheduleConfig.startTime) {
        form.setValue('sessionTime', classScheduleConfig.startTime);
    }
  }, [classScheduleConfig, form]);


  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'attendances',
    keyName: 'fieldId',
  });

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

  const watchedGroupId = form.watch('groupId');
  useEffect(() => {
    if (watchedGroupId && groups.length > 0 && allStudents.length > 0) {
      populateStudentsForGroup(watchedGroupId);
    }
  }, [watchedGroupId, groups, allStudents, populateStudentsForGroup]);

  useEffect(() => {
    const fetchData = async () => {
      if (!firestoreUser?.institutionId || authLoading) {
        setIsLoadingData(false);
        if(firestoreUser && !firestoreUser.institutionId) toast({ title: "Error", description: "Cannot load data without institution context.", variant: "destructive" });
        return;
      }
      setIsLoadingData(true);
      try {
        const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', firestoreUser.institutionId));
        const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', firestoreUser.institutionId));
       
        const [groupsSnapshot, studentsSnapshot] = await Promise.all([
            getDocs(groupsQuery),
            getDocs(studentsQuery),
        ]);
        
        setGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
        setAllStudents(studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));

        form.reset({
            groupId: '', 
            sessionDate: new Date(),
            sessionTime: classScheduleConfig.startTime || '09:00',
            attendances: [],
        });
        remove(); 

      } catch (error) {
        console.error("Error fetching data: ", error);
        toast({ title: 'Error fetching data', description: 'Could not load groups or students.', variant: 'destructive' });
        form.reset({
            groupId: '',
            sessionDate: new Date(),
            sessionTime: classScheduleConfig.startTime || '09:00',
            attendances: [],
        });
        remove();
      }
      setIsLoadingData(false);
    };
    fetchData();
  }, [toast, form, remove, firestoreUser, authLoading, classScheduleConfig]);

  const findOrCreateSession = useCallback(async (groupId: string, date: Date, time: string): Promise<string> => {
    if (!firestoreUser?.institutionId) {
        throw new Error("User institution not found. Cannot create session.");
    }
    const sessionDateStr = format(date, 'yyyy-MM-dd');
    const sessionsRef = collection(db, 'sessions');
    const q = query(sessionsRef, 
      where('classId', '==', groupId),
      where('date', '==', sessionDateStr),
      where('time', '==', time),
      where('institutionId', '==', firestoreUser.institutionId)
    );

    const querySnapshot = await getDocs(q);
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].id;
    } else {
      const selectedGroup = groups.find(g => g.id === groupId);
      const newSessionData: Omit<Session, 'id'> = {
        classId: groupId,
        date: sessionDateStr,
        time: time,
        institutionId: firestoreUser.institutionId,
        sedeId: selectedGroup?.sedeId || null,
      };
      const sessionDocRef = await addDoc(sessionsRef, newSessionData);
      return sessionDocRef.id;
    }
  }, [firestoreUser, groups]);
  
  const watchedSessionDate = form.watch('sessionDate');
  const watchedSessionTime = form.watch('sessionTime');
  
  useEffect(() => {
    const generateQrCodeForSession = async () => {
      if (watchedGroupId && watchedSessionDate && /^\d{2}:\d{2}$/.test(watchedSessionTime)) {
        setIsGeneratingQr(true);
        try {
          const sessionId = await findOrCreateSession(watchedGroupId, watchedSessionDate, watchedSessionTime);
          setQrCodeValue(sessionId);
        } catch (e) {
          console.error("Failed to generate session ID for QR code", e);
          setQrCodeValue(null);
          toast({ title: "Error", description: "Could not generate QR code for this session.", variant: "destructive" });
        } finally {
          setIsGeneratingQr(false);
        }
      } else {
        setQrCodeValue(null);
      }
    };
    generateQrCodeForSession();
  }, [watchedGroupId, watchedSessionDate, watchedSessionTime, findOrCreateSession, toast]);


  async function onSubmit(data: AttendanceLogFormValues) {
    if (!firestoreUser?.institutionId) {
      toast({ title: 'Error', description: 'Cannot log attendance without institution context.', variant: 'destructive' });
      return;
    }
    setIsSubmitting(true);
    try {
      const finalSessionId = await findOrCreateSession(data.groupId, data.sessionDate, data.sessionTime);
      
      const batch = writeBatch(db);
      const attendanceRecordsCollectionRef = collection(db, 'attendanceRecords');

      data.attendances.forEach(att => {
        const newRecordRef = doc(attendanceRecordsCollectionRef); 
        const record: Omit<AttendanceRecord, 'id'> = {
          userId: att.userId,
          sessionId: finalSessionId!,
          status: att.status,
          timestamp: new Date().toISOString(),
          institutionId: firestoreUser.institutionId,
        };
        if (att.status === 'absent' && att.observation) {
          record.observation = att.observation;
        }
        batch.set(newRecordRef, record);
      });

      await batch.commit();

      toast({
        title: 'Asistencia Registrada',
        description: `La asistencia para el grupo ha sido registrada exitosamente para la sesión ID: ${finalSessionId}.`,
      });
      form.reset({
        groupId: '',
        sessionDate: new Date(),
        sessionTime: classScheduleConfig.startTime || '09:00', 
        attendances: [],
      });
      remove(); 
    } catch (error) {
      console.error("Error logging attendance: ", error);
      toast({ title: 'Registro Fallido', description: 'No se pudieron guardar los registros de asistencia.', variant: 'destructive' });
    }
    setIsSubmitting(false);
  }
  
  if (authLoading || isLoadingData || !firestoreUser) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Registrar Asistencia de Grupo</CardTitle>
          <CardDescription>Registra la asistencia de los estudiantes para un grupo, fecha y hora específicos.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">{!firestoreUser ? "Verificando usuario..." : "Cargando datos..."}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar Asistencia de Grupo</CardTitle>
        <CardDescription>Selecciona un grupo, fecha y hora para generar un código QR para la sesión, o marca la asistencia manualmente abajo.
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
                    <FormLabel>Grupo</FormLabel>
                    <Select
                      onValueChange={(value) => {
                        field.onChange(value);
                      }}
                      value={field.value}
                      disabled={isLoadingData}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un grupo" />
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
                    <FormLabel>Fecha de la Sesión</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isLoadingData}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Elige una fecha</span>
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
                    <FormLabel>Hora de la Sesión (HH:MM)</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} disabled={isLoadingData} />
                    </FormControl>
                     <FormDescription>Ingresa la hora en formato de 24 horas (ej., 14:30). El valor predeterminado se basa en la Configuración de la Aplicación.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            { (qrCodeValue || isGeneratingQr) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><QrCodeIcon /> Código QR de la Sesión</CardTitle>
                  <CardDescription>Muestra este código a tus estudiantes para que lo escaneen. Es único para el grupo, fecha y hora seleccionados.</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-center p-6">
                  {isGeneratingQr ? (
                      <Loader2 className="h-10 w-10 animate-spin text-primary" />
                  ) : qrCodeValue ? (
                      <div className="bg-white p-4 rounded-lg shadow-md">
                        <QRCode value={qrCodeValue} size={256} />
                      </div>
                  ) : null}
                </CardContent>
              </Card>
            )}

            {fields.length > 0 && (
              <div className="space-y-6">
                <h3 className="text-lg font-medium">Registro de Asistencia Manual</h3>
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
                                  <FormLabel className="font-normal">Presente</FormLabel>
                                </FormItem>
                                <FormItem className="flex items-center space-x-1 space-y-0">
                                  <FormControl>
                                    <RadioGroupItem value="absent" />
                                  </FormControl>
                                  <FormLabel className="font-normal">Ausente</FormLabel>
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
                              <FormLabel className="sr-only">Observación</FormLabel>
                              <FormControl>
                                <Textarea
                                  placeholder="Motivo de la ausencia..."
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
                <Button type="submit" disabled={isSubmitting || isLoadingData || fields.length === 0}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Registrar Toda la Asistencia Manualmente
                </Button>
              </div>
            )}

            {fields.length === 0 && watchedGroupId && !isLoadingData && (
                <p className="text-muted-foreground">No se encontraron estudiantes en el grupo seleccionado o los datos del grupo aún se están cargando.</p>
            )}

          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
