
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, UserCircle, ClipboardCheck, Search, Users, PlusCircle, Trash2, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, updateDoc, query, where } from 'firebase/firestore';
import type { User, PartialScores as PartialScoresType, ActivityScore as ActivityScoreType, ExamScore as ExamScoreType, Group as GroupType, GradingConfiguration, StudentGradeStructure } from '@/types';
import { useForm, useFieldArray, Controller, UseFieldArrayReturn } from 'react-hook-form';
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
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';

const MAX_ACCUMULATED_ACTIVITIES = 5; 
const DEBOUNCE_DELAY = 2500;

function debounce<F extends (...args: any[]) => void>(func: F, waitFor: number) {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<F>): void => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => func(...args), waitFor);
  };
  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  return debounced;
}

const parseOptionalFloat = (val: unknown): number | null | undefined => {
  if (val === "" || val === undefined || val === null) return null;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
};

const activityScoreSchema = (config: GradingConfiguration) => z.object({
  id: z.string().optional(),
  name: z.string().max(50, "Nombre de actividad demasiado largo").optional().nullable(),
  score: z.preprocess(
    parseOptionalFloat,
    z.number({invalid_type_error: "La calificación debe ser un número."}).min(0, "Mínimo 0").max(config.maxIndividualActivityScore, `Máximo ${config.maxIndividualActivityScore}`).optional().nullable()
  ),
});

const examScoreSchema = (config: GradingConfiguration) => z.object({
  name: z.string().max(50, "Nombre de examen demasiado largo").optional().nullable(),
  score: z.preprocess(
    parseOptionalFloat,
    z.number({invalid_type_error: "La calificación debe ser un número."}).min(0, "Mínimo 0").max(config.maxExamScore, `Máximo ${config.maxExamScore}`).optional().nullable()
  ),
});

const partialScoresObjectSchema = (config: GradingConfiguration) => z.object({
  accumulatedActivities: z.array(activityScoreSchema(config))
    .max(MAX_ACCUMULATED_ACTIVITIES, `No se pueden exceder ${MAX_ACCUMULATED_ACTIVITIES} actividades de acumulación.`),
  exam: examScoreSchema(config).nullable(),
}).superRefine((data, ctx) => {
    const totalAccumulated = data.accumulatedActivities.reduce((sum, act) => sum + (act.score || 0), 0);
    if (totalAccumulated > config.maxTotalAccumulatedScore) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `La suma de las calificaciones de las actividades de acumulación no puede exceder ${config.maxTotalAccumulatedScore}pts. Actualmente es ${totalAccumulated.toFixed(2)}pts.`,
        path: ['accumulatedActivities'],
      });
    }
});


const generateGradeEntryFormSchema = (config: GradingConfiguration) => {
    const partials: Record<string, any> = {};
    for (let i = 1; i <= config.numberOfPartials; i++) {
        partials[`partial${i}`] = partialScoresObjectSchema(config);
    }
    for (let i = config.numberOfPartials + 1; i <= 4; i++) {
        partials[`partial${i}`] = partialScoresObjectSchema(config).optional();
    }
    return z.object(partials);
};


type GradeEntryFormValues = {
    [key in `partial${1 | 2 | 3 | 4}`]?: z.infer<ReturnType<typeof partialScoresObjectSchema>>;
};


const getDefaultPartialData = (): z.infer<ReturnType<typeof partialScoresObjectSchema>> => ({
  accumulatedActivities: [],
  exam: { name: null, score: null },
});


