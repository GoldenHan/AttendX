
'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { User } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Loader2, ClipboardCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge'; // Using Badge for grade display

interface StudentWithGrades extends User {
  finalGrade?: number | null; // Can be null if not all partials are graded
}

export default function StudentGradesPage() {
  const [students, setStudents] = useState<StudentWithGrades[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    const fetchStudents = async () => {
      setIsLoading(true);
      try {
        const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'));
        const usersSnapshot = await getDocs(studentQuery);
        const studentData = usersSnapshot.docs.map(doc => {
          const student = { id: doc.id, ...doc.data() } as User;
          let finalGrade: number | null = null;
          if (
            typeof student.partial1Grade === 'number' &&
            typeof student.partial2Grade === 'number' &&
            typeof student.partial3Grade === 'number'
          ) {
            finalGrade = (student.partial1Grade + student.partial2Grade + student.partial3Grade) / 3;
          }
          return { ...student, finalGrade };
        });
        setStudents(studentData);
      } catch (error) {
        console.error("Error fetching student data:", error);
        toast({ title: 'Error fetching data', description: 'Could not load student grades.', variant: 'destructive' });
      }
      setIsLoading(false);
    };
    fetchStudents();
  }, [toast]);

  const getGradeDisplay = (grade?: number) => {
    if (typeof grade !== 'number') {
      return <Badge variant="outline">N/A</Badge>;
    }
    const isPassing = grade >= 70;
    const colorClass = isPassing 
      ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30' 
      : 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30';
    
    return (
      <Badge variant="outline" className={`font-semibold ${colorClass}`}>
        {grade.toFixed(0)}
      </Badge>
    );
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> Student Grades</CardTitle>
          <CardDescription>View partial and final grades for students.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading student grades...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> Student Grades</CardTitle>
        <CardDescription>
          View partial and final grades for students. Grades below 70 are highlighted in red, 70 and above in green.
          Ensure grade fields (partial1Grade, partial2Grade, partial3Grade) are added as numbers in Firestore for students.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student Name</TableHead>
              <TableHead className="text-center">Partial 1</TableHead>
              <TableHead className="text-center">Partial 2</TableHead>
              <TableHead className="text-center">Partial 3</TableHead>
              <TableHead className="text-center">Final Grade</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.length > 0 ? students.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="font-medium">{student.name}</TableCell>
                <TableCell className="text-center">{getGradeDisplay(student.partial1Grade)}</TableCell>
                <TableCell className="text-center">{getGradeDisplay(student.partial2Grade)}</TableCell>
                <TableCell className="text-center">{getGradeDisplay(student.partial3Grade)}</TableCell>
                <TableCell className="text-center">
                  {typeof student.finalGrade === 'number' 
                    ? getGradeDisplay(student.finalGrade) 
                    : <Badge variant="outline">N/A</Badge>}
                </TableCell>
              </TableRow>
            )) : (
               <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    No student data with grades found.
                  </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
