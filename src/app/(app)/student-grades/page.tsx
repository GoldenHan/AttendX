
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import type { User, PartialScores, ActivityScore, ExamScore } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Loader2, ClipboardCheck, NotebookPen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StudentWithDetailedGrades extends User {
  calculatedAccumulatedTotalP1?: number | null;
  calculatedAccumulatedTotalP2?: number | null;
  calculatedAccumulatedTotalP3?: number | null;
  calculatedPartial1Total?: number | null;
  calculatedPartial2Total?: number | null;
  calculatedPartial3Total?: number | null;
  calculatedFinalGrade?: number | null;
}

const MAX_ACCUMULATED_ACTIVITIES = 5;
const MAX_ACCUMULATED_SCORE_TOTAL = 50;
const MAX_EXAM_SCORE = 50;
const PASSING_GRADE = 70;


const calculateAccumulatedTotal = (activities?: ActivityScore[]): number | null => {
  if (!activities || activities.length === 0) return null; // If no activities defined, return null

  let total = 0;
  let hasAnyNumericScore = false;
  activities.forEach(act => {
    if (typeof act.score === 'number') {
      total += act.score;
      hasAnyNumericScore = true;
    }
  });
  
  if (!hasAnyNumericScore && activities.length > 0) return 0; // Activities exist but all scores are null
  if (!hasAnyNumericScore) return null; // No activities had numeric scores

  return Math.min(total, MAX_ACCUMULATED_SCORE_TOTAL);
};


const calculatePartialTotal = (partialScores?: PartialScores): number | null => {
  if (!partialScores) return null;

  const accumulatedTotal = calculateAccumulatedTotal(partialScores.accumulatedActivities);
  const examScore = partialScores.exam?.score;

  // If exam score is null/undefined AND accumulatedTotal is null (meaning no accumulated activities or all were null)
  // then the partial total is null.
  if (accumulatedTotal === null && (examScore === null || examScore === undefined)) {
    // Check if exam object itself is missing or just its score is null
    // And if accumulatedActivities is an empty array or also yielded null
     if ( (partialScores.accumulatedActivities && partialScores.accumulatedActivities.length > 0 && accumulatedTotal === null && (!partialScores.exam || partialScores.exam.score === null) ) ) {
        // This case means there were activity definitions but none had scores AND exam was not scored or defined.
        // Let's consider this a 0 if there were attempts to define activities or exam.
     } else if (accumulatedTotal === null && (!partialScores.exam || partialScores.exam.score === null)) {
        return null; // Truly nothing defined or scored
     }
  }
  
  const currentAccumulated = accumulatedTotal ?? 0;
  const currentExam = examScore ?? 0;
  
  return Math.min(currentAccumulated + currentExam, MAX_ACCUMULATED_SCORE_TOTAL + MAX_EXAM_SCORE);
};


