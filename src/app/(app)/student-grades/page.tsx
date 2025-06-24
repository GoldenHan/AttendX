
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
import type { User, PartialScores, ActivityScore, ExamScore, Group, GradingConfiguration, StudentGradeStructure } from '@/types';
import { db } from '@/lib/firebase';
import { doc, getDoc } from 'firebase/firestore'; 
import { Loader2, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent
} from "@/components/ui/tooltip";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from '@/contexts/AuthContext';

interface StudentWithDetailedGrades extends User {
  gradesByLevel?: Record<string, StudentGradeStructure & {
      calculatedTotals?: {
          [partialKey: string]: number | null;
      };
      calculatedFinalGrade?: number | null;
  }>;
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
  const [studentData, setStudentData] = useState<StudentWithDetailedGrades | null>(null);
  const { toast } = useToast();
  const { firestoreUser, authUser, gradingConfig, loading: authLoading } = useAuth();

  const isStudentRole = firestoreUser?.role === 'student';

  const fetchData = useCallback(async () => {
    if (authLoading || !isStudentRole || !authUser?.uid) {
        if (!authLoading && !isStudentRole) {
             toast({ title: 'Acceso Denegado', description: 'Esta página es para que los estudiantes vean sus propias calificaciones.', variant: 'destructive'});
        }
        return;
    }

    try {
        const studentDocRef = doc(db, 'users', authUser.uid);
        const studentDocSnap = await getDoc(studentDocRef);
        
        if (studentDocSnap.exists() && studentDocSnap.data()?.institutionId === firestoreUser.institutionId) {
           const student = { id: studentDocSnap.id, ...studentDocSnap.data() } as User;
           
           const processedData: StudentWithDetailedGrades = { ...student, gradesByLevel: {} };

           if (student.gradesByLevel) {
               for (const levelName in student.gradesByLevel) {
                   const levelGrades = student.gradesByLevel[levelName];
                   const calculatedTotals: { [key: string]: number | null } = {};
                   let finalGradeSum = 0;
                   let validPartialsCount = 0;
                   let allPartialsAreNumeric = true;

                   for (let i = 1; i <= gradingConfig.numberOfPartials; i++) {
                       const partialKey = `partial${i}` as keyof StudentGradeStructure;
                       const partialData = levelGrades[partialKey];
                       const partialTotal = calculatePartialTotal(partialData, gradingConfig);
                       calculatedTotals[partialKey] = partialTotal;
                       
                       if (typeof partialTotal === 'number') {
                           finalGradeSum += partialTotal;
                           validPartialsCount++;
                       } else {
                           allPartialsAreNumeric = false;
                       }
                   }
                   
                   processedData.gradesByLevel![levelName] = {
                       ...levelGrades,
                       calculatedTotals,
                       calculatedFinalGrade: (validPartialsCount === gradingConfig.numberOfPartials && allPartialsAreNumeric) 
                         ? (finalGradeSum / gradingConfig.numberOfPartials) 
                         : null,
                   };
               }
           }
           setStudentData(processedData);
        } else {
            toast({ title: 'Error', description: 'No se pudo encontrar tu registro de estudiante.', variant: 'destructive'});
        }
    } catch (error) {
      console.error("Error fetching student data:", error);
      toast({ title: 'Error al Obtener Datos', description: 'No se pudieron cargar tus calificaciones.', variant: 'destructive' });
    }
  }, [toast, gradingConfig, authLoading, firestoreUser, authUser, isStudentRole]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  if (authLoading || !studentData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-primary" />Mis Calificaciones</CardTitle>
          <CardDescription>Cargando tu información de calificaciones...</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Cargando...</p>
        </CardContent>
      </Card>
    );
  }

  const currentNumberOfPartials = Math.max(1, gradingConfig.numberOfPartials);
  
  return (
    <TooltipProvider>
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ClipboardCheck className="h-6 w-6 text-primary" /> Mis Calificaciones
                </CardTitle>
                <CardDescription>
                    Viendo tus calificaciones. Configuración de la Institución: {currentNumberOfPartials} parciales, aprobación con {gradingConfig.passingGrade}pts.
                </CardDescription>
            </CardHeader>
            <CardContent>
                {studentData.gradesByLevel && Object.keys(studentData.gradesByLevel).length > 0 ? (
                    <Accordion type="single" collapsible defaultValue={studentData.level || Object.keys(studentData.gradesByLevel)[0]} className="w-full">
                        {Object.entries(studentData.gradesByLevel).map(([levelName, levelData]) => {
                             const partialHeaders = Array.from({ length: currentNumberOfPartials }).map((_, i) => (
                                <TableHead key={`h-p${i+1}`} colSpan={MAX_ACCUMULATED_ACTIVITIES_DISPLAY + 2} className="text-center">{i+1}{i === 0 ? 'er' : i === 1 ? 'do' : i === 2 ? 'er' : 'to'} Parcial</TableHead>
                            ));
                             const subPartialHeaders = Array.from({ length: currentNumberOfPartials }).flatMap((_, pNum) => ([
                                ...Array.from({ length: MAX_ACCUMULATED_ACTIVITIES_DISPLAY }).map((_, i) => <TableHead key={`p${pNum}-acc${i+1}`} className="text-center text-xs">Ac. {i+1}</TableHead>),
                                <TableHead key={`p${pNum}-exam`} className="text-center text-xs">Examen</TableHead>,
                                <TableHead key={`p${pNum}-total`} className="text-center font-bold text-xs">Total Parcial</TableHead>
                            ]));

                            return (
                                <AccordionItem key={levelName} value={levelName}>
                                    <AccordionTrigger className="text-lg font-semibold">Calificaciones para el Nivel: {levelName}</AccordionTrigger>
                                    <AccordionContent>
                                        <div className="overflow-x-auto">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        {partialHeaders}
                                                        <TableHead rowSpan={2} className="text-center align-bottom">Nota Final</TableHead>
                                                    </TableRow>
                                                    <TableRow>
                                                        {subPartialHeaders}
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    <TableRow>
                                                        {Array.from({ length: currentNumberOfPartials }).map((_, index) => {
                                                            const pNum = index + 1;
                                                            const partialKey = `partial${pNum}` as keyof StudentGradeStructure;
                                                            const partialData = levelData[partialKey];
                                                            const studentPartialTotal = levelData.calculatedTotals?.[partialKey];
                                                            return (
                                                                <React.Fragment key={`student-level-${levelName}-p${pNum}`}>
                                                                    {renderAccumulatedActivitiesScores(partialData?.accumulatedActivities, `p${pNum}`)}
                                                                    <TableCell className="text-center">{getScoreDisplay(partialData?.exam?.score, partialData?.exam?.name, "Examen")}</TableCell>
                                                                    <TableCell className="text-center font-semibold">{getScoreDisplay(studentPartialTotal, null, null, true)}</TableCell>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        <TableCell className="text-center font-bold">{getScoreDisplay(levelData.calculatedFinalGrade, null, null, false, true)}</TableCell>
                                                    </TableRow>
                                                </TableBody>
                                            </Table>
                                        </div>
                                    </AccordionContent>
                                </AccordionItem>
                            );
                        })}
                    </Accordion>
                ) : (
                     <div className="text-center py-10">
                        <p className="text-muted-foreground">Tus calificaciones aún no están disponibles o no han sido registradas.</p>
                     </div>
                )}
            </CardContent>
        </Card>
    </TooltipProvider>
  );
}
