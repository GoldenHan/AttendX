
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
import type { User, PartialScores } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Loader2, ClipboardCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

interface StudentWithDetailedGrades extends User {
  calculatedPartial1Total?: number | null;
  calculatedPartial2Total?: number | null;
  calculatedPartial3Total?: number | null;
  calculatedFinalGrade?: number | null;
}

const calculatePartialTotal = (scores?: PartialScores): number | null => {
  if (!scores) return null;
  const { acc1, acc2, acc3, acc4, exam } = scores;
  const allScores = [acc1, acc2, acc3, acc4, exam];
  
  // Check if any score is undefined (meaning not entered yet, but not explicitly null for "no score")
  // If any field inside scores is undefined, we can't calculate a total.
  // If they are null, it means 0 for calculation.
  if (allScores.some(score => score === undefined)) {
    // If some sub-scores are truly undefined (not yet set), we can't sum them.
    // Consider if *all* must be present or if partial sums are allowed.
    // For now, if any is undefined, partial is null.
    // If all are null or numbers, then proceed.
     if (Object.values(scores).every(s => s === null || typeof s === 'number')) {
        // All fields are either null or a number. Proceed with sum.
     } else {
        return null; // Some field is genuinely undefined.
     }
  }

  let total = 0;
  let hasNonNullScore = false;
  allScores.forEach(score => {
    if (typeof score === 'number') {
      total += score;
      hasNonNullScore = true;
    }
  });
  // Return null if no scores were actually entered (all were null or undefined from the start)
  // unless the intent is that all null means a total of 0.
  // For now, if no actual numbers, it's null.
  return hasNonNullScore || Object.values(scores).length > 0 ? total : null;
};


export default function StudentGradesPage() {
  const [students, setStudents] = useState<StudentWithDetailedGrades[]>([]);
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
          
          const calculatedPartial1Total = calculatePartialTotal(student.grades?.partial1);
          const calculatedPartial2Total = calculatePartialTotal(student.grades?.partial2);
          const calculatedPartial3Total = calculatePartialTotal(student.grades?.partial3);

          let calculatedFinalGrade: number | null = null;
          const partialTotals = [calculatedPartial1Total, calculatedPartial2Total, calculatedPartial3Total].filter(t => typeof t === 'number') as number[];
          
          if (partialTotals.length === 3) { // Only calculate final if all 3 partials are complete
            calculatedFinalGrade = partialTotals.reduce((sum, current) => sum + current, 0) / 3;
          }

          return { 
            ...student, 
            calculatedPartial1Total,
            calculatedPartial2Total,
            calculatedPartial3Total,
            calculatedFinalGrade 
          };
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

  const getScoreDisplay = (score?: number | null, isTotal: boolean = false) => {
    if (typeof score !== 'number') {
      return <Badge variant="outline">N/A</Badge>;
    }
    
    let colorClass = '';
    if (isTotal) {
      const isPassing = score >= 70;
      colorClass = isPassing 
        ? 'bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30' 
        : 'bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30';
    } else {
      colorClass = 'border-muted-foreground/30'; // Default border for sub-scores
    }
    
    return (
      <Badge variant="outline" className={`font-semibold ${colorClass}`}>
        {score.toFixed(0)}
      </Badge>
    );
  };

  const renderPartialScores = (partialScores?: PartialScores) => {
    const scores = partialScores || {};
    return (
      <>
        <TableCell className="text-center">{getScoreDisplay(scores.acc1)}</TableCell>
        <TableCell className="text-center">{getScoreDisplay(scores.acc2)}</TableCell>
        <TableCell className="text-center">{getScoreDisplay(scores.acc3)}</TableCell>
        <TableCell className="text-center">{getScoreDisplay(scores.acc4)}</TableCell>
        <TableCell className="text-center">{getScoreDisplay(scores.exam)}</TableCell>
      </>
    );
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> Student Grades</CardTitle>
          <CardDescription>View detailed partial and final grades for students.</CardDescription>
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
          Detailed view of student grades including accumulated scores, exams, partial totals, and final grade.
          Partial totals and final grade below 70 are highlighted in red, 70 and above in green.
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table className="min-w-[1200px]">
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="align-bottom min-w-[150px] sticky left-0 bg-card z-10">Student Name</TableHead>
              <TableHead colSpan={6} className="text-center bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">1st Partial</TableHead>
              <TableHead colSpan={6} className="text-center bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">2nd Partial</TableHead>
              <TableHead colSpan={6} className="text-center bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">3rd Partial</TableHead>
              <TableHead rowSpan={2} className="text-center align-bottom min-w-[100px]">Final Grade</TableHead>
            </TableRow>
            <TableRow>
              {/* 1st Partial Sub-headers */}
              <TableHead className="text-center bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">Ac.1</TableHead>
              <TableHead className="text-center bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">Ac.2</TableHead>
              <TableHead className="text-center bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">Ac.3</TableHead>
              <TableHead className="text-center bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">Ac.4</TableHead>
              <TableHead className="text-center bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">Exam</TableHead>
              <TableHead className="text-center font-bold bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">Total</TableHead>
              {/* 2nd Partial Sub-headers */}
              <TableHead className="text-center bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">Ac.1</TableHead>
              <TableHead className="text-center bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">Ac.2</TableHead>
              <TableHead className="text-center bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">Ac.3</TableHead>
              <TableHead className="text-center bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">Ac.4</TableHead>
              <TableHead className="text-center bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">Exam</TableHead>
              <TableHead className="text-center font-bold bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">Total</TableHead>
              {/* 3rd Partial Sub-headers */}
              <TableHead className="text-center bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">Ac.1</TableHead>
              <TableHead className="text-center bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">Ac.2</TableHead>
              <TableHead className="text-center bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">Ac.3</TableHead>
              <TableHead className="text-center bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">Ac.4</TableHead>
              <TableHead className="text-center bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">Exam</TableHead>
              <TableHead className="text-center font-bold bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.length > 0 ? students.map((student) => (
              <TableRow key={student.id}>
                <TableCell className="font-medium sticky left-0 bg-card z-10">{student.name}</TableCell>
                {renderPartialScores(student.grades?.partial1)}
                <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial1Total, true)}</TableCell>
                
                {renderPartialScores(student.grades?.partial2)}
                <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial2Total, true)}</TableCell>
                
                {renderPartialScores(student.grades?.partial3)}
                <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial3Total, true)}</TableCell>
                
                <TableCell className="text-center font-bold">{getScoreDisplay(student.calculatedFinalGrade, true)}</TableCell>
              </TableRow>
            )) : (
               <TableRow>
                  <TableCell colSpan={20} className="text-center h-24">
                    No student data with detailed grades found.
                  </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

    