export default function StudentGradesPage() {
  const [students, setStudents] = useState<StudentWithDetailedGrades[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  const fetchStudents = useCallback(async () => {
    setIsLoading(true);
    try {
      const studentQuery = query(collection(db, 'users'), where('role', '==', 'student'));
      const usersSnapshot = await getDocs(studentQuery);
      const studentData = usersSnapshot.docs.map(doc => {
        const student = { id: doc.id, ...doc.data() } as User;
        
        const calculatedAccumulatedTotalP1 = calculateAccumulatedTotal(student.grades?.partial1?.accumulatedActivities);
        const calculatedAccumulatedTotalP2 = calculateAccumulatedTotal(student.grades?.partial2?.accumulatedActivities);
        const calculatedAccumulatedTotalP3 = calculateAccumulatedTotal(student.grades?.partial3?.accumulatedActivities);

        const calculatedPartial1Total = calculatePartialTotal(student.grades?.partial1);
        const calculatedPartial2Total = calculatePartialTotal(student.grades?.partial2);
        const calculatedPartial3Total = calculatePartialTotal(student.grades?.partial3);

        let calculatedFinalGrade: number | null = null;
        const partialTotals = [calculatedPartial1Total, calculatedPartial2Total, calculatedPartial3Total];
        
        if (partialTotals.every(t => typeof t === 'number')) {
          calculatedFinalGrade = (partialTotals.reduce((sum, current) => sum + (current as number), 0) / 3);
        }

        return { 
          ...student, 
          calculatedAccumulatedTotalP1,
          calculatedAccumulatedTotalP2,
          calculatedAccumulatedTotalP3,
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
  }, [toast]);

  useEffect(() => {
    fetchStudents();
  }, [fetchStudents]);

  const handleOpenEditGrades = (studentId: string) => {
    router.push(`/grades-management?studentId=${studentId}`);
  };

  const getScoreDisplay = (scoreValue?: number | null, customName?: string | null, defaultLabel?: string, isTotal: boolean = false, isFinalGrade: boolean = false) => {
    const displayName = customName || defaultLabel || '';
    
    let badgeContent: string;
    if (typeof scoreValue === 'number') {
        if (isFinalGrade || (isTotal && scoreValue % 1 !== 0)) {
            badgeContent = scoreValue.toFixed(isFinalGrade ? 2 : 1);
        } else {
            badgeContent = scoreValue.toFixed(0);
        }
    } else {
        badgeContent = 'N/A';
    }

    let badgeClassName = 'font-semibold text-xs px-1.5 py-0.5 min-w-[30px] text-center justify-center ';
    if (typeof scoreValue !== 'number') {
      badgeClassName += 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600';
    } else if (isTotal || isFinalGrade) {
      badgeClassName += scoreValue >= PASSING_GRADE 
        ? 'bg-green-100 dark:bg-green-900/70 text-green-700 dark:text-green-300 border-green-500/50' 
        : 'bg-red-100 dark:bg-red-900/70 text-red-700 dark:text-red-300 border-red-500/50';
    } else { 
      badgeClassName += 'bg-blue-100 dark:bg-blue-900/70 text-blue-700 dark:text-blue-300 border-blue-500/50';
    }

    const badgeElement = <Badge variant="outline" className={badgeClassName}>{badgeContent}</Badge>;

    if (displayName && !isTotal && !isFinalGrade) {
      return (
        <Tooltip>
          <TooltipTrigger asChild><span>{badgeElement}</span></TooltipTrigger>
          <TooltipContent side="top"><p>{displayName}</p></TooltipContent>
        </Tooltip>
      );
    }
    return badgeElement;
  };

  const renderAccumulatedActivitiesScores = (activities?: ActivityScore[], partialKey?: string) => {
    const cells = [];
    for (let i = 0; i < MAX_ACCUMULATED_ACTIVITIES; i++) {
      const activity = activities?.[i];
      cells.push(
        <TableCell key={`${partialKey}-acc-${i}`} className="text-center">
          {getScoreDisplay(activity?.score, activity?.name, `Ac. ${i + 1}`)}
        </TableCell>
      );
    }
    return cells;
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> Student Grades</CardTitle>
          <CardDescription>View detailed partial and final grades. Max 5 accumulated activities (total 50pts) and 1 exam (50pts) per partial. Final grade is average of partials.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading student grades...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> Student Grades</CardTitle>
          <CardDescription>
            Detailed view: up to 5 accumulated activities (total 50pts) and 1 exam (50pts) per partial.
            Partial totals (max 100pts) and final grade (average of partials) below {PASSING_GRADE} are highlighted red.
            Custom activity names shown on hover. Click <NotebookPen className="inline-block h-4 w-4" /> to manage grades.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[1900px]"> {/* Adjusted min-width for more columns */}
            <TableHeader className="sticky top-0 bg-card z-20">
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom min-w-[150px] sticky left-0 bg-card z-30">Student Name</TableHead>
                <TableHead rowSpan={2} className="align-bottom min-w-[80px] sticky left-[150px] bg-card z-30">Actions</TableHead>
                
                {/* Spanning (MAX_ACCUMULATED_ACTIVITIES) + Exam + Total */}
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200">1st Partial</TableHead>
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200">2nd Partial</TableHead>
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-orange-100 dark:bg-orange-800/50 text-orange-800 dark:text-orange-200">3rd Partial</TableHead>
                
                <TableHead rowSpan={2} className="text-center align-bottom min-w-[100px]">Final Grade</TableHead>
              </TableRow>
              <TableRow>
                {[1, 2, 3].map(pNum => (
                  <React.Fragment key={`partial-headers-${pNum}`}>
                    {Array.from({ length: MAX_ACCUMULATED_ACTIVITIES }).map((_, i) => (
                      <TableHead key={`p${pNum}-acc${i+1}`} className={`text-center text-xs whitespace-nowrap ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Ac. {i + 1}</TableHead>
                    ))}
                    <TableHead className={`text-center text-xs whitespace-nowrap ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Exam</TableHead>
                    <TableHead className={`text-center font-bold text-xs whitespace-nowrap ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Total Parcial</TableHead>
                  </React.Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length > 0 ? students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium sticky left-0 bg-card z-10 whitespace-nowrap">{student.name}</TableCell>
                  <TableCell className="sticky left-[150px] bg-card z-10">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditGrades(student.id)}>
                        <NotebookPen className="h-4 w-4" />
                        <span className="sr-only">Edit Grades</span>
                    </Button>
                  </TableCell>
                  
                  {renderAccumulatedActivitiesScores(student.grades?.partial1?.accumulatedActivities, 'p1')}
                  <TableCell className="text-center">
                    {getScoreDisplay(student.grades?.partial1?.exam?.score, student.grades?.partial1?.exam?.name, "Examen")}
                  </TableCell>
                  <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial1Total, null, null, true)}</TableCell>
                  
                  {renderAccumulatedActivitiesScores(student.grades?.partial2?.accumulatedActivities, 'p2')}
                  <TableCell className="text-center">
                    {getScoreDisplay(student.grades?.partial2?.exam?.score, student.grades?.partial2?.exam?.name, "Examen")}
                  </TableCell>
                  <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial2Total, null, null, true)}</TableCell>
                  
                  {renderAccumulatedActivitiesScores(student.grades?.partial3?.accumulatedActivities, 'p3')}
                  <TableCell className="text-center">
                    {getScoreDisplay(student.grades?.partial3?.exam?.score, student.grades?.partial3?.exam?.name, "Examen")}
                  </TableCell>
                  <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial3Total, null, null, true)}</TableCell>
                  
                  <TableCell className="text-center font-bold">{getScoreDisplay(student.calculatedFinalGrade, null, null, false, true)}</TableCell>
                </TableRow>
              )) : (
                 <TableRow>
                    <TableCell colSpan={MAX_ACCUMULATED_ACTIVITIES * 3 + 3 * 2 + 3} className="text-center h-24"> {/* Cols: (5 Acc * 3P) + (3 Exam) + (3 TotalP) + (1 Student) + (1 Action) + (1 Final) */}
                      No student data with detailed grades found.
                    </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
    