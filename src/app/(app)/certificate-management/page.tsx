
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Award, Save, UserCircle, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, updateDoc, query, where } from 'firebase/firestore';
import type { User, Group, GradingConfiguration, StudentGradeStructure, PartialScores } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

interface StudentLevelRecord {
  studentId: string;
  studentName: string;
  levelName: string;
  finalGrade: number | null;
  teacherName: string | null;
  certificateCode: string;
  groupType?: 'Saturday' | 'Sunday' | null;
}

const calculateLevelFinalGrade = (levelGrades: StudentGradeStructure | undefined, config: GradingConfiguration): number | null => {
  if (!levelGrades) return null;

  let partialTotals: (number | null)[] = [];
  for (let i = 1; i <= config.numberOfPartials; i++) {
    const partialKey = `partial${i}` as keyof StudentGradeStructure;
    const partialData = levelGrades[partialKey] as PartialScores | undefined;

    if (!partialData) {
      partialTotals.push(null);
      continue;
    }

    const accumulatedActivities = partialData.accumulatedActivities || [];
    const examScore = partialData.exam?.score;

    let currentAccumulatedScore = 0;
    let hasNumericAccumulated = false;
    accumulatedActivities.forEach(act => {
      if (typeof act.score === 'number') {
        currentAccumulatedScore += act.score;
        hasNumericAccumulated = true;
      }
    });
    if(!hasNumericAccumulated && accumulatedActivities.length > 0) currentAccumulatedScore = 0;
    else if (accumulatedActivities.length === 0) currentAccumulatedScore = 0;

    const currentExamScore = typeof examScore === 'number' ? examScore : 0;

    const totalForPartial = Math.min(currentAccumulatedScore, config.maxTotalAccumulatedScore) + Math.min(currentExamScore, config.maxExamScore);
    partialTotals.push(totalForPartial);
  }

  const validPartials = partialTotals.filter(total => typeof total === 'number');
  if (validPartials.length < config.numberOfPartials) {
    return null;
  }

  const sumOfTotals = validPartials.reduce((sum, current) => sum + (current as number), 0);
  return sumOfTotals / config.numberOfPartials;
};


