
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, UserCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, updateDoc, query, where } from 'firebase/firestore';
import type { User, PartialScores } from '@/types';
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

const parseOptionalFloat = (val: unknown): number | null | undefined => {
  if (val === "" || val === undefined || val === null) return null;
  const num = Number(val);
  return isNaN(num) ? undefined : num;
};

const partialScoresSchema = z.object({
  acc1: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(10, "Max 10").optional().nullable()),
  acc2: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(10, "Max 10").optional().nullable()),
  acc3: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(10, "Max 10").optional().nullable()),
  acc4: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(10, "Max 10").optional().nullable()),
  exam: z.preprocess(parseOptionalFloat, z.number().min(0, "Min 0").max(60, "Max 60").optional().nullable()),
}).deepPartial().optional();

const studentGradeFormSchema = z.object({
  grades: z.object({
    partial1: partialScoresSchema,
    partial2: partialScoresSchema,
    partial3: partialScoresSchema,
  }).deepPartial().optional(),
  studentId: z.string().min(1, "Student selection is required."),
});

type StudentGradeFormValues = z.infer<typeof studentGradeFormSchema>;

export default function GradesManagementPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const [students, setStudents] = useState<User[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<User | null>(null);
  const [isLoadingData, setIsLoadingData] = useState(true); // Combined loading state
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<StudentGradeFormValues>({
    resolver: zodResolver(studentGradeFormSchema),
    defaultValues: {
      studentId: '',
      grades: {
        partial1: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
        partial2: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
        partial3: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
      }
    },
  });

  const fetchStudentsAndPreselect = useCallback(async () => {
    setIsLoadingData(true);
    try {
      const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'));
      const usersSnapshot = await getDocs(studentQuery);
      const studentList = usersSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));
      setStudents(studentList);

      const studentIdFromParams = searchParams.get('studentId');
      if (studentIdFromParams) {
        form.setValue('studentId', studentIdFromParams); // Set studentId for the form
        // Find and set student for displaying grades
        const preselectedStudent = studentList.find(s => s.id === studentIdFromParams);
        if (preselectedStudent) {
          setSelectedStudent(preselectedStudent); // For UI display
          // Reset form with preselected student's grades
          form.reset({
            studentId: preselectedStudent.id,
            grades: {
              partial1: preselectedStudent.grades?.partial1 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
              partial2: preselectedStudent.grades?.partial2 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
              partial3: preselectedStudent.grades?.partial3 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
            }
          });
        } else {
          toast({ title: 'Error', description: 'Student from URL not found.', variant: 'destructive' });
          router.push('/grades-management'); // Clear invalid studentId from URL
        }
      }
    } catch (error) {
      console.error("Error fetching students:", error);
      toast({ title: 'Error', description: 'Could not load students.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  }, [searchParams, toast, form, router]);

  useEffect(() => {
    fetchStudentsAndPreselect();
  }, [fetchStudentsAndPreselect]);

  const handleStudentSelect = async (studentId: string) => {
    if (!studentId) {
      setSelectedStudent(null);
      form.reset({
        studentId: '',
        grades: {
          partial1: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
          partial2: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
          partial3: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
        }
      });
      router.push('/grades-management'); // Clear studentId from URL
      return;
    }

    form.setValue('studentId', studentId); // Update form state
    setIsLoadingData(true);
    const studentDocRef = doc(db, 'users', studentId);
    try {
      const studentDocSnapshot = await getDoc(studentDocRef);
      if (studentDocSnapshot.exists()) {
        const studentData = { id: studentDocSnapshot.id, ...studentDocSnapshot.data() } as User;
        setSelectedStudent(studentData);
        form.reset({ // Reset form with selected student's grades
          studentId: studentData.id,
          grades: {
            partial1: studentData.grades?.partial1 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
            partial2: studentData.grades?.partial2 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
            partial3: studentData.grades?.partial3 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
          }
        });
        router.push(`/grades-management?studentId=${studentId}`);
      } else {
        toast({ title: 'Error', description: 'Student not found.', variant: 'destructive' });
        setSelectedStudent(null);
        router.push('/grades-management');
      }
    } catch (error) {
      console.error("Error fetching selected student:", error);
      toast({ title: 'Error', description: 'Could not load student data.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  };

  const onSubmit = async (data: StudentGradeFormValues) => {
    if (!data.studentId || !selectedStudent) { // Ensure selectedStudent matches form's studentId logic
      toast({ title: "Error", description: "No student selected or student ID missing.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const studentRef = doc(db, "users", data.studentId);
      await updateDoc(studentRef, {
        grades: {
          partial1: data.grades?.partial1 || {},
          partial2: data.grades?.partial2 || {},
          partial3: data.grades?.partial3 || {},
        }
      });
      toast({ title: "Grades Updated", description: `Grades for ${selectedStudent.name} saved successfully.` });
      
      // Optimistically update local state for selectedStudent
      const updatedGrades = {
        partial1: data.grades?.partial1,
        partial2: data.grades?.partial2,
        partial3: data.grades?.partial3,
      };
      const updatedSelectedStudent = { ...selectedStudent, grades: updatedGrades };
      setSelectedStudent(updatedSelectedStudent);

      // Update the main students list as well
      setStudents(prevStudents => prevStudents.map(s => s.id === data.studentId ? updatedSelectedStudent : s));

    } catch (error: any) {
      toast({ title: "Grade Update Failed", description: `An error occurred: ${error.message || 'Please try again.'}`, variant: "destructive" });
      console.error("Grade update error:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderGradeInputFields = (partialKey: "partial1" | "partial2" | "partial3") => {
    const accumulatedFields: (keyof PartialScores)[] = ['acc1', 'acc2', 'acc3', 'acc4'];
    return (
      <div className="space-y-3 p-1">
        {accumulatedFields.map((accKey, index) => (
          <FormField
            key={`${partialKey}-${accKey}`}
            control={form.control}
            name={`grades.${partialKey}.${accKey}`}
            render={({ field }) => (
              <FormItem className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <FormLabel className="w-full sm:w-32 whitespace-nowrap mb-1 sm:mb-0">Acumulado {index + 1}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0-10"
                    {...field}
                    value={field.value === null ? '' : field.value ?? ''}
                    onChange={e => field.onChange(parseOptionalFloat(e.target.value))}
                    className="w-full"
                    disabled={!selectedStudent || isSubmitting || isLoadingData}
                  />
                </FormControl>
                <FormMessage className="text-xs mt-1 sm:mt-0 sm:ml-2"/>
              </FormItem>
            )}
          />
        ))}
        <FormField
          control={form.control}
          name={`grades.${partialKey}.exam`}
          render={({ field }) => (
            <FormItem className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <FormLabel className="w-full sm:w-32 mb-1 sm:mb-0">Examen</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0-60"
                  {...field}
                  value={field.value === null ? '' : field.value ?? ''}
                  onChange={e => field.onChange(parseOptionalFloat(e.target.value))}
                  className="w-full"
                  disabled={!selectedStudent || isSubmitting || isLoadingData}
                />
              </FormControl>
              <FormMessage className="text-xs mt-1 sm:mt-0 sm:ml-2"/>
            </FormItem>
          )}
        />
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserCircle className="h-6 w-6 text-primary" />
          Grades Management
        </CardTitle>
        <CardDescription>Select a student to view or edit their grades for each partial.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <FormField
            control={form.control}
            name="studentId"
            render={({ field }) => (
                <FormItem>
                    <FormLabel>Select Student</FormLabel>
                    <Select
                        onValueChange={(value) => {
                           // field.onChange is already handled by react-hook-form's Controller.
                           // Direct call to handleStudentSelect will ensure UI updates and form sync.
                            handleStudentSelect(value);
                        }}
                        value={field.value} // Ensure this reflects the RHF state
                        disabled={isLoadingData || students.length === 0}
                    >
                        <FormControl>
                        <SelectTrigger>
                            <SelectValue placeholder={isLoadingData && !students.length ? "Loading students..." : "Select a student"} />
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

        {isLoadingData && form.getValues("studentId") && ( // Show loader if studentId is set and data is loading
          <div className="flex items-center justify-center py-6">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            <span>Loading student grades...</span>
          </div>
        )}

        {selectedStudent && !isLoadingData && (
          <Form {...form}> {/* Ensure FormProvider wraps the form */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <Tabs defaultValue="partial1" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="partial1">1er Parcial</TabsTrigger>
                  <TabsTrigger value="partial2">2do Parcial</TabsTrigger>
                  <TabsTrigger value="partial3">3er Parcial</TabsTrigger>
                </TabsList>
                <TabsContent value="partial1" className="border p-4 rounded-b-md">
                  {renderGradeInputFields("partial1")}
                </TabsContent>
                <TabsContent value="partial2" className="border p-4 rounded-b-md">
                  {renderGradeInputFields("partial2")}
                </TabsContent>
                <TabsContent value="partial3" className="border p-4 rounded-b-md">
                  {renderGradeInputFields("partial3")}
                </TabsContent>
              </Tabs>
              <Button type="submit" disabled={isSubmitting || !selectedStudent || isLoadingData} className="w-full sm:w-auto">
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <Save className="mr-2 h-4 w-4" /> Save Grades for {selectedStudent.name}
              </Button>
            </form>
          </Form>
        )}
         {!selectedStudent && !isLoadingData && (
            <p className="text-muted-foreground text-center py-6">
                Please select a student to manage their grades.
            </p>
        )}
      </CardContent>
    </Card>
  );
}
