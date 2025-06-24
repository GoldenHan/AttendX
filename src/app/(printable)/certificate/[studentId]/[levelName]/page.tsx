
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import type { User, Group, Sede, StudentGradeStructure } from '@/types';
import { Button } from '@/components/ui/button';
import { Loader2, Printer, ArrowLeft, Award } from 'lucide-react';
import Image from 'next/image';

interface CertificateData {
  student: User;
  levelData: StudentGradeStructure;
  group: Group | null;
  teacher: User | null;
  sede: Sede | null;
}

export default function CertificatePage() {
  const router = useRouter();
  const params = useParams();
  const { firestoreUser, institution } = useAuth(); // Use institution from context
  const { studentId, levelName: encodedLevelName } = params;
  const levelName = decodeURIComponent(encodedLevelName as string);

  const [data, setData] = useState<CertificateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [certificateText, setCertificateText] = useState('');
  
  // App name and logo are now derived from the AuthContext
  const appName = institution?.appName || institution?.name || 'AttendX';
  const appLogoUrl = institution?.logoDataUrl || null;


  const fetchDataForCertificate = useCallback(async () => {
    if (!studentId || !levelName || !firestoreUser?.institutionId) {
      setError('Información insuficiente para generar el certificado.');
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const studentDocRef = doc(db, 'users', studentId as string);
      const studentSnap = await getDoc(studentDocRef);

      if (!studentSnap.exists() || studentSnap.data().institutionId !== firestoreUser.institutionId) {
        throw new Error('Estudiante no encontrado o no pertenece a esta institución.');
      }
      const student = { id: studentSnap.id, ...studentSnap.data() } as User;
      const levelData = student.gradesByLevel?.[levelName];
      if (!levelData) {
        throw new Error(`No se encontraron datos de calificación para el nivel "${levelName}".`);
      }

      let group: Group | null = null;
      let teacher: User | null = null;
      let sede: Sede | null = null;
      
      const groupsQuery = query(
        collection(db, 'groups'), 
        where('studentIds', 'array-contains', studentId),
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const groupsSnap = await getDocs(groupsQuery);
      if (!groupsSnap.empty) {
        group = { id: groupsSnap.docs[0].id, ...groupsSnap.docs[0].data() } as Group;
        if (group.teacherId) {
          const teacherSnap = await getDoc(doc(db, 'users', group.teacherId));
          if (teacherSnap.exists()) teacher = { id: teacherSnap.id, ...teacherSnap.data() } as User;
        }
        if (group.sedeId) {
            const sedeSnap = await getDoc(doc(db, 'sedes', group.sedeId));
            if (sedeSnap.exists()) sede = { id: sedeSnap.id, ...sedeSnap.data() } as Sede;
        }
      }
      
      setData({ student, levelData, group, teacher, sede });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Ocurrió un error al cargar los datos.');
    } finally {
      setLoading(false);
    }
  }, [studentId, levelName, firestoreUser?.institutionId]);

  useEffect(() => {
    fetchDataForCertificate();
    // Load template from localStorage
    const savedTemplate = localStorage.getItem('certificateTemplate');
    setCertificateText(savedTemplate || "La academia [NOMBRE_INSTITUCION] hace constar que [NOMBRE_ESTUDIANTE] ha completado el nivel [NOMBRE_NIVEL].");
  }, [fetchDataForCertificate]);
  
  const getFormattedCertificateText = () => {
    if (!data) return '';
    let text = certificateText;
    text = text.replace(/\[NOMBRE_INSTITUCION]/g, appName.toUpperCase());
    text = text.replace(/\[NOMBRE_ESTUDIANTE]/g, data.student.name.toUpperCase());
    text = text.replace(/\[NOMBRE_NIVEL]/g, levelName.toUpperCase());
    text = text.replace(/\[TIPO_PROGRAMA]/g, data.group?.type.toUpperCase() || 'GENERAL');
    text = text.replace(/\[TURNO_PROGRAMA]/g, data.group?.type.toUpperCase() || 'NO ESPECIFICADO');
    text = text.replace(/\[NOMBRE_MAESTRO]/g, data.teacher?.name.toUpperCase() || 'NO ASIGNADO');
    text = text.replace(/\[NOMBRE_SEDE]/g, data.sede?.name.toUpperCase() || 'SEDE PRINCIPAL');
    text = text.replace(/\[CODIGO_CERTIFICADO]/g, data.levelData.certificateCode || 'N/A');
    return text;
  };

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-100">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="ml-3">Generando certificado...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-100 p-4">
        <div className="text-center bg-white p-8 rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-destructive mb-4">Error al Generar Certificado</h2>
          <p className="text-muted-foreground mb-6">{error}</p>
          <Button onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-200 dark:bg-gray-900 min-h-screen p-4 sm:p-8 print:bg-white print:p-0">
      <div className="max-w-4xl mx-auto mb-8 flex justify-between items-center print:hidden">
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Volver a Gestión
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Imprimir o Guardar como PDF
        </Button>
      </div>

      <div className="max-w-4xl mx-auto bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 sm:p-12 md:p-16 print:shadow-none print:rounded-none" id="certificate-content">
        <header className="flex flex-col sm:flex-row justify-between items-center pb-8 border-b-2 border-gray-300 dark:border-gray-600">
          <div className="flex items-center gap-4">
             {appLogoUrl ? (
                <Image src={appLogoUrl} alt="Logo de la Institución" width={150} height={50} className="object-contain h-auto max-h-[50px] w-auto max-w-[150px]" />
             ) : (
                <Award className="h-12 w-12 text-primary" />
             )}
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 dark:text-gray-100">{appName}</h1>
          </div>
          <div className="mt-4 sm:mt-0 text-right">
            <p className="text-sm text-gray-500 dark:text-gray-400">Código de Certificado:</p>
            <p className="font-mono text-gray-700 dark:text-gray-300">{data?.levelData.certificateCode || 'N/A'}</p>
          </div>
        </header>

        <main className="mt-12 text-center">
            <p className="text-lg text-gray-600 dark:text-gray-300 mb-4">Se otorga el presente</p>
            <h2 className="text-4xl sm:text-5xl font-bold text-primary tracking-wider">CERTIFICADO DE FINALIZACIÓN</h2>
            <p className="text-lg text-gray-600 dark:text-gray-300 mt-4">a</p>
            <h3 className="text-3xl sm:text-4xl font-semibold text-gray-800 dark:text-gray-100 mt-2 mb-8">{data?.student.name}</h3>

            <p className="text-base text-gray-700 dark:text-gray-200 whitespace-pre-line leading-relaxed max-w-2xl mx-auto">
              {getFormattedCertificateText()}
            </p>
        </main>
        
        <footer className="mt-20 grid grid-cols-1 sm:grid-cols-2 gap-12 text-center">
            <div>
                <div className="w-4/5 h-px bg-gray-400 mx-auto mb-2"></div>
                <p className="text-sm text-gray-600 dark:text-gray-300">Firma del Maestro</p>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{data?.teacher?.name || '____________________'}</p>
            </div>
            <div>
                <div className="w-4/5 h-px bg-gray-400 mx-auto mb-2"></div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Firma del Director/Supervisor</p>
            </div>
        </footer>
      </div>
    </div>
  );
}
