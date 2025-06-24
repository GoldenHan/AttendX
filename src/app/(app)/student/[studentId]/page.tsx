
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import type { User, Group, Sede, Payment, AttendanceRecord, ClassroomItemSubmission, StudentGradeStructure, GradingConfiguration, PartialScores, ActivityScore } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Loader2, ArrowLeft, Mail, Phone, GraduationCap, Calendar, Group as GroupIcon, NotebookPen, DollarSign, ListChecks, Paperclip } from 'lucide-react';
import { format, parseISO } from 'date-fns';

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


interface StudentProfileData {
  student: User;
  group: Group | null;
  sede: Sede | null;
  payments: Payment[];
  attendance: AttendanceRecord[];
  submissions: ClassroomItemSubmission[];
  // grades are already in student object
}

export default function StudentProfilePage() {
  const { studentId } = useParams();
  const router = useRouter();
  const { firestoreUser, gradingConfig } = useAuth();
  
  const [profileData, setProfileData] = useState<StudentProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!studentId || !firestoreUser?.institutionId) {
      setError("Invalid request.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Fetch Student
      const studentDocRef = doc(db, 'users', studentId as string);
      const studentSnap = await getDoc(studentDocRef);
      if (!studentSnap.exists() || studentSnap.data().institutionId !== firestoreUser.institutionId) {
        throw new Error("Student not found or access denied.");
      }
      const student = { id: studentSnap.id, ...studentSnap.data() } as User;

      // Fetch Group, Sede
      let group: Group | null = null;
      let sede: Sede | null = null;
      const groupsQuery = query(collection(db, 'groups'), where('studentIds', 'array-contains', studentId), where('institutionId', '==', firestoreUser.institutionId));
      const groupsSnap = await getDocs(groupsQuery);
      if (!groupsSnap.empty) {
        group = { id: groupsSnap.docs[0].id, ...groupsSnap.docs[0].data() } as Group;
        if (group.sedeId) {
          const sedeSnap = await getDoc(doc(db, 'sedes', group.sedeId));
          if (sedeSnap.exists()) sede = { id: sedeSnap.id, ...sedeSnap.data() } as Sede;
        }
      }
      
      // Fetch Payments
      const paymentsQuery = query(collection(db, 'payments'), where('studentId', '==', studentId), orderBy('paymentDate', 'desc'));
      const paymentsSnap = await getDocs(paymentsQuery);
      const payments = paymentsSnap.docs.map(d => ({id: d.id, ...d.data()}) as Payment);

      // Fetch Attendance
      // This can be a heavy query. Consider limiting it.
      const attendanceQuery = query(collection(db, 'attendanceRecords'), where('userId', '==', studentId), orderBy('timestamp', 'desc'), limit(50));
      const attendanceSnap = await getDocs(attendanceQuery);
      const attendance = attendanceSnap.docs.map(d => ({id: d.id, ...d.data()}) as AttendanceRecord);

      // Fetch Submissions
      const submissionsQuery = query(collection(db, 'classroomItemSubmissions'), where('studentId', '==', studentId), orderBy('submittedAt', 'desc'), limit(20));
      const submissionsSnap = await getDocs(submissionsQuery);
      const submissions = submissionsSnap.docs.map(d => ({id: d.id, ...d.data()}) as ClassroomItemSubmission);
      
      setProfileData({ student, group, sede, payments, attendance, submissions });

    } catch (err: any) {
      setError(err.message || "Failed to load student profile.");
    } finally {
      setLoading(false);
    }
  }, [studentId, firestoreUser?.institutionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const attendanceSummary = useMemo(() => {
    if (!profileData) return { present: 0, absent: 0, late: 0, rate: 0 };
    const present = profileData.attendance.filter(r => r.status === 'present').length;
    const absent = profileData.attendance.filter(r => r.status === 'absent').length;
    const late = profileData.attendance.filter(r => r.status === 'late').length;
    const total = present + absent + late;
    const rate = total > 0 ? ((present + late) / total) * 100 : 0;
    return { present, absent, late, rate: rate };
  }, [profileData]);

  if (loading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (error) {
    return <div className="text-center text-destructive p-8">{error}</div>;
  }
  
  if (!profileData) {
     return <div className="text-center text-muted-foreground p-8">No profile data found for this student.</div>;
  }

  const { student, group, sede, payments, submissions } = profileData;

  return (
    <div className="space-y-6">
      <Button variant="outline" onClick={() => router.back()} className="mb-4">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Student List
      </Button>

      <Card>
        <CardHeader className="flex flex-col md:flex-row items-start md:items-center gap-4">
          <Avatar className="h-24 w-24">
            <AvatarImage src={student.photoUrl || undefined} alt={student.name} />
            <AvatarFallback className="text-3xl">{student.name?.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-3xl">{student.name}</CardTitle>
            <CardDescription className="space-y-1 mt-2">
              <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4" /><span>{student.email || 'N/A'}</span></div>
              <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4" /><span>{student.phoneNumber || 'N/A'}</span></div>
              <div className="flex items-center gap-2 text-sm"><GraduationCap className="h-4 w-4" /><span>Level: {student.level || 'N/A'}</span></div>
              <div className="flex items-center gap-2 text-sm"><GroupIcon className="h-4 w-4" /><span>Group: {group?.name || 'Unassigned'}</span></div>
            </CardDescription>
          </div>
           {firestoreUser?.role !== 'caja' && (
              <Button onClick={() => router.push(`/grades-management?studentId=${student.id}`)}>
                 <NotebookPen className="mr-2 h-4 w-4" /> Manage Grades
              </Button>
            )}
        </CardHeader>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-primary" /> Attendance Summary</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div><p className="text-sm text-muted-foreground">Present</p><p className="text-2xl font-bold">{attendanceSummary.present}</p></div>
            <div><p className="text-sm text-muted-foreground">Absent</p><p className="text-2xl font-bold">{attendanceSummary.absent}</p></div>
            <div><p className="text-sm text-muted-foreground">Late</p><p className="text-2xl font-bold">{attendanceSummary.late}</p></div>
            <div><p className="text-sm text-muted-foreground">Attendance Rate</p><p className="text-2xl font-bold text-green-600">{attendanceSummary.rate.toFixed(1)}%</p></div>
          </CardContent>
        </Card>
        
        <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="h-5 w-5 text-primary" /> Payment Summary</CardTitle></CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">Total Paid</p>
                <p className="text-2xl font-bold">${payments.reduce((sum, p) => sum + p.amount, 0).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground mt-2">Latest Payment</p>
                <p>{payments.length > 0 ? `${format(parseISO(payments[0].paymentDate), 'PPP')} for $${payments[0].amount.toFixed(2)}` : 'No payments found.'}</p>
            </CardContent>
        </Card>
      </div>

       <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><NotebookPen className="h-5 w-5 text-primary" /> Grades Overview</CardTitle></CardHeader>
          <CardContent>
              {student.gradesByLevel && Object.keys(student.gradesByLevel).length > 0 ? (
                  <div className="space-y-4">
                      {Object.entries(student.gradesByLevel).map(([level, levelData]) => {
                          let finalGradeSum = 0;
                          let validPartialsCount = 0;
                          for(let i=1; i <= gradingConfig.numberOfPartials; i++) {
                              const partialKey = `partial${i}` as keyof StudentGradeStructure;
                              const partialTotal = calculatePartialTotal(levelData[partialKey], gradingConfig);
                              if (typeof partialTotal === 'number') {
                                  finalGradeSum += partialTotal;
                                  validPartialsCount++;
                              }
                          }
                          const finalGrade = validPartialsCount === gradingConfig.numberOfPartials ? (finalGradeSum / gradingConfig.numberOfPartials) : null;

                          return (
                              <div key={level} className="p-3 border rounded-md">
                                  <h4 className="font-semibold">{level}</h4>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                                      {Array.from({length: gradingConfig.numberOfPartials}).map((_, i) => {
                                          const pKey = `partial${i+1}` as keyof StudentGradeStructure;
                                          const pTotal = calculatePartialTotal(levelData[pKey], gradingConfig);
                                          return <div key={pKey}><Badge variant="secondary">P{i+1}: {typeof pTotal === 'number' ? pTotal.toFixed(1) : 'N/A'}</Badge></div>;
                                      })}
                                       <div>
                                            <Badge variant={finalGrade !== null && finalGrade >= gradingConfig.passingGrade ? 'default' : 'destructive'} className="font-bold">
                                              Final: {typeof finalGrade === 'number' ? finalGrade.toFixed(2) : 'N/A'}
                                            </Badge>
                                       </div>
                                  </div>
                              </div>
                          )
                      })}
                  </div>
              ) : (
                  <p className="text-muted-foreground">No grade data recorded.</p>
              )}
          </CardContent>
      </Card>
      
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Paperclip className="h-5 w-5 text-primary" />Recent Submissions</CardTitle></CardHeader>
        <CardContent>
          {submissions.length > 0 ? (
             <Table>
                <TableHeader><TableRow><TableHead>Assignment</TableHead><TableHead>Submitted</TableHead><TableHead>Grade</TableHead></TableRow></TableHeader>
                <TableBody>
                  {submissions.map(sub => (
                    <TableRow key={sub.id}>
                      <TableCell>{sub.itemId.substring(0,8)}...</TableCell>
                      <TableCell>{format(parseISO(sub.submittedAt), 'PPP p')}</TableCell>
                      <TableCell>{sub.grade ?? 'Not Graded'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
             </Table>
          ) : (
            <p className="text-muted-foreground">No assignment submissions found.</p>
          )}
        </CardContent>
      </Card>
      
    </div>
  );
}
