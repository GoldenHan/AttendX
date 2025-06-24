
'use client';

import React, { useEffect, useState, useRef } from 'react';
import { Html5QrcodeScanner, Html5QrcodeError, Html5QrcodeResult } from 'html5-qrcode';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, query, where, Timestamp, doc, getDoc } from 'firebase/firestore';
import type { AttendanceRecord } from '@/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertTriangle, CheckCircle, Loader2, QrCode } from 'lucide-react';
import { useRouter } from 'next/navigation';

const QR_READER_ELEMENT_ID = 'qr-reader';

export default function QrLoginPage() {
  const { firestoreUser, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);

  useEffect(() => {
    if (authLoading || !firestoreUser) return;
    if (firestoreUser.role !== 'student') {
        setError("QR code login is only available for students.");
        return;
    }
    
    // This check ensures we only initialize the scanner once.
    if (!scannerRef.current) {
        scannerRef.current = new Html5QrcodeScanner(
          QR_READER_ELEMENT_ID,
          { fps: 10, qrbox: { width: 250, height: 250 } },
          false // verbose
        );

        const onScanSuccess = async (decodedText: string, decodedResult: Html5QrcodeResult) => {
          if (scannerRef.current && scannerRef.current.getState() === 2) { // 2 is SCANNING
            scannerRef.current.pause(true);
          }
          setIsProcessing(true);
          setError(null);
          setScanResult(decodedText);
          await handleScannedSession(decodedText);
        };

        const onScanFailure = (errorMessage: string, error: Html5QrcodeError) => {
          // This callback can be noisy. It's better to handle errors after a scan attempt.
        };
        
        scannerRef.current.render(onScanSuccess, onScanFailure);
    }
    
    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(err => {
          console.error("Failed to clear QR scanner on unmount.", err);
        });
        scannerRef.current = null;
      }
    };
  }, [authLoading, firestoreUser]);

  const handleScannedSession = async (sessionId: string) => {
    if (!firestoreUser || firestoreUser.role !== 'student') {
        toast({ title: "Error", description: "Only students can log attendance via QR.", variant: "destructive" });
        setIsProcessing(false);
        return;
    }

    try {
        const sessionRef = doc(db, 'sessions', sessionId);
        const sessionSnap = await getDoc(sessionRef);

        if (!sessionSnap.exists() || sessionSnap.data().institutionId !== firestoreUser.institutionId) {
            throw new Error("Invalid or expired QR code.");
        }

        const attendanceQuery = query(
            collection(db, 'attendanceRecords'),
            where('userId', '==', firestoreUser.id),
            where('sessionId', '==', sessionId)
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        if (!attendanceSnapshot.empty) {
            throw new Error("You have already logged your attendance for this session.");
        }

        const newRecord: Omit<AttendanceRecord, 'id'> = {
            userId: firestoreUser.id,
            sessionId: sessionId,
            status: 'present',
            timestamp: new Date().toISOString(),
            institutionId: firestoreUser.institutionId,
        };

        await addDoc(collection(db, 'attendanceRecords'), newRecord);

        toast({
            title: "Attendance Logged!",
            description: `Welcome, ${firestoreUser.name}. Your attendance has been successfully recorded.`,
            className: 'bg-green-100 dark:bg-green-900 border-green-500 text-green-700 dark:text-green-300'
        });
        
        setTimeout(() => router.push('/dashboard'), 2000);

    } catch (err: any) {
      setError(err.message || "An unknown error occurred.");
      toast({
        title: "Log In Failed",
        description: err.message || "Could not process QR code.",
        variant: "destructive",
      });
      if (scannerRef.current && scannerRef.current.getState() === 3) {
          scannerRef.current.resume();
      }
    } finally {
        setIsProcessing(false);
    }
  };
  
  if (authLoading) {
    return <Card><CardContent className="flex justify-center items-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></CardContent></Card>
  }

  return (
    <Card className="max-w-lg mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><QrCode className="h-6 w-6 text-primary"/> QR Code Attendance Login</CardTitle>
        <CardDescription>
            {error 
             ? "An error occurred. Please try again or use a different method."
             : "Align the QR code provided by your teacher within the frame to log your attendance."
            }
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {isProcessing && !error && (
            <div className="text-center p-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-2" />
                <p>Processing QR code...</p>
                <p className="text-sm text-muted-foreground">Session ID: {scanResult}</p>
            </div>
        )}
        
        {scanResult && !isProcessing && !error && (
            <div className="text-center p-4 text-green-600">
                <CheckCircle className="h-12 w-12 mx-auto mb-2" />
                <h3 className="text-lg font-semibold">Attendance Logged Successfully!</h3>
                <p>Redirecting you to the dashboard...</p>
            </div>
        )}
        
        {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Scan Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
               <Button onClick={() => window.location.reload()} className="mt-4">Try Again</Button>
            </Alert>
        )}
        
        <div id={QR_READER_ELEMENT_ID} className="w-full aspect-square max-w-sm"/>
      </CardContent>
    </Card>
  );
}
