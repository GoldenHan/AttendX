
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, UserCircle, ClipboardCheck, Search, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, updateDoc, query, where } from 'firebase/firestore';
import type { User, Group, PartialScores } from '@/types';
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
import { Label } from '@/components/ui/label';

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

// Schema for the grade entry form itself
const gradeEntryFormSchema = z.object({
  partial1: partialScoresSchema,
  partial2: partialScoresSchema,
  partial3: partialScoresSchema,
}).deepPartial().optional();

type GradeEntryFormValues = z.infer<typeof gradeEntryFormSchema>;

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
      partial1: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
      partial2: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
      partial3: { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
    }
  });

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
          handleSelectStudentForGrading(preselectedStudent, false); // Don't push router here, already on page
        } else {
          toast({ title: 'Error', description: 'Student from URL not found.', variant: 'destructive' });
        }
      }
    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast({ title: 'Error', description: 'Could not load students or groups.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  }, [searchParams, toast]); // Removed gradeForm and router from deps as they are stable

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);
  
  const filteredStudentsList = useMemo(() => {
    let studentsToDisplay = allStudents;

    if (selectedGroupIdForFilter !== 'all') {
      const group = allGroups.find(g => g.id === selectedGroupIdForFilter);
      if (group && Array.isArray(group.studentIds)) {
        studentsToDisplay = studentsToDisplay.filter(student => group.studentIds.includes(student.id));
      } else if (group) { // Group selected but has no students
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

  const handleSelectStudentForGrading = (student: User, updateUrl: boolean = true) => {
    setSelectedStudent(student);
    gradeForm.reset({
      partial1: student.grades?.partial1 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
      partial2: student.grades?.partial2 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
      partial3: student.grades?.partial3 || { acc1: null, acc2: null, acc3: null, acc4: null, exam: null },
    });
    if (updateUrl) {
      router.push(`/grades-management?studentId=${student.id}`, { scroll: false });
    }
  };

  const onSubmitGrades = async (data: GradeEntryFormValues) => {
    if (!selectedStudent) { 
      toast({ title: "Error", description: "No student selected.", variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const studentRef = doc(db, "users", selectedStudent.id);
      // Ensure all partials exist, even if empty, to match schema
      const gradesToSave = {
        partial1: data.partial1 || {},
        partial2: data.partial2 || {},
        partial3: data.partial3 || {},
      };
      await updateDoc(studentRef, { grades: gradesToSave });
      
      toast({ title: "Grades Updated", description: `Grades for ${selectedStudent.name} saved successfully.` });
      
      // Refresh selected student data to reflect saved changes
      const updatedStudentDoc = await getDoc(studentRef);
      if(updatedStudentDoc.exists()){
        const updatedStudentData = { id: updatedStudentDoc.id, ...updatedStudentDoc.data() } as User;
        setSelectedStudent(updatedStudentData); // Update local state for selected student
        // Also update this student in the main list
        setAllStudents(prev => prev.map(s => s.id === updatedStudentData.id ? updatedStudentData : s));
      }

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
            control={gradeForm.control}
            name={`${partialKey}.${accKey}`}
            render={({ field }) => (
              <FormItem className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <FormLabel className="w-full sm:w-32 whitespace-nowrap mb-1 sm:mb-0">Acumulado {index + 1}</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0-10"
                    {...field}
                    value={field.value === null ? '' : field.value ?? ''}
                    onChange={e => field.onChange(parseOptionalFloat(e.target.value))}
                    className="w-full"
                    disabled={isSubmitting}
                  />
                </FormControl>
                <FormMessage className="text-xs mt-1 sm:mt-0 sm:ml-2"/>
              </FormItem>
            )}
          />
        ))}
        <FormField
          control={gradeForm.control}
          name={`${partialKey}.exam`}
          render={({ field }) => (
            <FormItem className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
              <FormLabel className="w-full sm:w-32 mb-1 sm:mb-0">Examen</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.1"
                  placeholder="0-60"
                  {...field}
                  value={field.value === null ? '' : field.value ?? ''}
                  onChange={e => field.onChange(parseOptionalFloat(e.target.value))}
                  className="w-full"
                  disabled={isSubmitting}
                />
              </FormControl>
              <FormMessage className="text-xs mt-1 sm:mt-0 sm:ml-2"/>
            </FormItem>
          )}
        />
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
          <CardDescription>Filter students by group or search by name, then select a student to edit their grades.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="group-filter">Filter by Group</Label>
              <Select
                value={selectedGroupIdForFilter}
                onValueChange={(value) => {
                  setSelectedGroupIdForFilter(value);
                  setSelectedStudent(null); // Clear student selection when filter changes
                  router.push('/grades-management', { scroll: false }); // Clear studentId from URL
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
                    setSelectedStudent(null); // Clear student selection
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

      {selectedStudent && (
        <Card>
          <CardHeader>
            <CardTitle>Editing Grades for: {selectedStudent.name}</CardTitle>
            <CardDescription>Enter accumulated scores (max 10 each) and exam score (max 60) for each partial.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...gradeForm}>
              <form onSubmit={gradeForm.handleSubmit(onSubmitGrades)} className="space-y-6">
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
                <Button type="submit" disabled={isSubmitting} className="w-full sm:w-auto">
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <Save className="mr-2 h-4 w-4" /> Save Grades for {selectedStudent.name}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
      {!selectedStudent && !isLoadingData && (
        <p className="text-muted-foreground text-center py-6">
          Please select a student using the filters above to manage their grades.
        </p>
      )}
    </div>
  );
}

