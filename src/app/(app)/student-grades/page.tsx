
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
import type { User, PartialScores, ActivityScore, ExamScore, Group } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Loader2, ClipboardCheck, NotebookPen, Search } from 'lucide-react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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
  if (!activities || activities.length === 0) return null;

  let total = 0;
  let hasAnyNumericScore = false;
  activities.forEach(act => {
    if (typeof act.score === 'number') {
      total += act.score;
      hasAnyNumericScore = true;
    }
  });
  
  if (!hasAnyNumericScore) return null; 

  return Math.min(total, MAX_ACCUMULATED_SCORE_TOTAL);
};


const calculatePartialTotal = (partialScores?: PartialScores): number | null => {
  if (!partialScores) return null;

  const accumulatedTotal = calculateAccumulatedTotal(partialScores.accumulatedActivities);
  const examScore = partialScores.exam?.score;

  if (accumulatedTotal === null && (examScore === null || examScore === undefined)) {
      return null;
  }
  
  const currentAccumulated = accumulatedTotal ?? 0;
  const currentExam = examScore ?? 0;
  
  return Math.min(currentAccumulated + currentExam, MAX_ACCUMULATED_SCORE_TOTAL + MAX_EXAM_SCORE);
};


export default function StudentGradesPage() {
  const [allStudents, setAllStudents] = useState<StudentWithDetailedGrades[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>(''); 
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);

  const { toast } = useToast();
  const router = useRouter();

  const isLoading = isLoadingStudents || isLoadingGroups;

  const fetchData = useCallback(async () => {
    setIsLoadingStudents(true);
    setIsLoadingGroups(true);
    try {
      const studentQuery = query(collection(db, 'students')); 
      const studentsSnapshot = await getDocs(studentQuery);
      const studentData = studentsSnapshot.docs.map(doc => {
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
      setAllStudents(studentData);
      setIsLoadingStudents(false);

      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setAllGroups(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
      setIsLoadingGroups(false);

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load student grades or groups.', variant: 'destructive' });
      setIsLoadingStudents(false);
      setIsLoadingGroups(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const studentsToDisplay = useMemo(() => {
    if (isLoading) return [];

    let filtered = allStudents;

    if (selectedGroupId && selectedGroupId !== 'all') {
      const group = allGroups.find(g => g.id === selectedGroupId);
      if (group?.studentIds) {
        filtered = filtered.filter(s => group.studentIds.includes(s.id));
      } else {
        
        filtered = [];
      }
    }
    

    if (searchTerm.trim()) {
      filtered = filtered.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return filtered;
  }, [allStudents, allGroups, selectedGroupId, searchTerm, isLoading]);


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

    let badgeClassName = 'font-semibold text-xs px-1.5 py-0.5 min-w-[30px] text-center justify-center border ';
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
          <CardDescription>
            Filter by group or search by student name. Detailed view: up to {MAX_ACCUMULATED_ACTIVITIES} accumulated activities (total {MAX_ACCUMULATED_SCORE_TOTAL}pts) and 1 exam ({MAX_EXAM_SCORE}pts) per partial.
            Partial totals (max 100pts) and final grade (average of partials) below {PASSING_GRADE} are highlighted.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading student grades and groups...</p>
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
            Filter by group or search by student name. Detailed view: up to {MAX_ACCUMULATED_ACTIVITIES} accumulated activities (total {MAX_ACCUMULATED_SCORE_TOTAL}pts) and 1 exam ({MAX_EXAM_SCORE}pts) per partial.
            Partial totals (max 100pts) and final grade (average of partials) below {PASSING_GRADE} are highlighted.
            Custom activity names in tooltip. Click <NotebookPen className="inline-block h-4 w-4" /> to manage grades.
          </CardDescription>
           <div className="mt-4 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="group-filter-grades">Filter by Group</Label>
              <Select
                value={selectedGroupId}
                onValueChange={setSelectedGroupId}
              >
                <SelectTrigger id="group-filter-grades">
                  <SelectValue placeholder="Select a group or 'All'" />
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
              <Label htmlFor="search-student-grades">Search Student by Name</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search-student-grades"
                  type="search"
                  placeholder="Enter student name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8 w-full"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[2100px]">
            <TableHeader className="sticky top-0 bg-card z-20">
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom min-w-[150px] sticky left-0 bg-card z-30">Student Name</TableHead>
                <TableHead rowSpan={2} className="align-bottom min-w-[80px] sticky left-[150px] bg-card z-30">Actions</TableHead>
                
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200 py-2 sticky top-0 z-20">1st Partial</TableHead>
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200 py-2 sticky top-0 z-20">2nd Partial</TableHead>
                <TableHead colSpan={MAX_ACCUMULATED_ACTIVITIES + 2} className="text-center bg-orange-100 dark:bg-orange-800/50 text-orange-800 dark:text-orange-200 py-2 sticky top-0 z-20">3rd Partial</TableHead>
                
                <TableHead rowSpan={2} className="text-center align-bottom min-w-[100px] bg-blue-100 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 sticky top-0 z-20">Final Grade</TableHead>
              </TableRow>
              <TableRow>
                {[1, 2, 3].map(pNum => (
                  <React.Fragment key={`partial-headers-${pNum}`}>
                    {Array.from({ length: MAX_ACCUMULATED_ACTIVITIES }).map((_, i) => (
                      <TableHead key={`p${pNum}-acc${i+1}`} className={`text-center text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Ac. {i + 1}</TableHead>
                    ))}
                    <TableHead className={`text-center text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Exam</TableHead>
                    <TableHead className={`text-center font-bold text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
                        pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
                        pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
                        'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300'
                      }`}>Total Parcial</TableHead>
                  </React.Fragment>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsToDisplay.length > 0 ? studentsToDisplay.map((student) => (
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
                  
                  <TableCell className="text-center font-bold bg-blue-50 dark:bg-blue-900/30">
                    {getScoreDisplay(student.calculatedFinalGrade, null, null, false, true)}
                  </TableCell>
                </TableRow>
              )) : (
                 <TableRow>
                    <TableCell colSpan={MAX_ACCUMULATED_ACTIVITIES * 3 + 3 * 2 + 3} className="text-center h-24">
                      {(!selectedGroupId || selectedGroupId === 'all') && !searchTerm.trim()
                        ? "Select a group or search for a student to view grades."
                        : "No students found matching your criteria."
                      }
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
    
      

    
