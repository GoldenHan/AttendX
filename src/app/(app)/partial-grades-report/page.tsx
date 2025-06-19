
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
import type { User, PartialScores, ActivityScore, ExamScore, Group, GradingConfiguration, StudentWithDetailedGrades } from '@/types';
// DEFAULT_GRADING_CONFIG import removed
import { db } from '@/lib/firebase';
import { collection, getDocs, query, doc, getDoc, where } from 'firebase/firestore'; // Added where
import { Loader2, ClipboardList, NotebookPen, AlertTriangle, Download, FileText } from 'lucide-react';
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
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext'; 

const MAX_ACCUMULATED_ACTIVITIES_DISPLAY = 5;

const calculateAccumulatedTotal = (activities: ActivityScore[] | undefined | null, config: GradingConfiguration): number | null => {
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
  return Math.min(total, config.maxTotalAccumulatedScore);
};

const calculatePartialTotal = (partialScores: PartialScores | undefined | null, config: GradingConfiguration): number | null => {
  if (!partialScores) return null;
  const accumulatedTotal = calculateAccumulatedTotal(partialScores.accumulatedActivities, config);
  const examScore = partialScores.exam?.score;
  if (accumulatedTotal === null && (examScore === null || examScore === undefined)) {
      return null;
  }
  const currentAccumulated = accumulatedTotal ?? 0;
  const currentExam = examScore ?? 0;
  return Math.min(currentAccumulated + currentExam, config.maxTotalAccumulatedScore + config.maxExamScore);
};

