
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import type { TeacherAttendanceRecord } from '@/types';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function StaffQrCheckInPage() {
  const { firestoreUser, loading: authLoading } = useAuth();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading || !firestoreUser || isProcessing || scanResult) return;

    const scanner = new Html5QrcodeScanner(
      'qr-reader',
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false // verbose
    );

    const onScanSuccess = async (decodedText: string) => {
      if (isProcessing) return;
      setIsProcessing(true);
      setError(null);
      
      try {
        const payload = JSON.parse(decodedText);
        
        // Basic validation
        if (payload.type !== 'teacher-attendance') {
            throw new Error("Código QR no válido para asistencia de personal.");
        }
        if (payload.institutionId !== firestoreUser.institutionId) {
            throw new Error("Este código QR pertenece a otra institución.");
        }
        const today = new Date().toISOString().split('T')[0];
        if (payload.date !== today) {
            throw new Error(`Este código QR es para la fecha ${payload.date} y ya no es válido.`);
        }
        if(payload.sedeId && payload.sedeId !== firestoreUser.sedeId) {
            throw new Error("Este código QR es para una Sede diferente.");
        }
        
        // All checks passed, create attendance record
        const newRecord: Omit<TeacherAttendanceRecord, 'id'> = {
            teacherId: firestoreUser.id,
            teacherName: firestoreUser.name,
            timestamp: new Date().toISOString(),
            date: new Date().toISOString().split('T')[0],
            attendanceCodeUsed: 'QR_SCAN',
            institutionId: firestoreUser.institutionId,
        };
        await addDoc(collection(db, 'teacherAttendanceRecords'), newRecord);
        
        setScanResult(`¡Bienvenido/a, ${firestoreUser.name}! Tu asistencia ha sido registrada exitosamente.`);
        toast({
          title: 'Asistencia Registrada',
          description: `Se registró tu llegada a las ${new Date().toLocaleTimeString()}.`,
        });
        scanner.clear();
        
      } catch (e: any) {
        let errorMessage = "Código QR inválido o expirado.";
        if (e instanceof SyntaxError) {
          errorMessage = "El formato del código QR es incorrecto.";
        } else if (e.message) {
          errorMessage = e.message;
        }
        setError(errorMessage);
        toast({
            title: "Error al Escanear",
            description: errorMessage,
            variant: "destructive"
        });
      } finally {
        // Don't set isProcessing to false immediately, to prevent re-scanning
        // Let the success/error message be the final state.
      }
    };

    const onScanFailure = (err: any) => {
      // console.warn(`Code scan error = ${err}`);
    };

    scanner.render(onScanSuccess, onScanFailure);

    return () => {
      if (scanner && scanner.getState()) {
        scanner.clear().catch(err => console.error("Failed to clear scanner on unmount.", err));
      }
    };
  }, [authLoading, firestoreUser, isProcessing, scanResult, toast]);

  if (authLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  
  if (!firestoreUser) {
    return <p>Debes iniciar sesión para registrar tu asistencia.</p>
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle>Escanear QR de Asistencia de Personal</CardTitle>
        <CardDescription>Apunta la cámara de tu dispositivo al código QR mostrado por tu administrador o supervisor para registrar tu llegada.</CardDescription>
      </CardHeader>
      <CardContent>
        {scanResult ? (
          <div className="text-center text-green-600 flex flex-col items-center gap-4 p-8">
            <CheckCircle className="h-16 w-16" />
            <p className="text-xl font-semibold">{scanResult}</p>
          </div>
        ) : error ? (
            <div className="text-center text-destructive flex flex-col items-center gap-4 p-8">
                <XCircle className="h-16 w-16" />
                <p className="text-xl font-semibold">Error de Escaneo</p>
                <p>{error}</p>
            </div>
        ) : isProcessing ? (
           <div className="flex justify-center items-center p-8">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="ml-3">Procesando asistencia...</p>
           </div>
        ) : (
          <div id="qr-reader" className="w-full"></div>
        )}
      </CardContent>
    </Card>
  );
}
