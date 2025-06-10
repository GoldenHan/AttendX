
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
import type { User, PartialScores, ScoreDetail } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc } from 'firebase/firestore';
import { Loader2, ClipboardCheck, NotebookPen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation'; // For redirecting to grades-management
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StudentWithDetailedGrades extends User {
  calculatedPartial1Total?: number | null;
  calculatedPartial2Total?: number | null;
  calculatedPartial3Total?: number | null;
  calculatedFinalGrade?: number | null;
}

const DEFAULT_ACTIVITY_LABELS_VIEW: { [K in keyof Omit<PartialScores, 'id'>]-?: string } = {
  acc1: "Ac.1",
  acc2: "Ac.2",
  acc3: "Ac.3",
  acc4: "Ac.4",
  exam: "Exam",
};

const calculatePartialTotal = (scores?: PartialScores): number | null => {
  if (!scores) return null;
  const activities = Object.values(scores) as (ScoreDetail | null | undefined)[];
  let total = 0;
  let hasAnyScore = false;
  let allComponentsDefinedOrNull = true;

  const scoreKeys = Object.keys(DEFAULT_ACTIVITY_LABELS_VIEW) as (keyof PartialScores)[];

  if(scoreKeys.every(key => scores[key] === undefined || scores[key]?.score === undefined)) {
    return null; // If no score details are present at all, partial is N/A
  }

  for (const activityKey of scoreKeys) {
    const scoreDetail = scores[activityKey];
    if (scoreDetail === undefined) { // A sub-component of the partial is entirely missing
        allComponentsDefinedOrNull = false;
        // break; // If one is undefined, perhaps the total cannot be calculated. Or treat as 0.
                  // For now, if any ScoreDetail object itself is missing, we can't sum.
                  // But schema ensures ScoreDetail objects exist, their scores might be null/undefined.
    }
    if (scoreDetail && typeof scoreDetail.score === 'number') {
      total += scoreDetail.score;
      hasAnyScore = true;
    }
  }
  
  // If all ScoreDetail objects are present, but all their .score fields are null or undefined, total is 0.
  // If at least one score is a number, return the total.
  // If there are no ScoreDetail objects with numeric scores at all (e.g. partial object is empty, or all scores are null/undefined), return null.
  return hasAnyScore || Object.values(scores).some(sd => sd !== undefined) ? total : null;
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

  const handleOpenEditDialog = (studentId: string) => {
    router.push(`/grades-management?studentId=${studentId}`);
  };

  const getScoreDisplay = (scoreValue?: number | null, activityCustomName?: string | null, defaultActivityLabel?: string, isTotal: boolean = false) => {
    const displayLabel = activityCustomName || defaultActivityLabel || '';
    
    const badgeContent = typeof scoreValue === 'number' 
      ? (isTotal && scoreValue % 1 !== 0 ? scoreValue.toFixed(2) : scoreValue.toFixed(0)) 
      : 'N/A';

    let badgeClassName = 'font-semibold ';
    if (typeof scoreValue !== 'number') {
      badgeClassName += 'bg-gray-100 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 border-gray-300 dark:border-gray-600';
    } else if (isTotal) {
      badgeClassName += scoreValue >= 70 
        ? 'bg-green-100 dark:bg-green-700/30 text-green-700 dark:text-green-300 border-green-500/50' 
        : 'bg-red-100 dark:bg-red-700/30 text-red-700 dark:text-red-300 border-red-500/50';
    } else {
      badgeClassName += 'bg-blue-100 dark:bg-blue-700/30 text-blue-700 dark:text-blue-300 border-blue-500/50';
    }

    const badgeElement = <Badge variant="outline" className={badgeClassName}>{badgeContent}</Badge>;

    if (!isTotal && displayLabel) {
      return (
        <Tooltip>
          <TooltipTrigger asChild><span>{badgeElement}</span></TooltipTrigger>
          <TooltipContent side="top"><p>{displayLabel}</p></TooltipContent>
        </Tooltip>
      );
    }
    return badgeElement;
  };

  const renderPartialScores = (partialData?: PartialScores) => {
    const activities = Object.keys(DEFAULT_ACTIVITY_LABELS_VIEW) as (keyof PartialScores)[];
    return (
      <>
        {activities.map(activityKey => {
          const scoreDetail = partialData?.[activityKey];
          return (
            <TableCell key={activityKey} className="text-center">
              {getScoreDisplay(scoreDetail?.score, scoreDetail?.name, DEFAULT_ACTIVITY_LABELS_VIEW[activityKey])}
            </TableCell>
          );
        })}
      </>
    );
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
            Detailed view of student grades. Activity names (if custom) shown on hover.
            Partial totals and final grade below 70 are highlighted in red, 70 and above in green.
            Click the edit icon to manage grades in the 'Grades Management' section.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[1300px]"> {/* Adjusted min-width for new Actions column */}
            <TableHeader className="sticky top-0 bg-card z-20">
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom min-w-[150px] sticky left-0 bg-card z-30">Student Name</TableHead>
                <TableHead rowSpan={2} className="align-bottom min-w-[80px] sticky left-[150px] bg-card z-30">Actions</TableHead>
                <TableHead colSpan={6} className="text-center bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">1st Partial</TableHead>
                <TableHead colSpan={6} className="text-center bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">2nd Partial</TableHead>
                <TableHead colSpan={6} className="text-center bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">3rd Partial</TableHead>
                <TableHead rowSpan={2} className="text-center align-bottom min-w-[100px]">Final Grade</TableHead>
              </TableRow>
              <TableRow>
                {/* 1st Partial Sub-headers */}
                {Object.values(DEFAULT_ACTIVITY_LABELS_VIEW).map(label => <TableHead key={`p1-${label}`} className="text-center bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">{label}</TableHead>)}
                <TableHead className="text-center font-bold bg-yellow-100 dark:bg-yellow-700/30 text-yellow-800 dark:text-yellow-300">Total</TableHead>
                {/* 2nd Partial Sub-headers */}
                {Object.values(DEFAULT_ACTIVITY_LABELS_VIEW).map(label => <TableHead key={`p2-${label}`} className="text-center bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">{label}</TableHead>)}
                <TableHead className="text-center font-bold bg-green-100 dark:bg-green-700/30 text-green-800 dark:text-green-300">Total</TableHead>
                {/* 3rd Partial Sub-headers */}
                {Object.values(DEFAULT_ACTIVITY_LABELS_VIEW).map(label => <TableHead key={`p3-${label}`} className="text-center bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">{label}</TableHead>)}
                <TableHead className="text-center font-bold bg-orange-100 dark:bg-orange-700/30 text-orange-800 dark:text-orange-300">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {students.length > 0 ? students.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium sticky left-0 bg-card z-10">{student.name}</TableCell>
                  <TableCell className="sticky left-[150px] bg-card z-10">
                    <Button variant="ghost" size="icon" onClick={() => handleOpenEditDialog(student.id)}>
                        <NotebookPen className="h-4 w-4" />
                        <span className="sr-only">Edit Grades</span>
                    </Button>
                  </TableCell>
                  {renderPartialScores(student.grades?.partial1)}
                  <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial1Total, null, null, true)}</TableCell>
                  
                  {renderPartialScores(student.grades?.partial2)}
                  <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial2Total, null, null, true)}</TableCell>
                  
                  {renderPartialScores(student.grades?.partial3)}
                  <TableCell className="text-center font-semibold">{getScoreDisplay(student.calculatedPartial3Total, null, null, true)}</TableCell>
                  
                  <TableCell className="text-center font-bold">{getScoreDisplay(student.calculatedFinalGrade, null, null, true)}</TableCell>
                </TableRow>
              )) : (
                 <TableRow>
                    <TableCell colSpan={21} className="text-center h-24"> {/* Adjusted colSpan */}
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
