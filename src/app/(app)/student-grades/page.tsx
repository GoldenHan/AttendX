
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
import type { User, PartialScores, ActivityScore, ExamScore, Group, GradingConfiguration } from '@/types';
// DEFAULT_GRADING_CONFIG import removed
import { db } from '@/lib/firebase';
import { collection, getDocs, query, doc, getDoc, where } from 'firebase/firestore'; 
import { Loader2, ClipboardCheck, NotebookPen, Search, AlertTriangle } from 'lucide-react';
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
import { useAuth } from '@/contexts/AuthContext';

interface StudentWithDetailedGrades extends User {
  calculatedAccumulatedTotalP1?: number | null;
  calculatedAccumulatedTotalP2?: number | null;
  calculatedAccumulatedTotalP3?: number | null;
  calculatedAccumulatedTotalP4?: number | null;
  calculatedPartial1Total?: number | null;
  calculatedPartial2Total?: number | null;
  calculatedPartial3Total?: number | null;
  calculatedPartial4Total?: number | null;
  calculatedFinalGrade?: number | null;
}

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

export default function StudentGradesPage() {
  const [allStudents, setAllStudents] = useState<StudentWithDetailedGrades[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  // gradingConfig state removed, will use from AuthContext
  // isLoadingGradingConfig state removed
  const [isLoadingStudents, setIsLoadingStudents] = useState(true);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);

  const { toast } = useToast();
  const router = useRouter();
  const { firestoreUser, authUser, gradingConfig, loading: authLoading } = useAuth(); // Get gradingConfig and authLoading from AuthContext

  const isLoading = isLoadingStudents || isLoadingGroups || authLoading || !firestoreUser; // Updated loading check
  const isStudentRole = firestoreUser?.role === 'student';

  // useEffect for fetching gradingConfig removed

  const fetchData = useCallback(async () => {
    if (authLoading || !firestoreUser?.institutionId) return; // Wait for auth and institution ID

    setIsLoadingStudents(true);
    setIsLoadingGroups(true);
    try {
      let studentData: StudentWithDetailedGrades[] = [];
      if (isStudentRole && authUser?.uid) {
        const studentDocRef = doc(db, 'users', authUser.uid); // Ensure it's users collection
        const studentDocSnap = await getDoc(studentDocRef);
        if (studentDocSnap.exists() && studentDocSnap.data()?.institutionId === firestoreUser.institutionId) {
           const student = { id: studentDocSnap.id, ...studentDocSnap.data() } as User;
           studentData = [{ ...student } as StudentWithDetailedGrades];
        }
      } else if (!isStudentRole) {
        const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', firestoreUser.institutionId));
        const studentsSnapshot = await getDocs(studentsQuery);
        studentData = studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User) as StudentWithDetailedGrades);
      }

      const processedStudentData = studentData.map(student => {
        const studentCalculatedGrades: Partial<StudentWithDetailedGrades> = {};
        const partialTotalsArray: (number | null)[] = [];
        for (let i = 1; i <= gradingConfig.numberOfPartials; i++) { // Use gradingConfig from context
          const partialKey = `partial${i}` as keyof NonNullable<User['gradesByLevel']>[string];
          const currentLevel = student.level || 'Beginner'; 
          const partialData = student.gradesByLevel?.[currentLevel]?.[partialKey];
          
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
        return { ...student, ...studentCalculatedGrades };
      });
      setAllStudents(processedStudentData);
      setIsLoadingStudents(false);

      if (!isStudentRole) {
        const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', firestoreUser.institutionId));
        const groupsSnapshot = await getDocs(groupsQuery);
        const fetchedGroups = groupsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Group));
        setAllGroups(fetchedGroups);
        if (firestoreUser.role === 'teacher') {
          const teacherGroups = fetchedGroups.filter(g => g.teacherId === firestoreUser.id);
          if (teacherGroups.length > 0) setSelectedGroupId(teacherGroups[0].id);
          else setSelectedGroupId('none');
        }
      } else {
        setAllGroups([]); 
      }
      setIsLoadingGroups(false);

    } catch (error) {
      console.error("Error fetching data:", error);
      toast({ title: 'Error fetching data', description: 'Could not load student grades or groups.', variant: 'destructive' });
      setIsLoadingStudents(false);
      setIsLoadingGroups(false);
    }
  }, [toast, gradingConfig, authLoading, firestoreUser, authUser, isStudentRole]); // Added gradingConfig, authLoading

  useEffect(() => {
    if (!authLoading && firestoreUser) { // Check authLoading
        fetchData();
    }
  }, [fetchData, authLoading, firestoreUser, gradingConfig.numberOfPartials]); // Added authLoading

  const availableGroupsForFilter = useMemo(() => {
    if (!firestoreUser || isStudentRole) return [];
    if (firestoreUser.role === 'teacher') {
      return allGroups.filter(g => g.teacherId === firestoreUser.id);
    }
    return allGroups;
  }, [allGroups, firestoreUser, isStudentRole]);

  const studentsToDisplay = useMemo(() => {
    if (isLoading || !firestoreUser) return [];
    if (isStudentRole) return allStudents; 

    let filtered = allStudents;
    if (firestoreUser.role === 'teacher') {
      if (selectedGroupId === 'none') return [];
      const teacherActualSelectedGroupId = selectedGroupId === 'all' 
        ? (availableGroupsForFilter.length === 1 ? availableGroupsForFilter[0].id : 'all_teacher_groups')
        : selectedGroupId;

      if (teacherActualSelectedGroupId === 'all_teacher_groups' && availableGroupsForFilter.length > 0){
         const studentIdsInTeacherGroups = availableGroupsForFilter.reduce((acc, group) => {
            if (Array.isArray(group.studentIds)) group.studentIds.forEach(id => acc.add(id));
            return acc;
        }, new Set<string>());
        filtered = filtered.filter(s => studentIdsInTeacherGroups.has(s.id));
      } else if (teacherActualSelectedGroupId !== 'all_teacher_groups') {
        const group = allGroups.find(g => g.id === teacherActualSelectedGroupId);
        if (group?.studentIds && group.teacherId === firestoreUser.id) {
            filtered = filtered.filter(s => group.studentIds.includes(s.id));
        } else {
            filtered = []; 
        }
      } else {
        filtered = []; 
      }
    } else { 
        if (selectedGroupId && selectedGroupId !== 'all') {
            const group = allGroups.find(g => g.id === selectedGroupId);
            if (group?.studentIds) filtered = filtered.filter(s => group.studentIds.includes(s.id));
            else filtered = [];
        }
    }
    if (searchTerm.trim()) {
      filtered = filtered.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }
    return filtered;
  }, [allStudents, allGroups, selectedGroupId, searchTerm, isLoading, firestoreUser, isStudentRole, availableGroupsForFilter]);

  const handleOpenEditGrades = (studentId: string) => {
    if (isStudentRole) return; 
    if (firestoreUser?.role === 'teacher') {
        const isStudentInTheirGroup = studentsToDisplay.some(s => s.id === studentId);
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
      return (<Tooltip><TooltipTrigger asChild><span>{badgeElement}</span></TooltipTrigger><TooltipContent side="top"><p>{displayName}</p></TooltipContent></Tooltip>);
    }
    return badgeElement;
  };

  const renderAccumulatedActivitiesScores = (activities?: ActivityScore[] | null, partialKey?: string) => {
    const cells = [];
    for (let i = 0; i < MAX_ACCUMULATED_ACTIVITIES_DISPLAY; i++) {
      const activity = activities?.[i];
      cells.push(<TableCell key={`${partialKey}-acc-${i}`} className="text-center">{getScoreDisplay(activity?.score, activity?.name, `Ac. ${i + 1}`)}</TableCell>);
    }
    return cells;
  };
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> 
            {isStudentRole ? "My Grades" : "Student Grades"}
          </CardTitle>
          <CardDescription>Loading grading configuration and student data...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading...</p>
        </CardContent>
      </Card>
    );
  }

  const currentNumberOfPartials = Math.max(1, gradingConfig.numberOfPartials); // Use gradingConfig from context
  const partialHeaders = [];
  for (let i = 1; i <= currentNumberOfPartials; i++) {
    partialHeaders.push(
      <TableHead key={`main-header-p${i}`} colSpan={MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2} className={`text-center py-2 sticky top-0 z-20 ${
          i === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-800 dark:text-yellow-200' :
          i === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-800 dark:text-green-200' :
          i === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-800 dark:text-orange-200' :
          'bg-purple-100 dark:bg-purple-800/50 text-purple-800 dark:text-purple-200'}`}>
        {i}{i === 1 ? 'st' : i === 2 ? 'nd' : i === 3 ? 'rd' : 'th'} Partial
      </TableHead>);
  }
  const subPartialHeaders = [];
   for (let pNum = 1; pNum <= currentNumberOfPartials; pNum++) {
    for (let i = 0; i < MAX_ACCUMULATED_ACTIVITIES_DISPLAY; i++) {
      subPartialHeaders.push(<TableHead key={`p${pNum}-acc${i+1}`} className={`text-center text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
            pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
            pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
            pNum === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
            'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'}`}>Ac. {i + 1}</TableHead>);
    }
    subPartialHeaders.push(<TableHead key={`p${pNum}-exam`} className={`text-center text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
          pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
          pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
          pNum === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
          'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'}`}>Exam</TableHead>);
    subPartialHeaders.push(<TableHead key={`p${pNum}-total`} className={`text-center font-bold text-xs whitespace-nowrap py-1 sticky top-0 z-20 ${
         pNum === 1 ? 'bg-yellow-100 dark:bg-yellow-800/50 text-yellow-700 dark:text-yellow-300' :
         pNum === 2 ? 'bg-green-100 dark:bg-green-800/50 text-green-700 dark:text-green-300' :
         pNum === 3 ? 'bg-orange-100 dark:bg-orange-800/50 text-orange-700 dark:text-orange-300' :
         'bg-purple-100 dark:bg-purple-800/50 text-purple-700 dark:text-purple-300'}`}>Total Partial</TableHead>);
  }
  const totalColumns = (isStudentRole ? 1 : 2) + (currentNumberOfPartials * (MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2)) + 1;

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" /> 
            {isStudentRole ? `My Grades - Level: ${firestoreUser?.level || 'N/A'}` : "Student Grades"}
          </CardTitle>
           <CardDescription>
            {isStudentRole 
              ? `Viewing your grades for level: ${firestoreUser?.level || 'N/A'}. Configuration: ${currentNumberOfPartials} partials, passing with ${gradingConfig.passingGrade}pts.`
              : `Configuration: ${currentNumberOfPartials} partials, passing with ${gradingConfig.passingGrade}pts. Max ${MAX_ACCUMULATED_ACTIVITIES_DISPLAY} activities (total ${gradingConfig.maxTotalAccumulatedScore}pts), exam ${gradingConfig.maxExamScore}pts per partial. Click ${!isStudentRole ? <NotebookPen className="inline-block h-4 w-4" /> : ''} to manage.`
            }
          </CardDescription>
           {gradingConfig.numberOfPartials < 1 && ( // Use gradingConfig from context
            <div className="mt-2 p-3 border border-red-500/50 bg-red-50 dark:bg-red-900/30 rounded-md text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0"/><p>Warning: Number of partials configured to {gradingConfig.numberOfPartials}. Displaying 1 partial by default. Check "App Settings".</p>
            </div>
          )}
          {!isStudentRole && (
            <div className="mt-4 flex flex-col sm:flex-row gap-4">
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="group-filter-grades">Filter by Group</Label>
                <Select value={selectedGroupId} onValueChange={setSelectedGroupId} disabled={isLoadingGroups || (firestoreUser?.role === 'teacher' && availableGroupsForFilter.length === 0)}>
                  <SelectTrigger id="group-filter-grades"><SelectValue placeholder="Select a group or 'All'" /></SelectTrigger>
                  <SelectContent>
                    {firestoreUser?.role !== 'teacher' && <SelectItem value="all">All Groups</SelectItem>}
                    {firestoreUser?.role === 'teacher' && availableGroupsForFilter.length === 0 && <SelectItem value="none" disabled>No groups assigned</SelectItem>}
                    {firestoreUser?.role === 'teacher' && availableGroupsForFilter.length > 1 && <SelectItem value="all">All My Groups</SelectItem>}
                    {availableGroupsForFilter.map((group) => (<SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[200px]">
                <Label htmlFor="search-student-grades">Search Student by Name</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input id="search-student-grades" type="search" placeholder="Enter student name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-8 w-full" disabled={isLoadingStudents}/>
                </div>
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-card z-20">
              <TableRow>
                <TableHead rowSpan={2} className="align-bottom min-w-[150px] sticky left-0 bg-card z-30">Student Name</TableHead>
                {!isStudentRole && <TableHead rowSpan={2} className="align-bottom min-w-[80px] sticky left-[150px] bg-card z-30">Actions</TableHead>}
                {partialHeaders}
                <TableHead rowSpan={2} className={`text-center align-bottom min-w-[100px] bg-blue-100 dark:bg-blue-800/50 text-blue-800 dark:text-blue-200 sticky top-0 z-20`}>Final Grade</TableHead>
              </TableRow>
              <TableRow>{subPartialHeaders}</TableRow>
            </TableHeader>
            <TableBody>
              {studentsToDisplay.length > 0 ? studentsToDisplay.map((student) => {
                 const currentLevelKey = student.level || 'Beginner'; 
                 const gradesForLevel = student.gradesByLevel?.[currentLevelKey];
                 return (
                <TableRow key={student.id}>
                  <TableCell className="font-medium sticky left-0 bg-card z-10 whitespace-nowrap">{student.name}</TableCell>
                  {!isStudentRole && (
                    <TableCell className="sticky left-[150px] bg-card z-10">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenEditGrades(student.id)}><NotebookPen className="h-4 w-4" /><span className="sr-only">Edit Grades</span></Button>
                    </TableCell>
                  )}
                  {Array.from({ length: currentNumberOfPartials }).map((_, index) => {
                    const pNum = index + 1;
                    const partialKeyFirestore = `partial${pNum}` as keyof NonNullable<User['gradesByLevel']>[string];
                    const partialData = gradesForLevel?.[partialKeyFirestore];
                    const calculatedPartialTotalKey = `calculatedPartial${pNum}Total` as keyof StudentWithDetailedGrades;
                    const studentPartialTotal = (student as any)[calculatedPartialTotalKey];
                    return (
                      <React.Fragment key={`student-${student.id}-p${pNum}`}>
                        {renderAccumulatedActivitiesScores(partialData?.accumulatedActivities, `p${pNum}`)}
                        <TableCell className="text-center">{getScoreDisplay(partialData?.exam?.score, partialData?.exam?.name, "Exam")}</TableCell>
                        <TableCell className="text-center font-semibold">{getScoreDisplay(studentPartialTotal, null, null, true)}</TableCell>
                      </React.Fragment>
                    );
                  })}
                  <TableCell className="text-center font-bold bg-blue-50 dark:bg-blue-900/30">{getScoreDisplay(student.calculatedFinalGrade, null, null, false, true)}</TableCell>
                </TableRow>
              )}) : (
                 <TableRow>
                    <TableCell colSpan={totalColumns} className="text-center h-24">
                      {isStudentRole 
                        ? "Your grades are not yet available or not recorded for your current level." 
                        : (!selectedGroupId || selectedGroupId === 'all' || (firestoreUser?.role === 'teacher' && availableGroupsForFilter.length > 1 && selectedGroupId === 'all')) && !searchTerm.trim()
                          ? (firestoreUser?.role === 'teacher' && availableGroupsForFilter.length === 0 ? "No groups assigned to you." : "Select a group or search for a student.")
                          : "No students found matching criteria."
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