export default function PartialGradesReportPage() {
  const [allStudentsData, setAllStudentsData] = useState<StudentWithDetailedGrades[]>([]);
  const [allGroupsData, setAllGroupsData] = useState<Group[]>([]);
  
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('all');
  
  // gradingConfig state removed
  // isLoadingGradingConfig state removed
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);

  const { toast } = useToast();
  const router = useRouter();
  const { firestoreUser, gradingConfig, loading: authLoading } = useAuth(); // Get gradingConfig and authLoading from AuthContext

  const isLoading = isLoadingStudents || isLoadingGroups || authLoading || !firestoreUser; // Updated loading check

  // useEffect for fetching gradingConfig removed

  const fetchStudentAndGroupData = useCallback(async () => {
    if (authLoading || !firestoreUser?.institutionId) { // Wait for auth and institution ID
        setIsLoadingStudents(false); // Ensure loading states are cleared if check fails early
        setIsLoadingGroups(false);
        return;
    }

    setIsLoadingStudents(true);
    setIsLoadingGroups(true);
    try {
      // Query students for the current user's institution
      const studentQuery = query(collection(db, 'students'), where('institutionId', '==', firestoreUser.institutionId));
      const studentsSnapshot = await getDocs(studentQuery);
      const studentData = studentsSnapshot.docs.map(docSnap => {
        const student = { id: docSnap.id, ...docSnap.data() } as User;
        const studentCalculatedGrades: Partial<StudentWithDetailedGrades> = {};
        const partialTotalsArray: (number | null)[] = [];

        for (let i = 1; i <= gradingConfig.numberOfPartials; i++) { // Use gradingConfig from context
          const partialKey = `partial${i}` as keyof NonNullable<User['grades']>;
          const partialData = student.grades?.[partialKey];
          const accTotalKey = `calculatedAccumulatedTotalP${i}` as keyof StudentWithDetailedGrades;
          (studentCalculatedGrades as any)[accTotalKey] = calculateAccumulatedTotal(partialData?.accumulatedActivities, gradingConfig); // Use gradingConfig from context
          const partialTotalKey = `calculatedPartial${i}Total` as keyof StudentWithDetailedGrades;
          const currentPartialTotal = calculatePartialTotal(partialData, gradingConfig); // Use gradingConfig from context
          (studentCalculatedGrades as any)[partialTotalKey] = currentPartialTotal;
          if (typeof currentPartialTotal === 'number') {
            partialTotalsArray.push(currentPartialTotal);
          } else {
             partialTotalsArray.push(null); 
          }
        }
        
        const relevantPartialTotals = partialTotalsArray.slice(0, gradingConfig.numberOfPartials); // Use gradingConfig from context
        if (relevantPartialTotals.length === gradingConfig.numberOfPartials && relevantPartialTotals.every(t => typeof t === 'number')) { // Use gradingConfig from context
            studentCalculatedGrades.calculatedFinalGrade = (relevantPartialTotals.reduce((sum, current) => sum + (current as number), 0) / gradingConfig.numberOfPartials); // Use gradingConfig from context
        } else {
            studentCalculatedGrades.calculatedFinalGrade = null;
        }
        return { ...student, ...studentCalculatedGrades } as StudentWithDetailedGrades;
      });
      setAllStudentsData(studentData);
      setIsLoadingStudents(false);

      // Query groups for the current user's institution
      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', firestoreUser.institutionId));
      const groupsSnapshot = await getDocs(groupsQuery);
      const fetchedGroups = groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group));
      setAllGroupsData(fetchedGroups);
      
      if (firestoreUser.role === 'teacher') {
        const teacherGroups = fetchedGroups.filter(g => g.teacherId === firestoreUser.id);
        if (teacherGroups.length > 0) {
          setSelectedGroupId(teacherGroups[0].id); 
        } else {
          setSelectedGroupId('none'); 
        }
      }
      setIsLoadingGroups(false);

    } catch (error) {
      console.error("Error fetching student/group data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load student or group data.', variant: 'destructive' });
      setIsLoadingStudents(false);
      setIsLoadingGroups(false);
    }
  }, [toast, gradingConfig, authLoading, firestoreUser]); // Added gradingConfig, authLoading

  useEffect(() => {
    if (!authLoading && firestoreUser) { // Check authLoading
        fetchStudentAndGroupData();
    }
  }, [fetchStudentAndGroupData, authLoading, firestoreUser]); // Added authLoading

  const availableGroupsForFilter = useMemo(() => {
    if (!firestoreUser) return [];
    if (firestoreUser.role === 'teacher') {
      return allGroupsData.filter(g => g.teacherId === firestoreUser.id);
    }
    return allGroupsData; 
  }, [allGroupsData, firestoreUser]);

  const studentsForStudentFilterDropdown = useMemo(() => {
    if (!firestoreUser) return [];
    
    if (selectedGroupId === 'all') { 
        if (firestoreUser.role === 'teacher') {
            const studentIdsInTeacherGroups = availableGroupsForFilter.reduce((acc, group) => {
                if (Array.isArray(group.studentIds)) {
                    group.studentIds.forEach(id => acc.add(id));
                }
                return acc;
            }, new Set<string>());
            return allStudentsData.filter(s => studentIdsInTeacherGroups.has(s.id));
        }
        return allStudentsData; 
    }

    if (selectedGroupId === 'none' && firestoreUser.role === 'teacher') return [];
    
    const group = allGroupsData.find(g => g.id === selectedGroupId);
    if (group?.studentIds) {
      if (firestoreUser.role === 'teacher' && group.teacherId !== firestoreUser.id) {
        return [];
      }
      return allStudentsData.filter(s => group.studentIds.includes(s.id));
    }
    return [];
  }, [allStudentsData, allGroupsData, selectedGroupId, firestoreUser, availableGroupsForFilter]);

  const studentsToDisplayInTable = useMemo(() => {
    if (selectedStudentId !== 'all') {
      const student = studentsForStudentFilterDropdown.find(s => s.id === selectedStudentId);
      return student ? [student] : [];
    }
    return studentsForStudentFilterDropdown; 
  }, [selectedStudentId, studentsForStudentFilterDropdown]);

  const handleOpenEditGrades = (studentId: string) => {
     if (firestoreUser?.role === 'teacher') {
        const isStudentInTheirGroup = studentsToDisplayInTable.some(s => s.id === studentId);
        if (!isStudentInTheirGroup) {
            toast({ title: 'Access Denied', description: 'You can only manage grades for students in your assigned groups.', variant: 'destructive'});
            return;
        }
    }
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
      badgeClassName += scoreValue >= gradingConfig.passingGrade // Use gradingConfig from context
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

  const renderAccumulatedActivitiesScores = (activities?: ActivityScore[] | null, partialKey?: string) => {
    const cells = [];
    for (let i = 0; i < MAX_ACCUMULATED_ACTIVITIES_DISPLAY; i++) {
      const activity = activities?.[i];
      cells.push(
        <TableCell key={`${partialKey}-acc-${i}`} className="text-center">
          {getScoreDisplay(activity?.score, activity?.name, `Act. ${i + 1}`)}
        </TableCell>
      );
    }
    return cells;
  };
  
  const getScoreForHTML = (scoreValue?: number | null, isTotal: boolean = false, isFinalGrade: boolean = false) => {
    if (typeof scoreValue === 'number') {
      if (isFinalGrade || (isTotal && scoreValue % 1 !== 0)) {
        return scoreValue.toFixed(isFinalGrade ? 2 : 1);
      }
      return scoreValue.toFixed(0);
    }
    return 'N/A';
  };

  const getScoreCellStyle = (scoreValue?: number | null, isTotal: boolean = false, isFinalGrade: boolean = false) => {
    let style = 'text-align: center; padding: 4px; border: 1px solid #e2e8f0;'; 
    if (typeof scoreValue !== 'number') {
      style += 'background-color: #f3f4f6; color: #6b7280;'; 
    } else if (isTotal || isFinalGrade) {
      style += scoreValue >= gradingConfig.passingGrade
        ? 'background-color: #d1fae5; color: #065f46;' 
        : 'background-color: #fee2e2; color: #991b1b;'; 
    } else {
      style += 'background-color: #dbeafe; color: #1d4ed8;'; 
    }
    return style;
  };


  const handleExportToHTML = () => {
    if (isLoading || studentsToDisplayInTable.length === 0) {
      toast({ title: "No data to export", description: "Please filter to display some students or wait for data to load.", variant: "default" });
      return;
    }

    const numPartials = gradingConfig.numberOfPartials;
    let htmlString = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reporte de Notas Parciales</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif; margin: 20px; background-color: #f9fafb; color: #1f2937; }
          table { border-collapse: collapse; width: 100%; font-size: 0.875rem; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06); background-color: white; }
          th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; }
          th { background-color: #f3f4f6; font-weight: 600; }
          .header-partial-1 { background-color: #fef9c3; color: #713f12; } 
          .header-partial-2 { background-color: #dcfce7; color: #14532d; } 
          .header-partial-3 { background-color: #ffedd5; color: #7c2d12; } 
          .header-partial-4 { background-color: #ede9fe; color: #5b21b6; } 
          .header-final-grade { background-color: #dbeafe; color: #1e3a8a; } 
          .text-center { text-align: center; }
          .font-bold { font-weight: bold; }
          .whitespace-nowrap { white-space: nowrap; }
          .sticky-col { position: sticky; left: 0; background-color: white; z-index: 10; }
        </style>
      </head>
      <body>
        <h2>Reporte de Notas Parciales</h2>
        <p>Configuración: ${numPartials} parciales, Aprobación con ${gradingConfig.passingGrade}pts.</p>
        <table>
          <thead>
            <tr>
              <th rowspan="2" class="sticky-col">Nombre del Estudiante</th>
    `;

    for (let i = 1; i <= numPartials; i++) {
      const partialHeaderClass = `header-partial-${i > 4 ? 4 : i}`; 
      htmlString += `<th colspan="${MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2}" class="text-center ${partialHeaderClass}">${i}${i === 1 ? 'er' : i === 2 ? 'do' : i === 3 ? 'er' : 'to'} Parcial</th>`;
    }
    htmlString += `<th rowspan="2" class="text-center header-final-grade">Nota Final</th></tr><tr>`;

    for (let pNum = 1; pNum <= numPartials; pNum++) {
      const partialHeaderClass = `header-partial-${pNum > 4 ? 4 : pNum}`;
      for (let i = 0; i < MAX_ACCUMULATED_ACTIVITIES_DISPLAY; i++) {
        htmlString += `<th class="text-center text-xs whitespace-nowrap ${partialHeaderClass}">Ac. ${i + 1}</th>`;
      }
      htmlString += `<th class="text-center text-xs whitespace-nowrap ${partialHeaderClass}">Examen</th>`;
      htmlString += `<th class="text-center font-bold text-xs whitespace-nowrap ${partialHeaderClass}">Total Parcial</th>`;
    }
    htmlString += `</thead><tbody>`;

    studentsToDisplayInTable.forEach(student => {
      htmlString += `<tr><td class="font-medium whitespace-nowrap sticky-col">${student.name}</td>`;
      for (let i = 1; i <= numPartials; i++) {
        const partialKey = `partial${i}` as keyof User['grades'];
        const partialData = student.grades?.[partialKey];
        
        for (let j = 0; j < MAX_ACCUMULATED_ACTIVITIES_DISPLAY; j++) {
          const activity = partialData?.accumulatedActivities?.[j];
          htmlString += `<td style="${getScoreCellStyle(activity?.score)}">${getScoreForHTML(activity?.score)}</td>`;
        }
        htmlString += `<td style="${getScoreCellStyle(partialData?.exam?.score)}">${getScoreForHTML(partialData?.exam?.score)}</td>`;
        const partialTotalKey = `calculatedPartial${i}Total` as keyof StudentWithDetailedGrades;
        const studentPartialTotal = (student as any)[partialTotalKey];
        htmlString += `<td style="${getScoreCellStyle(studentPartialTotal, true)}" class="font-bold">${getScoreForHTML(studentPartialTotal, true)}</td>`;
      }
      htmlString += `<td style="${getScoreCellStyle(student.calculatedFinalGrade, false, true)}" class="font-bold">${getScoreForHTML(student.calculatedFinalGrade, false, true)}</td></tr>`;
    });

    htmlString += `</tbody></table></body></html>`;

    try {
      const blob = new Blob([htmlString], { type: 'text/html' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      const today = new Date().toISOString().split('T')[0];
      link.download = `Reporte_Notas_Parciales_${today}.html`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      toast({ title: "Exportación Exitosa", description: "Reporte de notas exportado como archivo HTML." });
    } catch (error) {
      console.error("Error exporting to HTML:", error);
      toast({ title: "Exportación Fallida", description: "No se pudo generar el archivo HTML.", variant: "destructive" });
    }
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardList className="h-6 w-6 text-primary" /> Partial Grades Report</CardTitle>
          <CardDescription>Loading report data and configuration...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const currentNumberOfPartials = Math.max(1, gradingConfig.numberOfPartials); // Use gradingConfig from context
  const partialHeaders = [];
  for (let i = 1; i <= currentNumberOfPartials; i++) {
    partialHeaders.push(
      <TableHead 
        key={`main-header-p${i}`} 
        colSpan={MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2} 
        className={`text-center py-2 sticky top-0 z-20 ${
          i % 4 === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200' :
          i % 4 === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200' :
          i % 4 === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-800 dark:text-orange-200' :
          'bg-purple-100 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200'
        }`}
      >
        {i}{i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th'} Partial
      </TableHead>
    );
  }

  const subPartialHeaders = [];
   for (let pNum = 1; pNum <= currentNumberOfPartials; pNum++) {
    for (let i = 0; i < MAX_ACCUMULATED_ACTIVITIES_DISPLAY; i++) {
      subPartialHeaders.push(
        <TableHead key={`p${pNum}-acc${i+1}`} className={`text-center text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
            pNum % 4 === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
            pNum % 4 === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
            pNum % 4 === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
            'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'
          }`}>Ac. {i + 1}</TableHead>
      );
    }
    subPartialHeaders.push(
      <TableHead key={`p${pNum}-exam`} className={`text-center text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
          pNum % 4 === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
          pNum % 4 === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
          pNum % 4 === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
          'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'
        }`}>Exam</TableHead>
    );
    subPartialHeaders.push(
      <TableHead key={`p${pNum}-total`} className={`text-center font-bold text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
         pNum % 4 === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
         pNum % 4 === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
         pNum % 4 === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
         'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'
        }`}>Total Parcial</TableHead>
    );
  }
  const totalColumns = 1 + (currentNumberOfPartials * (MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2)) + 1; 

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="h-6 w-6 text-primary" /> Partial Grades Report</CardTitle>
              <CardDescription>
                View partial grades for students.
                {firestoreUser?.role === 'teacher' ? " Showing students from your assigned groups." : " Filter by group and/or individual student."}
                <br/>
                Institution Configuration: {currentNumberOfPartials} partials, passing with {gradingConfig.passingGrade}pts.
              </CardDescription>
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={handleExportToHTML}
                disabled={isLoading || studentsToDisplayInTable.length === 0}
                className="gap-1.5 text-sm"
              >
                <FileText className="size-3.5" />
                Export to HTML
            </Button>
          </div>
           {gradingConfig.numberOfPartials < 1 && ( // Use gradingConfig from context
            <div className="mt-2 p-3 border border-red-500/50 bg-red-50 dark:bg-red-900/30 rounded-md text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0"/>
                <p>Warning: Number of partials is configured to {gradingConfig.numberOfPartials}. Displaying 1 partial by default. Check "App Settings".</p>
            </div>
          )}
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="group-filter-report">Filter by Group</Label>
              <Select
                value={selectedGroupId}
                onValueChange={(value) => {
                  setSelectedGroupId(value);
                  setSelectedStudentId('all'); 
                }}
                disabled={isLoadingGroups || (firestoreUser?.role === 'teacher' && availableGroupsForFilter.length === 0)}
              >
                <SelectTrigger id="group-filter-report">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  {firestoreUser?.role !== 'teacher' && <SelectItem value="all">All Groups</SelectItem>}
                  {firestoreUser?.role === 'teacher' && availableGroupsForFilter.length === 0 && <SelectItem value="none" disabled>No tienes grupos asignados</SelectItem>}
                  {firestoreUser?.role === 'teacher' && availableGroupsForFilter.length > 1 && <SelectItem value="all">All My Groups</SelectItem>}
                  {availableGroupsForFilter.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="student-filter-report">Filter by Student</Label>
              <Select
                value={selectedStudentId}
                onValueChange={setSelectedStudentId}
                disabled={isLoadingStudents || studentsForStudentFilterDropdown.length === 0}
              >
                <SelectTrigger id="student-filter-report">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {selectedGroupId === 'all' && firestoreUser?.role !== 'teacher' ? 'All Students (Global)' : 
                     selectedGroupId === 'all' && firestoreUser?.role === 'teacher' ? 'All Students in My Groups' :
                     selectedGroupId === 'none' && firestoreUser?.role === 'teacher' ? 'No Students (No Group)' :
                     'All Students in Selected Group'}
                  </SelectItem>
                  {studentsForStudentFilterDropdown.map((student) => (
                    <SelectItem key={student.id} value={student.id}>
                      {student.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-20">
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom min-w-[150px] sticky left-0 bg-card z-30">Student Name</TableHead>
                {partialHeaders}
                <TableHead rowSpan={2} className={`text-center align-bottom min-w-[100px] bg-blue-100 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 sticky top-0 z-20`}>Final Grade</TableHead>
              </TableRow>
              <TableRow>
                {subPartialHeaders}
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsToDisplayInTable.length > 0 ? studentsToDisplayInTable.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium sticky left-0 bg-card z-10 whitespace-nowrap">
                     <div className="flex items-center gap-2">
                        {student.name}
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-75 hover:opacity-100" onClick={() => handleOpenEditGrades(student.id)}>
                                    <NotebookPen className="h-3.5 w-3.5" />
                                    <span className="sr-only">Edit Grades for {student.name}</span>
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="right"><p>Edit Grades</p></TooltipContent>
                        </Tooltip>
                    </div>
                  </TableCell>
                  
                  {Array.from({ length: currentNumberOfPartials }).map((_, index) => {
                    const pNum = index + 1;
                    const partialKeyFirestore = `partial${pNum}` as keyof NonNullable<User['grades']>;
                    const partialData = student.grades?.[partialKeyFirestore];
                    const calculatedPartialTotalKey = `calculatedPartial${pNum}Total` as keyof StudentWithDetailedGrades;
                    const studentPartialTotal = (student as any)[calculatedPartialTotalKey];

                    return (
                      <React.Fragment key={`student-${student.id}-p${pNum}`}>
                        {renderAccumulatedActivitiesScores(partialData?.accumulatedActivities, `p${pNum}`)}
                        <TableCell className="text-center">
                          {getScoreDisplay(partialData?.exam?.score, partialData?.exam?.name, "Exam")}
                        </TableCell>
                        <TableCell className="text-center font-semibold">
                          {getScoreDisplay(studentPartialTotal, null, null, true)}
                        </TableCell>
                      </React.Fragment>
                    );
                  })}
                  
                  <TableCell className="text-center font-bold bg-blue-50 dark:bg-blue-900/30">
                    {getScoreDisplay(student.calculatedFinalGrade, null, null, false, true)}
                  </TableCell>
                </TableRow>
              )) : (
                 <TableRow>
                    <TableCell colSpan={totalColumns} className="text-center h-24">
                       {firestoreUser?.role === 'teacher' && availableGroupsForFilter.length === 0 
                        ? "No estás asignado a ningún grupo para ver reportes."
                        : "No hay estudiantes que coincidan con tus criterios o no tienen calificaciones registradas."
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
    
