
'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
import { Loader2, Award, Save, UserCircle, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, doc, getDocs, getDoc, updateDoc, query } from 'firebase/firestore';
import type { User, Group, GradingConfiguration, StudentGradeStructure, PartialScores, ActivityScore } from '@/types';
import { DEFAULT_GRADING_CONFIG } from '@/types';

interface StudentLevelRecord {
  studentId: string;
  studentName: string;
  levelName: string;
  finalGrade: number | null;
  teacherName: string | null;
  certificateCode: string;
  groupType?: 'Saturday' | 'Sunday' | null; // For certificate text template
}

// Helper to calculate final grade for a specific level
const calculateLevelFinalGrade = (levelGrades: StudentGradeStructure | undefined, config: GradingConfiguration): number | null => {
  if (!levelGrades) return null;

  let partialTotals: (number | null)[] = [];
  for (let i = 1; i <= config.numberOfPartials; i++) {
    const partialKey = `partial${i}` as keyof StudentGradeStructure;
    const partialData = levelGrades[partialKey] as PartialScores | undefined;

    if (!partialData) {
      partialTotals.push(null); // Mark as incomplete if a partial is missing
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
    if(!hasNumericAccumulated && accumulatedActivities.length > 0) currentAccumulatedScore = 0; // Consider 0 if activities exist but no scores
    else if (accumulatedActivities.length === 0) currentAccumulatedScore = 0; // Consider 0 if no activities

    const currentExamScore = typeof examScore === 'number' ? examScore : 0;
    
    const totalForPartial = Math.min(currentAccumulatedScore, config.maxTotalAccumulatedScore) + Math.min(currentExamScore, config.maxExamScore);
    partialTotals.push(totalForPartial);
  }
  
  const validPartials = partialTotals.filter(total => typeof total === 'number');
  if (validPartials.length < config.numberOfPartials) {
    return null; // Not all partials have grades
  }
  
  const sumOfTotals = validPartials.reduce((sum, current) => sum + (current as number), 0);
  return sumOfTotals / config.numberOfPartials;
};


export default function CertificateManagementPage() {
  const { toast } = useToast();
  const [allStudents, setAllStudents] = useState<User[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [allTeachers, setAllTeachers] = useState<User[]>([]);
  const [gradingConfig, setGradingConfig] = useState<GradingConfiguration>(DEFAULT_GRADING_CONFIG);
  
  const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
  const [studentLevelRecords, setStudentLevelRecords] = useState<StudentLevelRecord[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingCode, setIsSavingCode] = useState<{ [key: string]: boolean }>({});

  const [certificateTemplate, setCertificateTemplate] = useState(
    "La academia SERVEX, hace constar que [Nombre del Estudiante], con base en los resultados de los exámenes correspondientes, ha aprobado satisfactoriamente el nivel [Nivel del Estudiante] del programa de [Tipo de Programa], impartido en el turno [Turno del Programa].\n\nFirman las autoridades correspondientes."
  );
  
  const [selectedStudentForTemplate, setSelectedStudentForTemplate] = useState<StudentLevelRecord | null>(null);


  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [studentsSnap, groupsSnap, teachersSnap, configSnap] = await Promise.all([
        getDocs(collection(db, 'students')),
        getDocs(collection(db, 'groups')),
        getDocs(query(collection(db, 'users'), where('role', '==', 'teacher'))),
        getDoc(doc(db, 'appConfiguration', 'currentGradingConfig')),
      ]);

      const students = studentsSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));
      setAllStudents(students);
      setAllGroups(groupsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Group)));
      setAllTeachers(teachersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User)));

      if (configSnap.exists()) {
        setGradingConfig(configSnap.data() as GradingConfiguration);
      } else {
        setGradingConfig(DEFAULT_GRADING_CONFIG);
        toast({ title: "Advertencia", description: "Configuración de calificación por defecto cargada.", variant: "default" });
      }

    } catch (error) {
      console.error("Error fetching initial data:", error);
      toast({ title: 'Error', description: 'No se pudieron cargar los datos iniciales.', variant: 'destructive' });
    }
    setIsLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  useEffect(() => {
    if (isLoading) return;

    const records: StudentLevelRecord[] = [];
    const studentsToProcess = selectedGroupId === 'all' 
      ? allStudents 
      : allStudents.filter(s => {
          const group = allGroups.find(g => g.id === selectedGroupId);
          return group?.studentIds.includes(s.id);
        });

    studentsToProcess.forEach(student => {
      if (student.gradesByLevel) {
        Object.entries(student.gradesByLevel).forEach(([levelName, levelData]) => {
          const finalGrade = calculateLevelFinalGrade(levelData, gradingConfig);
          
          // Attempt to find the teacher for this student and potentially this level
          let teacherName: string | null = null;
          let groupType: StudentLevelRecord['groupType'] = null;

          const currentGroupForStudent = allGroups.find(g => g.studentIds.includes(student.id));
          if (currentGroupForStudent) {
            groupType = currentGroupForStudent.type;
            if (currentGroupForStudent.teacherId) {
              const teacher = allTeachers.find(t => t.id === currentGroupForStudent.teacherId);
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
  }, [allStudents, allGroups, allTeachers, selectedGroupId, gradingConfig, isLoading]);

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
    if (!recordToSave) return;

    const key = `${studentId}-${levelName}`;
    setIsSavingCode(prev => ({ ...prev, [key]: true }));

    try {
      const studentRef = doc(db, 'students', studentId);
      const studentDoc = await getDoc(studentRef);
      if (studentDoc.exists()) {
        const studentData = studentDoc.data() as User;
        const updatedGradesByLevel = { ...studentData.gradesByLevel };
        
        if (updatedGradesByLevel[levelName]) {
          updatedGradesByLevel[levelName] = {
            ...updatedGradesByLevel[levelName],
            certificateCode: recordToSave.certificateCode,
          };
        } else { // Should not happen if record exists, but as a fallback
          updatedGradesByLevel[levelName] = { certificateCode: recordToSave.certificateCode };
        }
        await updateDoc(studentRef, { gradesByLevel: updatedGradesByLevel });
        toast({ title: 'Código Guardado', description: `Código para ${recordToSave.studentName} - ${levelName} guardado.` });
      }
    } catch (error) {
      console.error("Error saving certificate code:", error);
      toast({ title: 'Error al Guardar', description: 'No se pudo guardar el código.', variant: 'destructive' });
    } finally {
      setIsSavingCode(prev => ({ ...prev, [key]: false }));
    }
  };
  
  const getFormattedCertificateText = () => {
    if (!selectedStudentForTemplate) return certificateTemplate;
    
    let text = certificateTemplate;
    text = text.replace(/\[Nombre del Estudiante]/g, selectedStudentForTemplate.studentName);
    text = text.replace(/\[Nivel del Estudiante]/g, selectedStudentForTemplate.levelName);
    
    const programType = selectedStudentForTemplate.groupType || "No especificado";
    const programTurn = selectedStudentForTemplate.groupType || "No especificado";

    text = text.replace(/\[Tipo de Programa]/g, programType);
    text = text.replace(/\[Turno del Programa]/g, programTurn);
    return text;
  };

  if (isLoading) {
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
            The teacher displayed is based on the student's current group assignment.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Label htmlFor="group-filter-certs">Filter by Current Group</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId}>
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
          </div>

          {studentLevelRecords.length === 0 && !isLoading && (
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
                        <Button variant="link" size="sm" onClick={() => setSelectedStudentForTemplate(record)} className="p-0 h-auto">
                            Usar para plantilla de acta
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
            Edita la plantilla general a continuación. Si seleccionaste "Usar para plantilla de acta" para un estudiante y nivel, los placeholders se llenarán.
            Copia el texto generado para usarlo externamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {selectedStudentForTemplate && (
            <AlertTriangle className="mb-2 h-4 w-4 text-amber-600 inline-block mr-1" />
            <span className="text-sm text-amber-700 mb-3 block">
                Mostrando texto pre-llenado para: {selectedStudentForTemplate.studentName} - {selectedStudentForTemplate.levelName}.
                <Button variant="link" size="sm" onClick={() => setSelectedStudentForTemplate(null)} className="ml-2 p-0 h-auto text-amber-700">(Limpiar selección)</Button>
            </span>
          )}
          <Textarea
            value={getFormattedCertificateText()}
            onChange={(e) => {
              if (!selectedStudentForTemplate) { // Only allow editing the base template if no student is selected for preview
                 setCertificateTemplate(e.target.value);
              }
            }}
            rows={10}
            placeholder="Escribe o pega aquí el texto para el acta o certificado..."
            readOnly={!!selectedStudentForTemplate} // Make it readonly if a student is selected, to avoid confusion
          />
          {selectedStudentForTemplate && (
            <p className="text-xs text-muted-foreground mt-2">
                La plantilla es de solo lectura mientras se previsualiza para un estudiante. Limpia la selección para editar la plantilla base.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
