
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
import { DEFAULT_GRADING_CONFIG } from '@/types';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, doc, getDoc } from 'firebase/firestore';
import { Loader2, ClipboardList, NotebookPen, AlertTriangle, Download } from 'lucide-react';
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
import * as XLSX from 'xlsx';

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
  
  const [gradingConfig, setGradingConfig] = useState<GradingConfiguration>(DEFAULT_GRADING_CONFIG);
  const [isLoadingGradingConfig, setIsLoadingGradingConfig] = useState(true);
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);

  const { toast } = useToast();
  const router = useRouter();

  const isLoading = isLoadingStudents || isLoadingGroups || isLoadingGradingConfig;

  useEffect(() => {
    const fetchGradingConfig = async () => {
      setIsLoadingGradingConfig(true);
      try {
        const configDocRef = doc(db, 'appConfiguration', 'currentGradingConfig');
        const docSnap = await getDoc(configDocRef);
        if (docSnap.exists()) {
          const loadedConfig = docSnap.data() as GradingConfiguration;
           const validatedConfig: GradingConfiguration = {
            id: loadedConfig.id || "currentGradingConfig",
            numberOfPartials: [1, 2, 3, 4].includes(loadedConfig.numberOfPartials) ? loadedConfig.numberOfPartials : DEFAULT_GRADING_CONFIG.numberOfPartials,
            passingGrade: typeof loadedConfig.passingGrade === 'number' ? loadedConfig.passingGrade : DEFAULT_GRADING_CONFIG.passingGrade,
            maxIndividualActivityScore: typeof loadedConfig.maxIndividualActivityScore === 'number' ? loadedConfig.maxIndividualActivityScore : DEFAULT_GRADING_CONFIG.maxIndividualActivityScore,
            maxTotalAccumulatedScore: typeof loadedConfig.maxTotalAccumulatedScore === 'number' ? loadedConfig.maxTotalAccumulatedScore : DEFAULT_GRADING_CONFIG.maxTotalAccumulatedScore,
            maxExamScore: typeof loadedConfig.maxExamScore === 'number' ? loadedConfig.maxExamScore : DEFAULT_GRADING_CONFIG.maxExamScore,
          };
          setGradingConfig(validatedConfig);
        } else {
          setGradingConfig(DEFAULT_GRADING_CONFIG);
        }
      } catch (error) {
        console.error("Error fetching grading configuration:", error);
        setGradingConfig(DEFAULT_GRADING_CONFIG);
        toast({ title: "Error Loading Config", description: "Could not load grading settings. Using defaults.", variant: "destructive" });
      } finally {
        setIsLoadingGradingConfig(false);
      }
    };
    fetchGradingConfig();
  }, [toast]);

  const fetchStudentAndGroupData = useCallback(async () => {
    if (isLoadingGradingConfig) {
        return;
    }

    setIsLoadingStudents(true);
    setIsLoadingGroups(true);
    try {
      const studentQuery = query(collection(db, 'students'));
      const studentsSnapshot = await getDocs(studentQuery);
      const studentData = studentsSnapshot.docs.map(docSnap => {
        const student = { id: docSnap.id, ...docSnap.data() } as User;
        const studentCalculatedGrades: Partial<StudentWithDetailedGrades> = {};
        const partialTotalsArray: (number | null)[] = [];

        for (let i = 1; i <= gradingConfig.numberOfPartials; i++) {
          const partialKey = `partial${i}` as keyof NonNullable<User['grades']>;
          const partialData = student.grades?.[partialKey];
          const accTotalKey = `calculatedAccumulatedTotalP${i}` as keyof StudentWithDetailedGrades;
          (studentCalculatedGrades as any)[accTotalKey] = calculateAccumulatedTotal(partialData?.accumulatedActivities, gradingConfig);
          const partialTotalKey = `calculatedPartial${i}Total` as keyof StudentWithDetailedGrades;
          const currentPartialTotal = calculatePartialTotal(partialData, gradingConfig);
          (studentCalculatedGrades as any)[partialTotalKey] = currentPartialTotal;
          if (typeof currentPartialTotal === 'number') {
            partialTotalsArray.push(currentPartialTotal);
          } else {
             partialTotalsArray.push(null); 
          }
        }
        
        const relevantPartialTotals = partialTotalsArray.slice(0, gradingConfig.numberOfPartials);
        if (relevantPartialTotals.length === gradingConfig.numberOfPartials && relevantPartialTotals.every(t => typeof t === 'number')) {
            studentCalculatedGrades.calculatedFinalGrade = (relevantPartialTotals.reduce((sum, current) => sum + (current as number), 0) / gradingConfig.numberOfPartials);
        } else {
            studentCalculatedGrades.calculatedFinalGrade = null;
        }
        return { ...student, ...studentCalculatedGrades } as StudentWithDetailedGrades;
      });
      setAllStudentsData(studentData);
      setIsLoadingStudents(false);

      const groupsSnapshot = await getDocs(collection(db, 'groups'));
      setAllGroupsData(groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group)));
      setIsLoadingGroups(false);

    } catch (error) {
      console.error("Error fetching student/group data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load student or group data.', variant: 'destructive' });
      setIsLoadingStudents(false);
      setIsLoadingGroups(false);
    }
  }, [toast, gradingConfig, isLoadingGradingConfig]);

  useEffect(() => {
    if (!isLoadingGradingConfig) {
        fetchStudentAndGroupData();
    }
  }, [fetchStudentAndGroupData, isLoadingGradingConfig]);

  const studentsForFilterDropdown = useMemo(() => {
    if (selectedGroupId === 'all') {
      return allStudentsData;
    }
    const group = allGroupsData.find(g => g.id === selectedGroupId);
    if (group?.studentIds) {
      return allStudentsData.filter(s => group.studentIds.includes(s.id));
    }
    return [];
  }, [allStudentsData, allGroupsData, selectedGroupId]);

  const studentsToDisplayInTable = useMemo(() => {
    if (selectedStudentId !== 'all') {
      const student = allStudentsData.find(s => s.id === selectedStudentId);
      return student ? [student] : [];
    }
    return studentsForFilterDropdown;
  }, [allStudentsData, selectedStudentId, studentsForFilterDropdown]);

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
      badgeClassName += scoreValue >= gradingConfig.passingGrade 
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

  const handleExportToXLSX = () => {
    if (isLoading || studentsToDisplayInTable.length === 0) {
      toast({ title: "No data to export", description: "Please filter to display some students or wait for data to load.", variant: "default" });
      return;
    }

    const worksheetData: (string | number | null)[][] = [];
    const merges: XLSX.Range[] = [];
    const numPartials = gradingConfig.numberOfPartials;
    const colsPerPartial = MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2; // Activities + Exam + Partial Total

    // Row 1: Merged Partial Names
    const headerRow1: (string | number | null)[] = ["", ""]; // Nombres, Teléfono
    let currentCellIndex = 2;
    for (let i = 1; i <= numPartials; i++) {
      const pName = `${i}${i === 1 ? 'er' : i === 2 ? 'do' : i === 3 ? 'er' : 'to'} Parcial`;
      headerRow1.push(pName);
      merges.push({ s: { r: 0, c: currentCellIndex }, e: { r: 0, c: currentCellIndex + colsPerPartial - 1 } });
      for (let j = 1; j < colsPerPartial; j++) headerRow1.push(""); // Empty cells for merge
      currentCellIndex += colsPerPartial;
    }
    headerRow1.push("Nota Final");
    worksheetData.push(headerRow1);

    // Row 2: Main Data Headers
    const headerRow2: (string | number | null)[] = ["Nombres", "Teléfono"];
    currentCellIndex = 2;
    for (let i = 1; i <= numPartials; i++) {
      headerRow2.push("Acumulado");
      merges.push({ s: { r: 1, c: currentCellIndex }, e: { r: 1, c: currentCellIndex + MAX_ACCUMULATED_ACTIVITIES_DISPLAY - 1 } });
      for (let j = 1; j < MAX_ACCUMULATED_ACTIVITIES_DISPLAY; j++) headerRow2.push("");
      headerRow2.push("Examen");
      headerRow2.push("Nota Parcial");
      currentCellIndex += colsPerPartial;
    }
    headerRow2.push("NF");
    worksheetData.push(headerRow2);

    // Row 3: Sub-headers (Evaluación, Activity Labels)
    const headerRow3: (string | number | null)[] = ["Evaluación", ""]; // Teléfono is blank
    for (let i = 1; i <= numPartials; i++) {
      for (let j = 1; j <= MAX_ACCUMULATED_ACTIVITIES_DISPLAY; j++) {
        headerRow3.push(`Act. ${j}`);
      }
      headerRow3.push(""); // For Examen
      headerRow3.push(`${i}${i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th'}`); // For Nota Parcial
    }
    headerRow3.push(""); // For NF
    worksheetData.push(headerRow3);

    // Row 4: Puntuación (Max Scores)
    const headerRow4: (string | number | null)[] = ["Puntuación", ""]; // Teléfono is blank
    for (let i = 1; i <= numPartials; i++) {
      for (let j = 1; j <= MAX_ACCUMULATED_ACTIVITIES_DISPLAY; j++) {
        headerRow4.push(gradingConfig.maxIndividualActivityScore);
      }
      headerRow4.push(gradingConfig.maxExamScore);
      headerRow4.push(gradingConfig.maxTotalAccumulatedScore + gradingConfig.maxExamScore);
    }
    headerRow4.push(100); // Max Final Grade
    worksheetData.push(headerRow4);

    // Student Data Rows
    studentsToDisplayInTable.forEach(student => {
      const studentRow: (string | number | null)[] = [student.name, student.phoneNumber || ""];
      for (let i = 1; i <= numPartials; i++) {
        const partialKey = `partial${i}` as keyof User['grades'];
        const partialData = student.grades?.[partialKey];
        
        for (let j = 0; j < MAX_ACCUMULATED_ACTIVITIES_DISPLAY; j++) {
          studentRow.push(partialData?.accumulatedActivities?.[j]?.score ?? null);
        }
        studentRow.push(partialData?.exam?.score ?? null);
        const partialTotalKey = `calculatedPartial${i}Total` as keyof StudentWithDetailedGrades;
        studentRow.push((student as any)[partialTotalKey] ?? null);
      }
      studentRow.push(student.calculatedFinalGrade ?? null);
      worksheetData.push(studentRow);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
    worksheet['!merges'] = merges;
    
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte Notas Parciales");

    const today = new Date().toISOString().split('T')[0];
    try {
      XLSX.writeFile(workbook, `Reporte_Notas_Parciales_${today}.xlsx`);
      toast({ title: "Export Successful", description: "Report exported to XLSX with custom template." });
    } catch (error) {
      console.error("Error exporting to XLSX:", error);
      toast({ title: "Export Failed", description: "Could not generate the XLSX file.", variant: "destructive" });
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

  const currentNumberOfPartials = Math.max(1, gradingConfig.numberOfPartials);
  const partialHeaders = [];
  for (let i = 1; i <= currentNumberOfPartials; i++) {
    partialHeaders.push(
      <TableHead 
        key={`main-header-p${i}`} 
        colSpan={MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2} 
        className={`text-center py-2 sticky top-0 z-20 ${
          i === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200' :
          i === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200' :
          i === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-800 dark:text-orange-200' :
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
            pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
            pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
            pNum === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
            'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'
          }`}>Ac. {i + 1}</TableHead>
      );
    }
    subPartialHeaders.push(
      <TableHead key={`p${pNum}-exam`} className={`text-center text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
          pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
          pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
          pNum === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
          'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'
        }`}>Exam</TableHead>
    );
    subPartialHeaders.push(
      <TableHead key={`p${pNum}-total`} className={`text-center font-bold text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
         pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
         pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
         pNum === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
         'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'
        }`}>Total Parcial</TableHead>
    );
  }
  const totalColumns = 2 + (currentNumberOfPartials * (MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2)) + 1;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><ClipboardList className="h-6 w-6 text-primary" /> Partial Grades Report</CardTitle>
              <CardDescription>
                View partial grades for students. Filter by group and/or individual student.
                Configuration: {currentNumberOfPartials} partials, passing with {gradingConfig.passingGrade}pts.
              </CardDescription>
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={handleExportToXLSX}
                disabled={isLoading || studentsToDisplayInTable.length === 0}
                className="gap-1.5 text-sm"
              >
                <Download className="size-3.5" />
                Export to Excel (.xlsx)
            </Button>
          </div>
           {gradingConfig.numberOfPartials < 1 && (
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
                disabled={isLoadingGroups}
              >
                <SelectTrigger id="group-filter-report">
                  <SelectValue placeholder="Select a group" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Groups</SelectItem>
                  {allGroupsData.map((group) => (
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
                disabled={isLoadingStudents || studentsForFilterDropdown.length === 0}
              >
                <SelectTrigger id="student-filter-report">
                  <SelectValue placeholder="Select a student" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    {selectedGroupId === 'all' ? 'All Students (Global)' : 'All Students in Selected Group'}
                  </SelectItem>
                  {studentsForFilterDropdown.map((student) => (
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
                <TableHead rowSpan={2} className="align-bottom min-w-[80px] sticky left-[150px] bg-card z-30">Actions</TableHead>
                {partialHeaders}
                <TableHead rowSpan={2} className="text-center align-bottom min-w-[100px] bg-blue-100 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 sticky top-0 z-20">Final Grade</TableHead>
              </TableRow>
              <TableRow>
                {subPartialHeaders}
              </TableRow>
            </TableHeader>
            <TableBody>
              {studentsToDisplayInTable.length > 0 ? studentsToDisplayInTable.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="font-medium sticky left-0 bg-card z-10 whitespace-nowrap">{student.name}</TableCell>
                  <TableCell className="sticky left-[150px] bg-card z-10">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => handleOpenEditGrades(student.id)}>
                                <NotebookPen className="h-4 w-4" />
                                <span className="sr-only">Edit Grades for {student.name}</span>
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top"><p>Edit Grades for {student.name}</p></TooltipContent>
                    </Tooltip>
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
                      No students found matching your criteria, or no grades recorded for them.
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

    