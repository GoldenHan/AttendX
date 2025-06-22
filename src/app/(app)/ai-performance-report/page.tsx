
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Sparkles, Clipboard, UserCircle, FilePenLine } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Group, User, AttendanceRecord as AttendanceRecordType, Session, PartialScores, GradingConfiguration, StudentGradeStructure } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { generateStudentPerformanceReport, type StudentPerformanceOutput } from '@/ai/flows/student-performance-report';
import ReactMarkdown from 'react-markdown';

// Helper functions for grade calculation (adapted from other pages)
const calculateAccumulatedTotal = (activities: PartialScores['accumulatedActivities'] | undefined | null, config: GradingConfiguration): number => {
    if (!activities) return 0;
    return Math.min(activities.reduce((sum, act) => sum + (act.score || 0), 0), config.maxTotalAccumulatedScore);
};
const calculatePartialTotal = (partial: PartialScores | undefined | null, config: GradingConfiguration): number => {
    if (!partial) return 0;
    const accumulated = calculateAccumulatedTotal(partial.accumulatedActivities, config);
    const exam = partial.exam?.score || 0;
    return accumulated + exam;
};

export default function AiPerformanceReportPage() {
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allAttendance, setAllAttendance] = useState<AttendanceRecordType[]>([]);
  
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [selectedLevelName, setSelectedLevelName] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [reportResult, setReportResult] = useState<StudentPerformanceOutput | null>(null);

  const { toast } = useToast();
  const { firestoreUser, gradingConfig, loading: authLoading } = useAuth();

  const fetchData = useCallback(async () => {
    if (authLoading || !firestoreUser?.institutionId) {
      setIsLoadingData(false);
      return;
    }
    setIsLoadingData(true);
    try {
      const institutionId = firestoreUser.institutionId;
      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', institutionId));
      const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', institutionId));
      const attendanceQuery = query(collection(db, 'attendanceRecords'), where('institutionId', '==', institutionId));

      const [groupsSnap, studentsSnap, attendanceSnap] = await Promise.all([
        getDocs(groupsQuery),
        getDocs(studentsQuery),
        getDocs(attendanceQuery),
      ]);

      const fetchedGroups = groupsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      const fetchedStudents = studentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      const fetchedAttendance = attendanceSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecordType));

      if(firestoreUser.role === 'teacher') {
          setAllGroups(fetchedGroups.filter(g => g.teacherId === firestoreUser.id));
      } else if (firestoreUser.role === 'supervisor') {
          setAllGroups(fetchedGroups.filter(g => g.sedeId === firestoreUser.sedeId));
      } else {
          setAllGroups(fetchedGroups);
      }
      
      setAllStudents(fetchedStudents);
      setAllAttendance(fetchedAttendance);

    } catch (error) {
      console.error("Error fetching data for AI report:", error);
      toast({ title: 'Error', description: 'Could not load necessary data.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  }, [authLoading, firestoreUser, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const studentsInSelectedGroup = useMemo(() => {
    if (!selectedGroupId) return [];
    const group = allGroups.find(g => g.id === selectedGroupId);
    if (!group) return [];
    return allStudents.filter(s => group.studentIds.includes(s.id));
  }, [selectedGroupId, allGroups, allStudents]);
  
  const selectedStudent = useMemo(() => {
    return allStudents.find(s => s.id === selectedStudentId);
  }, [selectedStudentId, allStudents]);

  const levelsForSelectedStudent = useMemo(() => {
    if (!selectedStudent || !selectedStudent.gradesByLevel) return [];
    return Object.keys(selectedStudent.gradesByLevel);
  }, [selectedStudent]);
  
  useEffect(() => {
    setSelectedStudentId('');
    setSelectedLevelName('');
    setReportResult(null);
  }, [selectedGroupId]);
  
  useEffect(() => {
    setSelectedLevelName('');
    setReportResult(null);
  }, [selectedStudentId]);

  const handleGenerate = async () => {
    if (!selectedStudent || !selectedLevelName) {
      toast({ title: 'Missing Information', description: 'Please select a student and a level.', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    setReportResult(null);

    try {
      const studentData = selectedStudent;
      const levelGrades = studentData.gradesByLevel?.[selectedLevelName];
      if (!levelGrades) throw new Error('No grade data for this level.');

      // 1. Format Grades Summary
      let gradesSummary = `Level: ${selectedLevelName}. `;
      const partialTotals: number[] = [];
      for (let i = 1; i <= gradingConfig.numberOfPartials; i++) {
        const key = `partial${i}` as keyof StudentGradeStructure;
        const partialData = levelGrades[key];
        if (partialData) {
            const total = calculatePartialTotal(partialData, gradingConfig);
            gradesSummary += `Partial ${i} Total: ${total.toFixed(1)}/${(gradingConfig.maxTotalAccumulatedScore + gradingConfig.maxExamScore)}. `;
            partialTotals.push(total);
        }
      }
      if (partialTotals.length === gradingConfig.numberOfPartials) {
          const finalGrade = partialTotals.reduce((sum, val) => sum + val, 0) / gradingConfig.numberOfPartials;
          gradesSummary += `Final Grade: ${finalGrade.toFixed(2)}/${(gradingConfig.maxTotalAccumulatedScore + gradingConfig.maxExamScore)}.`;
      }
      
      // 2. Format Attendance Summary
      const studentAttendance = allAttendance.filter(rec => rec.userId === studentData.id);
      const presentCount = studentAttendance.filter(r => r.status === 'present').length;
      const absentCount = studentAttendance.filter(r => r.status === 'absent').length;
      const lateCount = studentAttendance.filter(r => r.status === 'late').length;
      const totalRecords = presentCount + absentCount + lateCount;
      const attendanceRate = totalRecords > 0 ? ((presentCount + lateCount) / totalRecords) * 100 : 100;
      const attendanceSummary = `Present: ${presentCount}, Absent: ${absentCount}, Late: ${lateCount}. Attendance Rate: ${attendanceRate.toFixed(0)}%.`;

      // 3. Format Teacher Observations
      const teacherObservations = studentAttendance
        .filter(r => r.status === 'absent' && r.observation)
        .map(r => `- Absence observation: ${r.observation}`)
        .join('\n') || 'No specific observations recorded for absences.';

      toast({ title: "Generating Report...", description: "The AI is analyzing the student's data. This may take a moment." });

      const result = await generateStudentPerformanceReport({
        studentName: studentData.name,
        levelName: selectedLevelName,
        gradesSummary: gradesSummary,
        attendanceSummary: attendanceSummary,
        teacherObservations: teacherObservations,
      });

      setReportResult(result);
      toast({ title: 'Report Generated!', description: 'AI performance report is ready for review.' });

    } catch (error) {
      console.error('AI Report Generation Error:', error);
      toast({ title: 'Generation Failed', description: 'An error occurred while generating the report. Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to Clipboard!', description: 'The report has been copied.' });
  };
  
  if (authLoading || isLoadingData) {
    return <Card><CardHeader><CardTitle>AI Performance Report</CardTitle></CardHeader><CardContent className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading data...</p></CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FilePenLine className="h-6 w-6 text-primary" />AI Performance Report</CardTitle>
        <CardDescription>Select a student and a level to generate an AI-powered performance analysis, including grades, attendance, and recommendations.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label htmlFor="group-select">1. Select Group</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId} disabled={allGroups.length === 0}>
              <SelectTrigger id="group-select"><SelectValue placeholder="Select a group..." /></SelectTrigger>
              <SelectContent>{allGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="student-select">2. Select Student</Label>
            <Select value={selectedStudentId} onValueChange={setSelectedStudentId} disabled={!selectedGroupId}>
              <SelectTrigger id="student-select"><SelectValue placeholder="Select a student..." /></SelectTrigger>
              <SelectContent>{studentsInSelectedGroup.map(s => <SelectItem key={s.id} value={s.id}><UserCircle className="inline-block mr-2 h-4 w-4"/>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="level-select">3. Select Level</Label>
            <Select value={selectedLevelName} onValueChange={setSelectedLevelName} disabled={!selectedStudentId}>
              <SelectTrigger id="level-select"><SelectValue placeholder="Select a level to evaluate..." /></SelectTrigger>
              <SelectContent>{levelsForSelectedStudent.map(level => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-center">
            <Button onClick={handleGenerate} disabled={isLoading || !selectedStudentId || !selectedLevelName}>
                {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><Sparkles className="mr-2 h-4 w-4" />Generate Report</>}
            </Button>
        </div>
        {reportResult && (
          <Card className="mt-6 bg-secondary/20">
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                  Performance Report for: {selectedStudent?.name}
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(reportResult.report)}>
                      <Clipboard className="mr-2 h-4 w-4"/> Copy Text
                  </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm dark:prose-invert max-w-none bg-background p-4 rounded-md border">
                  <ReactMarkdown>{reportResult.report}</ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        )}
      </CardContent>
    </Card>
  );
}