export default function GradesManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { firestoreUser, gradingConfig, loading: authLoading } = useAuth(); // Get gradingConfig and authLoading from AuthContext

  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<GroupType[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [selectedGroupIdForFilter, setSelectedGroupIdForFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error_saving'>('idle');


  const currentFormSchema = useMemo(() => generateGradeEntryFormSchema(gradingConfig), [gradingConfig]);

  const gradeForm = useForm<GradeEntryFormValues>({
    resolver: zodResolver(currentFormSchema),
    defaultValues: {
      partial1: getDefaultPartialData(),
      partial2: getDefaultPartialData(),
      partial3: getDefaultPartialData(),
      partial4: getDefaultPartialData(),
    },
    mode: "onChange",
  });

  const { control, watch, setValue, handleSubmit, formState, getValues, reset } = gradeForm;

  const p1FieldArray = useFieldArray({ control, name: "partial1.accumulatedActivities" });
  const p2FieldArray = useFieldArray({ control, name: "partial2.accumulatedActivities" });
  const p3FieldArray = useFieldArray({ control, name: "partial3.accumulatedActivities" });
  const p4FieldArray = useFieldArray({ control, name: "partial4.accumulatedActivities" });

  const partialFieldArrays = [p1FieldArray, p2FieldArray, p3FieldArray, p4FieldArray];

  const fetchInitialData = useCallback(async () => {
    if (authLoading || !firestoreUser?.institutionId) {
        setIsLoadingData(false);
        return;
    }
    setIsLoadingData(true);
    try {
      const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', firestoreUser.institutionId));
      const studentsSnapshot = await getDocs(studentQuery);
      const studentList = studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));
      setAllStudents(studentList);

      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', firestoreUser.institutionId));
      const groupsSnapshot = await getDocs(groupsQuery);
      const fetchedGroups = groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as GroupType));
      setAllGroups(fetchedGroups);
      
      if (firestoreUser?.role === 'teacher') {
        const teacherGroups = fetchedGroups.filter(g => g.teacherId === firestoreUser.id);
        if (teacherGroups.length > 0) {
          setSelectedGroupIdForFilter(teacherGroups[0].id);
        } else {
          setSelectedGroupIdForFilter('none'); 
        }
      }


      const studentIdFromParams = searchParams.get('studentId');
      if (studentIdFromParams) {
        const preselectedStudent = studentList.find(s => s.id === studentIdFromParams);
        if (preselectedStudent) {
          if (firestoreUser?.role === 'teacher') {
            const teacherGroups = fetchedGroups.filter(g => g.teacherId === firestoreUser.id);
            const isStudentInTeacherGroup = teacherGroups.some(g => Array.isArray(g.studentIds) && g.studentIds.includes(preselectedStudent.id));
            if (isStudentInTeacherGroup) {
              setSelectedStudent(preselectedStudent);
            } else {
              toast({ title: 'Acceso Denegado', description: 'Solo puedes gestionar las calificaciones de los estudiantes de tus grupos asignados.', variant: 'destructive' });
              router.replace('/grades-management', { scroll: false });
            }
          } else { 
            setSelectedStudent(preselectedStudent);
          }
        } else {
          toast({ title: 'Error', description: 'Estudiante de URL no encontrado.', variant: 'destructive' });
          router.replace('/grades-management', { scroll: false });
        }
      }
    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast({ title: 'Error', description: 'No se pudieron cargar estudiantes o grupos.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  }, [searchParams, toast, router, authLoading, firestoreUser]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  const mapActivities = useCallback((activities: ActivityScoreType[] | undefined | null) =>
    activities?.map(a => ({...a, id: a.id || Math.random().toString(36).substr(2, 9)})) || [], []);

  const mapPartialToSave = useCallback((partialInput: GradeEntryFormValues['partial1'] | undefined): PartialScoresType => {
    const activities = partialInput?.accumulatedActivities?.map(act => ({
        id: act.id || Math.random().toString(36).substring(2,9),
        name: act.name ?? null,
        score: act.score ?? null,
    })) || [];

    let examToSave: ExamScoreType | null = null;
    if (partialInput?.exam) {
        examToSave = {
            name: partialInput.exam.name ?? null,
            score: partialInput.exam.score ?? null,
        };
    }
    return {
        accumulatedActivities: activities,
        exam: examToSave,
    };
  }, []);


  const debouncedSave = useCallback(
    debounce(async (currentData: GradeEntryFormValues, studentId: string) => {
      if (isSubmitting || authLoading) return;
      setAutoSaveStatus('saving');
      try {
        const studentRef = doc(db, "users", studentId);
        const gradesByLevel = selectedStudent?.gradesByLevel || {};
        const currentLevel = selectedStudent?.level || 'Other'; 
        
        if (!gradesByLevel[currentLevel]) {
          gradesByLevel[currentLevel] = {};
        }

        for (let i = 1; i <= gradingConfig.numberOfPartials; i++) {
            const partialKey = `partial${i}` as keyof GradeEntryFormValues;
            gradesByLevel[currentLevel][partialKey] = mapPartialToSave(currentData[partialKey]);
        }
        await updateDoc(studentRef, { gradesByLevel: gradesByLevel });
        setAutoSaveStatus('saved');
        setTimeout(() => setAutoSaveStatus('idle'), 3000);
      } catch (error) {
        console.error("Auto-save error:", error);
        setAutoSaveStatus('error_saving');
        toast({ title: "Error de Autoguardado", description: "No se pudieron guardar los cambios automáticamente.", variant: "destructive" });
        setTimeout(() => setAutoSaveStatus('idle'), 5000);
      }
    }, DEBOUNCE_DELAY),
    [isSubmitting, toast, gradingConfig, authLoading, mapPartialToSave, selectedStudent]
  );

  useEffect(() => {
    if (debouncedSave && typeof debouncedSave.cancel === 'function') {
        debouncedSave.cancel();
    }
    if (selectedStudent && gradingConfig) {
      const studentLevel = selectedStudent.level || 'Other';
      const studentGrades = selectedStudent.gradesByLevel?.[studentLevel] || {};
      
      const defaultValuesForForm: GradeEntryFormValues = {};
      for (let i = 1; i <= 4; i++) {
        const pKey = `partial${i}` as keyof GradeEntryFormValues;
        const studentPartialData = studentGrades[pKey];
        defaultValuesForForm[pKey] = {
            ...getDefaultPartialData(),
            ...studentPartialData,
            accumulatedActivities: mapActivities(studentPartialData?.accumulatedActivities),
        };
      }
      reset(defaultValuesForForm);
    } else {
      reset({
        partial1: getDefaultPartialData(),
        partial2: getDefaultPartialData(),
        partial3: getDefaultPartialData(),
        partial4: getDefaultPartialData(),
      });
    }
  }, [selectedStudent, reset, gradingConfig, debouncedSave, mapActivities]);

  const availableGroupsForFilter = useMemo(() => {
    if (firestoreUser?.role === 'teacher') {
      return allGroups.filter(g => g.teacherId === firestoreUser.id);
    }
    return allGroups; 
  }, [allGroups, firestoreUser]);

  const filteredStudentsList = useMemo(() => {
    let studentsToDisplay = allStudents;
    
    if (firestoreUser?.role === 'teacher') {
        const teacherGroupIds = availableGroupsForFilter.map(g => g.id);
        if (selectedGroupIdForFilter !== 'all' && !teacherGroupIds.includes(selectedGroupIdForFilter)) {
            return [];
        }
        const studentIdsInTeacherGroups = availableGroupsForFilter.reduce((acc, group) => {
            if (Array.isArray(group.studentIds)) {
                group.studentIds.forEach(id => acc.add(id));
            }
            return acc;
        }, new Set<string>());
        studentsToDisplay = studentsToDisplay.filter(student => studentIdsInTeacherGroups.has(student.id));
    }
    
    if (selectedGroupIdForFilter !== 'all' && selectedGroupIdForFilter !== 'none') {
      const group = allGroups.find(g => g.id === selectedGroupIdForFilter);
      if (group && Array.isArray(group.studentIds)) {
        studentsToDisplay = studentsToDisplay.filter(student => group.studentIds.includes(student.id));
      } else if (group) {
        studentsToDisplay = []; 
      }
    } else if (selectedGroupIdForFilter === 'none' && firestoreUser?.role === 'teacher') {
        return [];
    }


    if (searchTerm.trim() !== '') {
      studentsToDisplay = studentsToDisplay.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return studentsToDisplay;
  }, [allStudents, allGroups, selectedGroupIdForFilter, searchTerm, firestoreUser, availableGroupsForFilter]);

  const handleSelectStudentForGrading = useCallback((student: User) => {
    if (firestoreUser?.role === 'teacher') {
      const teacherGroups = allGroups.filter(g => g.teacherId === firestoreUser.id);
      const isStudentInTheirGroup = teacherGroups.some(g => Array.isArray(g.studentIds) && g.studentIds.includes(student.id));
      if (!isStudentInTheirGroup) {
        toast({ title: 'Acceso Denegado', description: 'Solo puedes gestionar las calificaciones de los estudiantes de tus grupos asignados.', variant: 'destructive' });
        return;
      }
    }
    setSelectedStudent(student);
    router.push(`/grades-management?studentId=${student.id}`, { scroll: false });
  }, [router, firestoreUser, allGroups, toast]);


  const watchedFormValues = watch();

  useEffect(() => {
    if (formState.isDirty && selectedStudent && !isSubmitting && !authLoading && debouncedSave) {
      const currentValues = getValues();
      debouncedSave(currentValues, selectedStudent.id);
    }
    return () => {
      if (debouncedSave && typeof debouncedSave.cancel === 'function') {
        debouncedSave.cancel();
      }
    };
  }, [watchedFormValues, selectedStudent, formState.isDirty, isSubmitting, debouncedSave, getValues, authLoading]);


  const onSubmitGrades = async (data: GradeEntryFormValues) => {
    if (!selectedStudent || authLoading) {
      toast({ title: "Error", description: authLoading ? "Configuración de calificación aún cargando." : "Ningún estudiante seleccionado.", variant: "destructive" });
      return;
    }
    if (firestoreUser?.role === 'teacher') {
      const teacherGroups = allGroups.filter(g => g.teacherId === firestoreUser.id);
      const isStudentInTheirGroup = teacherGroups.some(g => Array.isArray(g.studentIds) && g.studentIds.includes(selectedStudent.id));
      if (!isStudentInTheirGroup) {
        toast({ title: 'Acceso Denegado', description: 'Solo puedes guardar las calificaciones de los estudiantes de tus grupos asignados.', variant: 'destructive' });
        return;
      }
    }

    setIsSubmitting(true);
    if (debouncedSave && typeof debouncedSave.cancel === 'function') {
      debouncedSave.cancel();
    }
    setAutoSaveStatus('saving');
    try {
      const studentRef = doc(db, "users", selectedStudent.id);
      
      const gradesByLevel = selectedStudent.gradesByLevel || {};
      const currentLevel = selectedStudent.level || 'Other';
      
      if (!gradesByLevel[currentLevel]) {
          gradesByLevel[currentLevel] = {};
      }

      for (let i = 1; i <= gradingConfig.numberOfPartials; i++) {
          const partialKey = `partial${i}` as keyof GradeEntryFormValues;
          gradesByLevel[currentLevel][partialKey] = mapPartialToSave(data[partialKey]);
      }
      
      await updateDoc(studentRef, { gradesByLevel: gradesByLevel });

      toast({ title: "Calificaciones Actualizadas", description: `Calificaciones para ${selectedStudent.name} guardadas exitosamente.` });
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus('idle'), 3000);

      const updatedStudentDoc = await getDoc(studentRef);
      if(updatedStudentDoc.exists()){
        const updatedStudentData = { id: updatedStudentDoc.id, ...updatedStudentDoc.data() } as User;
        setSelectedStudent(updatedStudentData);
        setAllStudents(prev => prev.map(s => s.id === updatedStudentData.id ? updatedStudentData : s));
        reset(data); 
      }

    } catch (error: any) {
      toast({ title: "Fallo al Actualizar Calificaciones", description: `Ocurrió un error: ${error.message || 'Por favor, inténtalo de nuevo.'}`, variant: "destructive" });
      setAutoSaveStatus('error_saving');
      setTimeout(() => setAutoSaveStatus('idle'), 5000);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderGradeInputFieldsForPartial = (
    partialKey: "partial1" | "partial2" | "partial3" | "partial4",
    fieldArrayHelpers: UseFieldArrayReturn<GradeEntryFormValues, any, "id">
  ) => {
    const { fields, append, remove } = fieldArrayHelpers;
    const accumulatedActivitiesValues = watch(`${partialKey}.accumulatedActivities`);
    const currentTotalAccumulated = accumulatedActivitiesValues?.reduce((sum, act) => sum + (act.score || 0), 0) || 0;

    const examScoreValue = watch(`${partialKey}.exam.score`);
    const currentExamScore = typeof examScoreValue === 'number' ? examScoreValue : 0;
    const currentPartialTotal = currentTotalAccumulated + currentExamScore;

    const pointsRemainingForAccumulated = gradingConfig.maxTotalAccumulatedScore - currentTotalAccumulated;
    const fieldsDisabled = isSubmitting || !selectedStudent || authLoading;

    return (
      <div className="space-y-6 p-1">
        <div>
          <h4 className="text-md font-semibold mb-2 text-card-foreground">Actividades de Acumulación (Máx. {gradingConfig.maxTotalAccumulatedScore} pts total)</h4>
          {fields.map((field, index) => (
            <Card key={field.id} className="mb-3 p-3 shadow-sm">
              <div className="flex justify-between items-center mb-2">
                <FormLabel className="text-sm text-muted-foreground">Actividad {index + 1}</FormLabel>
                <Button type="button" variant="ghost" size="sm" onClick={() => remove(index)} disabled={fieldsDisabled} className="text-destructive hover:text-destructive-foreground hover:bg-destructive">
                  <Trash2 className="h-4 w-4 mr-1" /> Eliminar
                </Button>
              </div>
              <FormField
                control={control}
                name={`${partialKey}.accumulatedActivities.${index}.name`}
                render={({ field: nameField }) => (
                  <FormItem className="mb-2">
                    <FormLabel className="text-xs text-muted-foreground">Nombre de Actividad (Opcional)</FormLabel>
                    <FormControl>
                      <Input placeholder={`Ej: Tarea ${index + 1}`} {...nameField} value={nameField.value ?? ''} disabled={fieldsDisabled} />
                    </FormControl>
                    <FormMessage className="text-xs"/>
                  </FormItem>
                )}
              />
              <FormField
                control={control}
                name={`${partialKey}.accumulatedActivities.${index}.score`}
                render={({ field: scoreField }) => (
                  <FormItem>
                    <FormLabel className="text-xs text-muted-foreground">Calificación (Max {gradingConfig.maxIndividualActivityScore})</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder={`0-${gradingConfig.maxIndividualActivityScore}`} {...scoreField} value={scoreField.value === null ? '' : scoreField.value ?? ''} onChange={e => scoreField.onChange(parseOptionalFloat(e.target.value))} disabled={fieldsDisabled} />
                    </FormControl>
                    <FormMessage className="text-xs"/>
                  </FormItem>
                )}
              />
            </Card>
          ))}
          {fields.length < MAX_ACCUMULATED_ACTIVITIES && (
            <Button type="button" variant="outline" size="sm" onClick={() => append({ id: Math.random().toString(36).substr(2, 9), name: '', score: null })} disabled={fieldsDisabled || fields.length >= MAX_ACCUMULATED_ACTIVITIES}>
              <PlusCircle className="h-4 w-4 mr-1" /> Añadir Actividad de Acumulación
            </Button>
          )}
           {formState.errors[partialKey]?.accumulatedActivities && (
             <p className="text-sm font-medium text-destructive mt-1">
                {(formState.errors[partialKey]?.accumulatedActivities as any)?.message || (formState.errors[partialKey]?.accumulatedActivities as any)?.root?.message}
            </p>
           )}
          <div className="mt-3 text-sm text-muted-foreground">
            Total Acumulado Actual: <span className="font-bold">{currentTotalAccumulated.toFixed(2)} / {gradingConfig.maxTotalAccumulatedScore}</span><br/>
            (Puntos restantes para acumulado: {pointsRemainingForAccumulated.toFixed(2)})
          </div>
        </div>

        <div className="space-y-3 rounded-md border p-4 shadow-sm bg-card mt-4">
           <h4 className="text-md font-semibold text-card-foreground">Examen (Máx. {gradingConfig.maxExamScore} pts)</h4>
            <FormField
              control={control}
              name={`${partialKey}.exam.name`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">Nombre del Examen (Opcional)</FormLabel>
                  <FormControl>
                    <Input placeholder="Examen Parcial" {...field} value={field.value ?? 'Examen Parcial'} disabled={fieldsDisabled} />
                  </FormControl>
                  <FormMessage className="text-xs"/>
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name={`${partialKey}.exam.score`}
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-sm text-muted-foreground">Calificación del Examen (Max {gradingConfig.maxExamScore})</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder={`0-${gradingConfig.maxExamScore}`} {...field} value={field.value === null ? '' : field.value ?? ''} onChange={e => field.onChange(parseOptionalFloat(e.target.value))} disabled={fieldsDisabled} />
                  </FormControl>
                  <FormMessage className="text-xs"/>
                </FormItem>
              )}
            />
        </div>
        <div className={`mt-4 p-3 rounded-md text-center ${currentPartialTotal >= gradingConfig.passingGrade ? 'bg-green-100 dark:bg-green-800/50' : 'bg-red-100 dark:bg-red-800/50'}`}>
            <p className={`text-lg font-semibold ${currentPartialTotal >= gradingConfig.passingGrade ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                Nota Total del Parcial: {currentPartialTotal.toFixed(2)} / {gradingConfig.maxTotalAccumulatedScore + gradingConfig.maxExamScore}
            </p>
        </div>
      </div>
    );
  };

  const renderAutoSaveStatus = () => {
    if (isSubmitting && autoSaveStatus !== 'saving') return null; 
    switch (autoSaveStatus) {
      case 'saving':
        return <span className="text-xs text-muted-foreground ml-2 flex items-center"><Loader2 className="h-3 w-3 animate-spin mr-1" />Guardando automáticamente...</span>;
      case 'saved':
        return <span className="text-xs text-green-600 ml-2">Cambios guardados automáticamente.</span>;
      case 'error_saving':
        return <span className="text-xs text-red-600 ml-2">Error al autoguardar. Intentar guardado manual.</span>;
      default:
        if (selectedStudent && formState.isDirty) { 
             return <span className="text-xs text-muted-foreground ml-2">Cambios sin guardar...</span>;
        }
        return null;
    }
  };

  if (authLoading || (isLoadingData && !allStudents.length && !allGroups.length)) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-6 w-6 text-primary" /> Gestión de Calificaciones
                </CardTitle>
                 <CardDescription>
                    Cargando configuración y datos...
                </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Cargando datos iniciales...</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Gestión de Calificaciones
          </CardTitle>
          <CardDescription>
            {firestoreUser?.role === 'teacher'
              ? "Selecciona uno de tus grupos, luego un estudiante para editar sus calificaciones."
              : "Filtra estudiantes por grupo o busca por nombre. Selecciona un estudiante para editar sus calificaciones."}
            <br />
            Configuración Institucional: {gradingConfig.numberOfPartials} parciales, aprobación con {gradingConfig.passingGrade}pts.
            Máx. {MAX_ACCUMULATED_ACTIVITIES} actividades de acumulación (total {gradingConfig.maxTotalAccumulatedScore}pts) y 1 examen ({gradingConfig.maxExamScore}pts) por parcial.
            Nota parcial total {gradingConfig.maxTotalAccumulatedScore + gradingConfig.maxExamScore}pts.
          </CardDescription>
           {gradingConfig.numberOfPartials < 1 && (
            <div className="mt-2 p-3 border border-red-500/50 bg-red-50 dark:bg-red-900/30 rounded-md text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0"/>
                <p>La configuración de número de parciales es inválida ({gradingConfig.numberOfPartials}). Por favor, ajústala en "Configuración de la Aplicación". Se usará 1 parcial por defecto para la UI.</p>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
         <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="group-filter">Filtrar por Grupo</Label>
              <Select
                value={selectedGroupIdForFilter}
                onValueChange={(value) => {
                  setSelectedGroupIdForFilter(value);
                  setSelectedStudent(null); 
                  router.push('/grades-management', { scroll: false });
                }}
                disabled={isLoadingData || (firestoreUser?.role === 'teacher' && availableGroupsForFilter.length <= 1)}
              >
                <SelectTrigger id="group-filter">
                  <SelectValue placeholder="Todos los Grupos" />
                </SelectTrigger>
                <SelectContent>
                  {firestoreUser?.role !== 'teacher' && <SelectItem value="all">Todos los Grupos</SelectItem>}
                  {firestoreUser?.role === 'teacher' && availableGroupsForFilter.length === 0 && <SelectItem value="none" disabled>No tienes grupos asignados</SelectItem>}
                   {firestoreUser?.role === 'teacher' && availableGroupsForFilter.length > 1 && <SelectItem value="all">Todos Mis Grupos</SelectItem>}
                  {availableGroupsForFilter.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search-student">Buscar Estudiante por Nombre</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-student"
                  type="search"
                  placeholder="Ingresar nombre del estudiante..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setSelectedStudent(null);
                    router.push('/grades-management', { scroll: false });
                  }}
                  className="pl-8 w-full"
                  disabled={isLoadingData}
                />
              </div>
            </div>
          </div>

          {isLoadingData && (filteredStudentsList.length === 0 && (selectedGroupIdForFilter !== 'all' || searchTerm)) && (
             <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mr-2 inline-block" />Cargando estudiantes...</div>
          )}

          {!isLoadingData && filteredStudentsList.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Seleccionar un Estudiante</CardTitle>
                <CardDescription>Haz clic en un estudiante de la lista para gestionar sus calificaciones.</CardDescription>
              </CardHeader>
              <CardContent className="max-h-60 overflow-y-auto">
                <ul className="space-y-1">
                  {filteredStudentsList.map(student => (
                    <li key={student.id}>
                      <Button
                        variant={selectedStudent?.id === student.id ? "secondary" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => handleSelectStudentForGrading(student)}
                      >
                        <UserCircle className="mr-2 h-4 w-4" />
                        {student.name}
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {!isLoadingData && filteredStudentsList.length === 0 && (selectedGroupIdForFilter !== 'all' || searchTerm.trim() !== '') && (
            <p className="text-muted-foreground text-center py-6">
              No se encontraron estudiantes que coincidan con tus criterios de filtro/búsqueda.
            </p>
          )}
           {!isLoadingData && filteredStudentsList.length === 0 && selectedGroupIdForFilter === 'all' && searchTerm.trim() === '' && allStudents.length > 0 && firestoreUser?.role !== 'teacher' &&(
             <p className="text-muted-foreground text-center py-6">
              Todos los estudiantes están listados. Usa los filtros para acotar o selecciona de arriba si la lista es muy larga.
            </p>
           )}
            {!isLoadingData && availableGroupsForFilter.length === 0 && firestoreUser?.role === 'teacher' && (
               <p className="text-muted-foreground text-center py-6">
                 No tienes grupos asignados. No puedes gestionar calificaciones.
               </p>
            )}
           {!isLoadingData && allStudents.length === 0 && firestoreUser?.role !== 'teacher' && (
              <p className="text-muted-foreground text-center py-6">
                No hay estudiantes registrados en el sistema.
              </p>
           )}
        </CardContent>
      </Card>

      <Form {...gradeForm}>
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedStudent ? `Editando Calificaciones para: ${selectedStudent.name} (${selectedStudent.level || 'Nivel no especificado'})` : 'Selecciona un Estudiante para Editar Calificaciones'}
            </CardTitle>
             <CardDescription>
              {selectedStudent && !authLoading
                ? `Estás editando las calificaciones para el nivel actual del estudiante.`
                : authLoading ? 'Cargando configuración de calificación...' : 'Una vez que selecciones un estudiante, podrás editar sus calificaciones aquí.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmitGrades)} className="space-y-6">
              <Tabs defaultValue="partial1" className="w-full">
                <TabsList className={`grid w-full grid-cols-${Math.max(1, gradingConfig.numberOfPartials)}`}>
                  {Array.from({ length: Math.max(1, gradingConfig.numberOfPartials) }, (_, i) => i + 1).map((pNum) => (
                    <TabsTrigger key={`tab-trigger-p${pNum}`} value={`partial${pNum}`} disabled={!selectedStudent || isSubmitting || authLoading}>
                      Parcial {pNum}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {Array.from({ length: Math.max(1, gradingConfig.numberOfPartials) }, (_, i) => i + 1).map((pNum) => {
                  const partialKey = `partial${pNum}` as "partial1" | "partial2" | "partial3" | "partial4";
                  const fieldArrayHelper = partialFieldArrays[pNum-1];
                  if (!fieldArrayHelper) return null;
                  return (
                    <TabsContent key={`tab-content-p${pNum}`} value={partialKey} className="border-x border-b p-4 rounded-b-md">
                      {renderGradeInputFieldsForPartial(partialKey, fieldArrayHelper)}
                    </TabsContent>
                  );
                })}
              </Tabs>
              <div className="flex items-center">
                <Button type="submit" disabled={isSubmitting || !selectedStudent || !formState.isDirty || authLoading} className="sm:w-auto">
                    {(isSubmitting || authLoading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    <Save className="mr-2 h-4 w-4" />
                    {selectedStudent ? `Guardar Calificaciones para ${selectedStudent.name}` : 'Guardar Calificaciones'}
                </Button>
                {renderAutoSaveStatus()}
              </div>

              {!selectedStudent && !isLoadingData && !authLoading && (
                <p className="text-muted-foreground text-center py-6">
                  {firestoreUser?.role === 'teacher' && availableGroupsForFilter.length === 0 
                    ? "No tienes grupos asignados para gestionar calificaciones."
                    : "Por favor, selecciona un grupo y un estudiante usando los filtros de arriba para gestionar sus calificaciones."}
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </Form>
    </div>
  );
}
