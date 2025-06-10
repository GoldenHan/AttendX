
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, UserCircle, ClipboardCheck, Search, Users, PlusCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, updateDoc, query, where } from 'firebase/firestore';
import type { User, PartialScores, ActivityScore, ExamScore } from '@/types';
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

const MAX_ACCUMULATED_ACTIVITIES = 5;
const MAX_ACCUMULATED_TOTAL_SCORE = 50;
const MAX_EXAM_SCORE = 50;
const MAX_INDIVIDUAL_ACTIVITY_SCORE = 50; // Or whatever individual max is desired, total sum is validated separately

const parseOptionalFloat = (val: unknown): number | null | undefined => {
  if (val === "" || val === undefined || val === null) return null;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
};

const activityScoreSchema = z.object({
  name: z.string().optional().nullable(),
  score: z.preprocess(
    parseOptionalFloat,
    z.number().min(0, "Min 0").max(MAX_INDIVIDUAL_ACTIVITY_SCORE, `Max ${MAX_INDIVIDUAL_ACTIVITY_SCORE}`).optional().nullable()
  ),
});

const examScoreSchema = z.object({
  name: z.string().optional().nullable(),
  score: z.preprocess(
    parseOptionalFloat,
    z.number().min(0, "Min 0").max(MAX_EXAM_SCORE, `Max ${MAX_EXAM_SCORE}`).optional().nullable()
  ),
});

const partialScoresObjectSchema = z.object({
  accumulatedActivities: z.array(activityScoreSchema)
    .max(MAX_ACCUMULATED_ACTIVITIES, `Cannot exceed ${MAX_ACCUMULATED_ACTIVITIES} accumulated activities.`)
    .refine(activities => {
      const total = activities.reduce((sum, act) => sum + (act.score || 0), 0);
      return total <= MAX_ACCUMULATED_TOTAL_SCORE;
    }, {
      message: `Total score for accumulated activities cannot exceed ${MAX_ACCUMULATED_TOTAL_SCORE}.`,
      path: ['root'], 
    }),
  exam: examScoreSchema.nullable(),
});

const gradeEntryFormSchema = z.object({
  partial1: partialScoresObjectSchema,
  partial2: partialScoresObjectSchema,
  partial3: partialScoresObjectSchema,
});

type GradeEntryFormValues = z.infer<typeof gradeEntryFormSchema>;

const getDefaultPartialData = (): PartialScores => ({
  accumulatedActivities: [],
  exam: { name: 'Examen', score: null },
});

