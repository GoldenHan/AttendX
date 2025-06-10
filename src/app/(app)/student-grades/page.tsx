
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

// Helper function to calculate total for accumulated activities for a single partial
const calculateAccumulatedTotal = (activities?: ActivityScore[]): number | null => {
  if (!activities || activities.length === 0) {
    // If no activities defined, or array is empty, consider it not graded or 0.
    // Let's return null if no activities, and 0 if activities exist but all scores are null.
    if (!activities) return null; 
  }

  let total = 0;
  let hasAnyNumericScore = false;
  activities.forEach(act => {
    if (typeof act.score === 'number') {
      total += act.score;
      hasAnyNumericScore = true;
    }
  });
  
  // If activities array exists but all scores are null/undefined, it's a 0.
  // If activities array itself is undefined, it's null (not graded).
  return activities ? (hasAnyNumericScore ? Math.min(total, 50) : 0) : null;
};


// Helper function to calculate total for a single partial (accumulated + exam)
const calculatePartialTotal = (partialScores?: PartialScores): number | null => {
  if (!partialScores) return null;

  const accumulatedTotal = calculateAccumulatedTotal(partialScores.accumulatedActivities);
  const examScore = partialScores.exam?.score;

  // If both parts are null (e.g. exam doesn't exist or its score is null, and no accumulated activities scored)
  // then the partial total is null.
  if (accumulatedTotal === null && (examScore === null || examScore === undefined)) {
      // Check if exam object itself is missing or just its score
      if (accumulatedTotal === null && (!partialScores.exam || partialScores.exam.score === null || partialScores.exam.score === undefined) ) {
         return null;
      }
  }
  
  const currentAccumulated = accumulatedTotal ?? 0;
  const currentExam = examScore ?? 0;
  
  return Math.min(currentAccumulated + currentExam, 100);
};


export default function StudentGradesPage() {
  const [students, setStudents] = useState<StudentWithDetailedGrades[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const router = useRouter();

  const fetchStudents = async () => {
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
  };

  useEffect(() => {
    fetchStudents();
  }, [toast]);

  const handleOpenEditGrades = (studentId: string) => {
    router.push(`/grades-management?studentId=${studentId}`);
  };

  const getScoreDisplay = (scoreValue?: number | null, customName?: string | null, defaultLabel?: string, isTotal: boolean = false, isFinalGrade: boolean = false) => {
    const displayName = customName || defaultLabel || '';
    
    let badgeContent: string;
    if (typeof scoreValue === 'number') {
        if (isFinalGrade || (isTotal && scoreValue % 1 !== 0)) { // Show decimals for final grade or totals with decimals
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
    } else if (isTotal || isFinalGrade) { // Totals and Final Grade
      badgeClassName += scoreValue >= 70 
        ? 'bg-green-100 dark:bg-green-900/70 text-green-700 dark:text-green-300 border-green-500/50' 
        : 'bg-red-100 dark:bg-red-900/70 text-red-700 dark:text-red-300 border-red-500/50';
    } else { // Sub-component scores (accumulated activities, exam)
      badgeClassName += 'bg-blue-100 dark:bg-blue-900/70 text-blue-700 dark:text-blue-300 border-blue-500/50';
    }

    const badgeElement = <Badge variant="outline" className={badgeClassName}>{badgeContent}</Badge>;

    if (displayName && !isTotal && !isFinalGrade) { // Show tooltip for individual activities with names
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
          {getScoreDisplay(activity?.score, activity?.name, `Acum. ${i + 1}`)}
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
          <CardDescription>View detailed partial and final grades. Edit notes via the 'Grades Management' page.</CardDescription>
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
            Detailed view of student grades. Up to 5 accumulated activities per partial (max 50 pts total), plus an exam (max 50 pts).
            Partial totals (max 100 pts) and final grade (average of partials) below 70 are highlighted in red.
            Custom activity names are shown on hover. Click the edit icon to manage grades.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[1800px]"> {/* Adjusted min-width for more columns */}
            <TableHeader className="sticky top-0 bg-card z-20">
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom min-w-[150px] sticky left-0 bg-card z-30">Student Name</TableHead>
                <TableHead rowSpan={2} className="align-bottom min-w-[80px] sticky left-[150px] bg-card z-30">Actions</TableHead>
                
                {/* Spanning 7 columns: 5 Acc + 1 Exam + 1 Total */}
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200">1st Partial</TableHead>
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200">2nd Partial</TableHead>
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-orange-100 dark:bg-orange-800/50 text-orange-800 dark:text-orange-200">3rd Partial</TableHead>
                
                <TableHead rowSpan={2} className="text-center align-bottom min-w-[100px]">Final Grade</TableHead>
              </TableRow>
              <TableRow>
                {[1, 2, 3].map(pNum => (
                  <React.Fragment key={`partial-headers-${pNum}`}>
                    {Array.from({ length: MAX_ACCUMULATED_ACTIVITIES }).map((_, i) => (
                      <TableHead key={`p${pNum}-acc${i+1}`} className={`text-center text-xs ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Ac. {i + 1}</TableHead>
                    ))}
                    <TableHead className={`text-center text-xs ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Exam</TableHead>
                    <TableHead className={`text-center font-bold text-xs ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Total</TableHead>
                  </React.Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length > 0 ? students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium sticky left-0 bg-card z-10">{student.name}</TableCell>
                  <TableCell className="sticky left-[150px] bg-card z-10">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditGrades(student.id)}>
                        <NotebookPen className="h-4 w-4" />
                        <span className="sr-only">Edit Grades</span>
                    </Button>
                  </TableCell>
                  
                  {/* Partial 1 Scores */}
                  {renderAccumulatedActivitiesScores(student.grades?.partial1?.accumulatedActivities, 'p1')}
                  <TableCell className="text-center">
                    {getScoreDisplay(student.grades?.partial1?.exam?.score, student.grades?.partial1?.exam?.name, "Examen")}
                  </TableCell>
                  <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial1Total, null, null, true)}</TableCell>
                  
                  {/* Partial 2 Scores */}
                  {renderAccumulatedActivitiesScores(student.grades?.partial2?.accumulatedActivities, 'p2')}
                  <TableCell className="text-center">
                    {getScoreDisplay(student.grades?.partial2?.exam?.score, student.grades?.partial2?.exam?.name, "Examen")}
                  </TableCell>
                  <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial2Total, null, null, true)}</TableCell>
                  
                  {/* Partial 3 Scores */}
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