export default function CertificateManagementPage() {
  const { toast } = useToast();
  const { firestoreUser, gradingConfig, loading: authLoading } = useAuth();
  const router = useRouter();

  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allTeachers, setAllTeachers] = useState<User[]>([]);

  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [studentLevelRecords, setStudentLevelRecords] = useState<StudentLevelRecord[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isSavingCode, setIsSavingCode] = useState<{ [key: string]: boolean }>({});

  const [certificateTemplate, setCertificateTemplate] = useState(
    "La academia SERVEX, hace constar que [NOMBRE_ESTUDIANTE], con base en los resultados de los exámenes correspondientes, ha aprobado satisfactoriamente el nivel [NOMBRE_NIVEL] del programa de [TIPO_PROGRAMA], impartido en el turno [TURNO_PROGRAMA].\n\nFirman las autoridades correspondientes."
  );

  const fetchInitialData = useCallback(async () => {
    if (authLoading || !firestoreUser?.institutionId) {
        setIsLoadingData(false);
        return;
    }
    setIsLoadingData(true);
    try {
      const studentsQuery = query(collection(db, 'users'), where('role', '==', 'student'), where('institutionId', '==', firestoreUser.institutionId));
      const groupsQuery = query(collection(db, 'groups'), where('institutionId', '==', firestoreUser.institutionId));
      const teachersQuery = query(collection(db, 'users'), where('role', '==', 'teacher'), where('institutionId', '==', firestoreUser.institutionId));

      const [studentsSnap, groupsSnap, teachersSnap] = await Promise.all([
        getDocs(studentsQuery),
        getDocs(groupsQuery),
        getDocs(teachersSnap),
      ]);

      setAllStudents(studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));
      setAllGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
      setAllTeachers(teachersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));

    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast({ title: 'Error', description: 'No se pudieron cargar los datos iniciales.', variant: 'destructive' });
    }
    setIsLoadingData(false);
  }, [toast, firestoreUser, authLoading]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    // Save template to localStorage whenever it changes
    localStorage.setItem('certificateTemplate', certificateTemplate);
  }, [certificateTemplate]);

  useEffect(() => {
    // Load template from localStorage on initial render
    const savedTemplate = localStorage.getItem('certificateTemplate');
    if (savedTemplate) {
      setCertificateTemplate(savedTemplate);
    }
  }, []);

  useEffect(() => {
    if (isLoadingData || authLoading) return;

    const records: StudentLevelRecord[] = [];
    const studentsToProcess = selectedGroupId === 'all'
      ? allStudents
      : allStudents.filter(s => {
          const group = allGroups.find(g => g.id === selectedGroupId);
          return group?.studentIds.includes(s.id) && group.institutionId === firestoreUser?.institutionId;
        });

    studentsToProcess.forEach(student => {
      if (student.gradesByLevel) {
        Object.entries(student.gradesByLevel).forEach(([levelName, levelData]) => {
          const finalGrade = calculateLevelFinalGrade(levelData, gradingConfig);

          let teacherName: string | null = null;
          let groupType: StudentLevelRecord['groupType'] = null;

          const currentGroupForStudent = allGroups.find(g => Array.isArray(g.studentIds) && g.studentIds.includes(student.id) && g.institutionId === firestoreUser?.institutionId);
          if (currentGroupForStudent) {
            groupType = currentGroupForStudent.type === 'Saturday' || currentGroupForStudent.type === 'Sunday' ? currentGroupForStudent.type : null;
            if (currentGroupForStudent.teacherId) {
              const teacher = allTeachers.find(t => t.id === currentGroupForStudent.teacherId && t.institutionId === firestoreUser?.institutionId);
              teacherName = teacher?.name || 'Desconocido';
            }
          }

          records.push({
            studentId: student.id,
            studentName: student.name,
            levelName: levelName,
            finalGrade: finalGrade,
            teacherName: teacherName,
            certificateCode: levelData.certificateCode || '',
            groupType: groupType,
          });
        });
      }
    });
    setStudentLevelRecords(records.sort((a,b) => a.studentName.localeCompare(b.studentName) || a.levelName.localeCompare(b.levelName)));
  }, [allStudents, allGroups, allTeachers, selectedGroupId, gradingConfig, isLoadingData, authLoading, firestoreUser?.institutionId]);

  const handleCodeChange = (studentId: string, levelName: string, newCode: string) => {
    setStudentLevelRecords(prevRecords =>
      prevRecords.map(record =>
        record.studentId === studentId && record.levelName === levelName
          ? { ...record, certificateCode: newCode }
          : record
      )
    );
  };

  const handleSaveCode = async (studentId: string, levelName: string) => {
    const recordToSave = studentLevelRecords.find(r => r.studentId === studentId && r.levelName === levelName);
    if (!recordToSave || !firestoreUser?.institutionId) return;

    const studentToUpdate = allStudents.find(s => s.id === studentId && s.institutionId === firestoreUser.institutionId);
    if (!studentToUpdate) {
        toast({ title: 'Error', description: 'Estudiante no encontrado en esta institución.', variant: 'destructive' });
        return;
    }

    const key = `${studentId}-${levelName}`;
    setIsSavingCode(prev => ({ ...prev, [key]: true }));

    try {
      const studentRef = doc(db, 'users', studentId);
      const studentDoc = await getDoc(studentRef);
      if (studentDoc.exists() && studentDoc.data()?.institutionId === firestoreUser.institutionId) {
        const studentData = studentDoc.data() as User;
        const updatedGradesByLevel = { ...studentData.gradesByLevel };

        if (updatedGradesByLevel[levelName]) {
          updatedGradesByLevel[levelName].certificateCode = recordToSave.certificateCode;
        } else {
          updatedGradesByLevel[levelName] = { certificateCode: recordToSave.certificateCode };
        }
        await updateDoc(studentRef, { gradesByLevel: updatedGradesByLevel });
        toast({ title: 'Código Guardado', description: `Código para ${recordToSave.studentName} - ${levelName} guardado.` });
      } else {
        toast({ title: 'Error al Guardar', description: 'No se pudo encontrar el registro del estudiante o no pertenece a esta institución.', variant: 'destructive' });
      }
    } catch (error) {
      console.error("Error saving certificate code:", error);
      toast({ title: 'Error al Guardar', description: 'No se pudo guardar el código.', variant: 'destructive' });
    } finally {
      setIsSavingCode(prev => ({ ...prev, [key]: false }));
    }
  };
  
  const handleGenerateCertificate = (studentId: string, levelName: string) => {
    router.push(`/certificate/${studentId}/${encodeURIComponent(levelName)}`);
  };

  if (authLoading || isLoadingData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Award className="h-6 w-6 text-primary" /> Certificate Records</CardTitle>
          <CardDescription>Manage certificate codes and generate act text for students based on their level performance.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Award className="h-6 w-6 text-primary" /> Certificate Records</CardTitle>
          <CardDescription>
            View final grades per level for students. Filter by group and manage certificate codes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="group-filter-certs">Filter by Current Group</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId} disabled={allGroups.length === 0}>
              <SelectTrigger id="group-filter-certs" className="w-full md:w-[300px]">
                <SelectValue placeholder="Select a group" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Students (All Groups)</SelectItem>
                {allGroups.map(group => (
                  <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {allGroups.length === 0 && <p className="text-xs text-muted-foreground mt-1">No groups available in this institution.</p>}
          </div>

          {studentLevelRecords.length === 0 && !isLoadingData && (
            <p className="text-muted-foreground text-center py-6">
              No student records found for the selected criteria, or students have no grade data.
            </p>
          )}

          <div className="space-y-4">
            {studentLevelRecords.map((record) => {
              const key = `${record.studentId}-${record.levelName}`;
              return (
                <Card key={key} className="overflow-hidden">
                  <CardHeader className="bg-muted/30 p-4">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <UserCircle className="h-5 w-5" /> {record.studentName}
                      </CardTitle>
                      <span className="text-sm text-muted-foreground sm:ml-auto">Nivel: {record.levelName}</span>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                    <div>
                      <Label className="text-xs text-muted-foreground">Nota Final del Nivel</Label>
                      <p className={`text-xl font-bold ${record.finalGrade !== null && record.finalGrade >= gradingConfig.passingGrade ? 'text-green-600' : record.finalGrade !== null ? 'text-red-600' : 'text-gray-500'}`}>
                        {record.finalGrade !== null ? record.finalGrade.toFixed(2) : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Maestro (del grupo actual)</Label>
                      <p>{record.teacherName || 'N/A'}</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`code-${key}`} className="text-xs text-muted-foreground">Código de Certificado</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`code-${key}`}
                          value={record.certificateCode}
                          onChange={(e) => handleCodeChange(record.studentId, record.levelName, e.target.value)}
                          placeholder="Ej: SERVEX-CERT-001"
                          className="flex-grow"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSaveCode(record.studentId, record.levelName)}
                          disabled={isSavingCode[key]}
                        >
                          {isSavingCode[key] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                   <CardFooter className="p-4 border-t bg-muted/10">
                        <Button variant="link" size="sm" onClick={() => handleGenerateCertificate(record.studentId, record.levelName)} className="p-0 h-auto">
                            <FileText className="mr-2 h-4 w-4" />
                            Generar Acta/Certificado
                        </Button>
                    </CardFooter>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plantilla de Acta/Certificado</CardTitle>
          <CardDescription>
            Edita la plantilla base aquí. Los placeholders como [NOMBRE_ESTUDIANTE] serán reemplazados al generar el certificado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            value={certificateTemplate}
            onChange={(e) => setCertificateTemplate(e.target.value)}
            rows={8}
            placeholder="Escribe o pega aquí el texto para el acta o certificado..."
          />
           <p className="text-xs text-muted-foreground mt-2">
                Placeholders disponibles: [NOMBRE_ESTUDIANTE], [NOMBRE_NIVEL], [TIPO_PROGRAMA], [TURNO_PROGRAMA], [NOMBRE_MAESTRO]. La plantilla se guarda en tu navegador.
            </p>
        </CardContent>
      </Card>
    </div>
  );
}