export default function GradesManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [selectedGroupIdForFilter, setSelectedGroupIdForFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const gradeForm = useForm<GradeEntryFormValues>({
    resolver: zodResolver(gradeEntryFormSchema),
    defaultValues: {
      partial1: getDefaultPartialData(),
      partial2: getDefaultPartialData(),
      partial3: getDefaultPartialData(),
    },
    mode: "onChange", // or "onBlur" for validation feedback
  });

  const { control, watch, setValue, handleSubmit, formState: { errors } } = gradeForm;

  // Call useFieldArray at the top level for each partial
  const p1FieldArray = useFieldArray({ control, name: "partial1.accumulatedActivities" });
  const p2FieldArray = useFieldArray({ control, name: "partial2.accumulatedActivities" });
  const p3FieldArray = useFieldArray({ control, name: "partial3.accumulatedActivities" });


  const fetchInitialData = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'));
      const studentsSnapshot = await getDocs(studentQuery);
      const studentList = studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));
      setAllStudents(studentList);

      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setAllGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));

      const studentIdFromParams = searchParams.get('studentId');
      if (studentIdFromParams) {
        const preselectedStudent = studentList.find(s => s.id === studentIdFromParams);
        if (preselectedStudent) {
          handleSelectStudentForGrading(preselectedStudent, false);
        } else {
          toast({ title: 'Error', description: 'Student from URL not found.', variant: 'destructive' });
        }
      }
    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast({ title: 'Error', description: 'Could not load students or groups.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  }, [searchParams, toast]); // handleSelectStudentForGrading removed from deps as it will be defined below

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  const filteredStudentsList = useMemo(() => {
    let studentsToDisplay = allStudents;

    if (selectedGroupIdForFilter !== 'all') {
      const group = allGroups.find(g => g.id === selectedGroupIdForFilter);
      if (group && Array.isArray(group.studentIds)) {
        studentsToDisplay = studentsToDisplay.filter(student => group.studentIds.includes(student.id));
      } else if (group) { // Group selected but has no studentIds array (should not happen with current types)
        studentsToDisplay = [];
      }
    }

    if (searchTerm.trim() !== '') {
      studentsToDisplay = studentsToDisplay.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return studentsToDisplay;
  }, [allStudents, allGroups, selectedGroupIdForFilter, searchTerm]);

  const handleSelectStudentForGrading = useCallback((student: User, updateUrl: boolean = true) => {
    setSelectedStudent(student);
    const studentGrades = student.grades;
    gradeForm.reset({
      partial1: { ...getDefaultPartialData(), ...studentGrades?.partial1, accumulatedActivities: studentGrades?.partial1?.accumulatedActivities || [] },
      partial2: { ...getDefaultPartialData(), ...studentGrades?.partial2, accumulatedActivities: studentGrades?.partial2?.accumulatedActivities || [] },
      partial3: { ...getDefaultPartialData(), ...studentGrades?.partial3, accumulatedActivities: studentGrades?.partial3?.accumulatedActivities || [] },
    });
    if (updateUrl) {
      router.push(`/grades-management?studentId=${student.id}`, { scroll: false });
    }
  }, [gradeForm, router]);


  useEffect(() => { // Effect to reset form if student is deselected or filters change
    if (!selectedStudent && !searchParams.get('studentId')) {
      gradeForm.reset({
        partial1: getDefaultPartialData(),
        partial2: getDefaultPartialData(),
        partial3: getDefaultPartialData(),
      });
    }
  }, [selectedStudent, searchParams, gradeForm]);

  const onSubmitGrades = async (data: GradeEntryFormValues) => {
    if (!selectedStudent) { 
      toast({ title: "Error", description: "No student selected.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const studentRef = doc(db, "users", selectedStudent.id);
      const gradesToSave = {
        partial1: data.partial1 || getDefaultPartialData(),
        partial2: data.partial2 || getDefaultPartialData(),
        partial3: data.partial3 || getDefaultPartialData(),
      };
      await updateDoc(studentRef, { grades: gradesToSave });
      
      toast({ title: "Grades Updated", description: `Grades for ${selectedStudent.name} saved successfully.` });
      
      const updatedStudentDoc = await getDoc(studentRef);
      if(updatedStudentDoc.exists()){
        const updatedStudentData = { id: updatedStudentDoc.id, ...updatedStudentDoc.data() } as User;
        setSelectedStudent(updatedStudentData); 
        setAllStudents(prev => prev.map(s => s.id === updatedStudentData.id ? updatedStudentData : s));
      }

    } catch (error: any) {
      toast({ title: "Grade Update Failed", description: `An error occurred: ${error.message || 'Please try again.'}`, variant: "destructive" });
      console.error("Grade update error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderGradeInputFieldsForPartial = (
    partialKey: "partial1" | "partial2" | "partial3",
    fieldArrayResult: UseFieldArrayReturn<GradeEntryFormValues, `partial1.accumulatedActivities` | `partial2.accumulatedActivities` | `partial3.accumulatedActivities`, "id">
  ) => {
    const { fields, append, remove } = fieldArrayResult;

    const accumulatedActivitiesValues = watch(`${partialKey}.accumulatedActivities`);
    const currentTotalAccumulated = accumulatedActivitiesValues?.reduce((sum, act) => sum + (act.score || 0), 0) || 0;
    const examScoreValue = watch(`${partialKey}.exam.score`) || 0;
    const currentPartialTotal = currentTotalAccumulated + examScoreValue;
    const pointsRemainingForAccumulated = MAX_ACCUMULATED_TOTAL_SCORE - currentTotalAccumulated;
    
    const fieldsDisabled = isSubmitting || !selectedStudent;

    return (
      <div className="space-y-6 p-1">
        <div>
          <h4 className="text-md font-semibold mb-2 text-card-foreground">Actividades de Acumulación (Máx. {MAX_ACCUMULATED_TOTAL_SCORE} pts total)</h4>
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
                    <FormLabel className="text-xs text-muted-foreground">Calificación (Max {MAX_INDIVIDUAL_ACTIVITY_SCORE})</FormLabel>
                    <FormControl>
                      <Input type="number" placeholder={`0-${MAX_INDIVIDUAL_ACTIVITY_SCORE}`} {...scoreField} value={scoreField.value === null ? '' : scoreField.value ?? ''} onChange={e => scoreField.onChange(parseOptionalFloat(e.target.value))} disabled={fieldsDisabled} />
                    </FormControl>
                    <FormMessage className="text-xs"/>
                  </FormItem>
                )}
              />
            </Card>
          ))}
          {fields.length < MAX_ACCUMULATED_ACTIVITIES && (
            <Button type="button" variant="outline" size="sm" onClick={() => append({ name: '', score: null })} disabled={fieldsDisabled || fields.length >= MAX_ACCUMULATED_ACTIVITIES}>
              <PlusCircle className="h-4 w-4 mr-1" /> Añadir Actividad de Acumulación
            </Button>
          )}
           {errors[partialKey]?.accumulatedActivities?.root && (
             <p className="text-sm font-medium text-destructive mt-1">
                {errors[partialKey]?.accumulatedActivities?.root?.message}
            </p>
           )}
          <div className="mt-3 text-sm text-muted-foreground">
            Total Acumulado Actual: <span className="font-bold">{currentTotalAccumulated.toFixed(2)} / {MAX_ACCUMULATED_TOTAL_SCORE}</span><br/>
            (Puntos restantes para acumulado: {pointsRemainingForAccumulated.toFixed(2)})
          </div>
        </div>
        
        <div className="space-y-3 rounded-md border p-4 shadow-sm bg-card mt-4">
           <h4 className="text-md font-semibold text-card-foreground">Examen (Máx. {MAX_EXAM_SCORE} pts)</h4>
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
                  <FormLabel className="text-sm text-muted-foreground">Calificación del Examen (Max {MAX_EXAM_SCORE})</FormLabel>
                  <FormControl>
                    <Input type="number" step="0.1" placeholder={`0-${MAX_EXAM_SCORE}`} {...field} value={field.value === null ? '' : field.value ?? ''} onChange={e => field.onChange(parseOptionalFloat(e.target.value))} disabled={fieldsDisabled} />
                  </FormControl>
                  <FormMessage className="text-xs"/>
                </FormItem>
              )}
            />
        </div>
        <div className="mt-4 p-3 bg-secondary/30 rounded-md text-center">
            <p className="text-lg font-semibold text-secondary-foreground">Nota Total del Parcial: {currentPartialTotal.toFixed(2)} / 100</p>
        </div>
      </div>
    );
  };

  if (isLoadingData && !allStudents.length && !allGroups.length) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="h-6 w-6 text-primary" /> Grades Management
                </CardTitle>
                 <CardDescription>
                    Máximo {MAX_ACCUMULATED_ACTIVITIES} actividades de acumulación (total {MAX_ACCUMULATED_TOTAL_SCORE}pts) y 1 examen ({MAX_EXAM_SCORE}pts) por parcial. Nota parcial total 100pts. Aprobación con 70pts.
                </CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-2">Loading initial data...</p>
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
            Grades Management
          </CardTitle>
          <CardDescription>
            Filtra estudiantes por grupo o busca por nombre. Selecciona un estudiante para editar sus calificaciones.
            Máximo {MAX_ACCUMULATED_ACTIVITIES} actividades de acumulación (total {MAX_ACCUMULATED_TOTAL_SCORE}pts) y 1 examen ({MAX_EXAM_SCORE}pts) por parcial. Nota parcial total 100pts. Aprobación con 70pts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
         <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="group-filter">Filter by Group</Label>
              <Select
                value={selectedGroupIdForFilter}
                onValueChange={(value) => {
                  setSelectedGroupIdForFilter(value);
                  setSelectedStudent(null); 
                  router.push('/grades-management', { scroll: false }); 
                }}
                disabled={isLoadingData}
              >
                <SelectTrigger id="group-filter">
                  <SelectValue placeholder="All Groups" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {allGroups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="search-student">Search Student by Name</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-student"
                  type="search"
                  placeholder="Enter student name..."
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
             <div className="text-center py-4"><Loader2 className="h-5 w-5 animate-spin mr-2 inline-block" />Loading students...</div>
          )}

          {!isLoadingData && filteredStudentsList.length > 0 && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-lg">Select a Student</CardTitle>
                <CardDescription>Click on a student from the list below to manage their grades.</CardDescription>
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
              No students found matching your filter/search criteria.
            </p>
          )}
           {!isLoadingData && filteredStudentsList.length === 0 && selectedGroupIdForFilter === 'all' && searchTerm.trim() === '' && allStudents.length > 0 &&(
             <p className="text-muted-foreground text-center py-6">
              All students are listed. Use filters to narrow down or select from above if list is too long.
            </p>
           )}
        </CardContent>
      </Card>

      <Form {...gradeForm}>
        <Card>
          <CardHeader>
            <CardTitle>
              {selectedStudent ? `Editing Grades for: ${selectedStudent.name}` : 'Select a Student to Edit Grades'}
            </CardTitle>
            <CardDescription>
              {selectedStudent 
                ? `Ingresa nombres de actividades (opcional) y calificaciones. Máx. ${MAX_ACCUMULATED_ACTIVITIES} actividades acumuladas (total ${MAX_ACCUMULATED_TOTAL_SCORE}pts), examen ${MAX_EXAM_SCORE}pts. Nota parcial total 100pts. Aprobación con 70pts.`
                : 'Una vez que selecciones un estudiante, podrás editar sus calificaciones aquí.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmitGrades)} className="space-y-6">
              <Tabs defaultValue="partial1" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="partial1" disabled={!selectedStudent || isSubmitting}>1er Parcial</TabsTrigger>
                  <TabsTrigger value="partial2" disabled={!selectedStudent || isSubmitting}>2do Parcial</TabsTrigger>
                  <TabsTrigger value="partial3" disabled={!selectedStudent || isSubmitting}>3er Parcial</TabsTrigger>
                </TabsList>
                <TabsContent value="partial1" className="border-x border-b p-4 rounded-b-md">
                  {renderGradeInputFieldsForPartial("partial1", p1FieldArray)}
                </TabsContent>
                <TabsContent value="partial2" className="border-x border-b p-4 rounded-b-md">
                  {renderGradeInputFieldsForPartial("partial2", p2FieldArray)}
                </TabsContent>
                <TabsContent value="partial3" className="border-x border-b p-4 rounded-b-md">
                  {renderGradeInputFieldsForPartial("partial3", p3FieldArray)}
                </TabsContent>
              </Tabs>
              <Button type="submit" disabled={isSubmitting || !selectedStudent} className="w-full sm:w-auto">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" /> 
                {selectedStudent ? `Save Grades for ${selectedStudent.name}` : 'Save Grades'}
              </Button>
              {!selectedStudent && !isLoadingData && (
                <p className="text-muted-foreground text-center py-6">
                  Please select a student using the filters above to manage their grades.
                </p>
              )}
            </form>
          </CardContent>
        </Card>
      </Form>
    </div>
  );
}
