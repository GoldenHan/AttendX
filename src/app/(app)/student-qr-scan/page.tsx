'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase';
import { collection, addDoc, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, CheckCircle, XCircle, QrCode } from 'lucide-react';
import type { AttendanceRecord, Session, Group } from '@/types';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function StudentQrCheckInPage() {
  const { firestoreUser, loading: authLoading } = useAuth();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (authLoading || !firestoreUser || firestoreUser.role !== 'student' || isProcessing || scanResult) return;

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
        const sessionId = decodedText;
        if (!sessionId || sessionId.length < 5) { // Basic validation for session ID format
            throw new Error("Código QR no parece ser un código de sesión válido.");
        }

        // 1. Verify session exists and belongs to the same institution
        const sessionRef = doc(db, 'sessions', sessionId);
        const sessionSnap = await getDoc(sessionRef);
        if (!sessionSnap.exists() || sessionSnap.data().institutionId !== firestoreUser.institutionId) {
            throw new Error("Código de sesión no válido o no encontrado para tu institución.");
        }
        const sessionData = sessionSnap.data() as Session;
        
        // 2. Verify student is part of the group for this session
        const groupRef = doc(db, 'groups', sessionData.classId);
        const groupSnap = await getDoc(groupRef);
        if (!groupSnap.exists()) {
            throw new Error("El grupo para esta sesión no fue encontrado.");
        }
        const groupData = groupSnap.data() as Group;
        if (!groupData.studentIds.includes(firestoreUser.id)) {
            throw new Error(`No estás inscrito en el grupo "${groupData.name}".`);
        }

        // 3. Check if attendance has already been recorded for this session for this user
        const attendanceQuery = query(
            collection(db, 'attendanceRecords'),
            where('userId', '==', firestoreUser.id),
            where('sessionId', '==', sessionId)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        if (!attendanceSnapshot.empty) {
            throw new Error(`Ya has registrado tu asistencia para esta sesión: ${attendanceSnapshot.docs[0].data().status}.`);
        }

        // All checks passed, create attendance record
        const newRecord: Omit<AttendanceRecord, 'id'> = {
            sessionId: sessionId,
            userId: firestoreUser.id,
            status: 'present',
            timestamp: new Date().toISOString(),
            institutionId: firestoreUser.institutionId,
        };
        await addDoc(collection(db, 'attendanceRecords'), newRecord);
        
        setScanResult(`¡Asistencia registrada para ${groupData.name}!`);
        toast({
          title: 'Asistencia Registrada',
          description: `Se registró tu llegada a las ${new Date().toLocaleTimeString()}.`,
        });
        scanner.clear();
        
      } catch (e: any) {
        let errorMessage = "Código QR inválido o expirado.";
        if (e.message) {
          errorMessage = e.message;
        }
        setError(errorMessage);
        toast({
            title: "Error al Escanear",
            description: errorMessage,
            variant: "destructive"
        });
        // Allow re-scanning after an error
        setTimeout(() => setIsProcessing(false), 2000); 
      }
    };

    const onScanFailure = (err: any) => {
      // This can be noisy, so we'll ignore it.
    };

    scanner.render(onScanSuccess, onScanFailure);

    return () => {
      if (scanner?.getState() === 2) { // 2 is SCANNING state
        scanner.clear().catch(err => console.error("Failed to clear scanner on unmount.", err));
      }
    };
  }, [authLoading, firestoreUser, isProcessing, scanResult, toast]);

  if (authLoading) {
    return <div className="flex h-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  
  if (!firestoreUser || firestoreUser.role !== 'student') {
    return (
        <Card className="max-w-lg mx-auto">
            <CardHeader>
                <CardTitle>Acceso Denegado</CardTitle>
                <CardDescription>Esta página es solo para que los estudiantes escaneen su asistencia.</CardDescription>
            </CardHeader>
        </Card>
    );
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><QrCode className="h-6 w-6 text-primary" /> Registrar mi Asistencia</CardTitle>
        <CardDescription>Apunta la cámara de tu dispositivo al código QR mostrado por tu maestro para registrar tu llegada a la clase.</CardDescription>
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
                <p className="text-xl font-semibold">Error al Escanear</p>
                <p>{error}</p>
                {!isProcessing && <p className="text-sm text-muted-foreground mt-2">Por favor, inténtalo de nuevo.</p>}
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
