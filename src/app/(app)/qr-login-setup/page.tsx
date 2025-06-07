
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { ClassInfo, Session } from '@/types';

export default function QrLoginSetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [generatedLink, setGeneratedLink] = useState<string>('');

  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const classesSnapshot = await getDocs(collection(db, 'classes'));
        setClasses(classesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ClassInfo)));

        const sessionsSnapshot = await getDocs(collection(db, 'sessions'));
        setSessions(sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session)));
      } catch (error) {
        console.error("Error fetching data for QR setup:", error);
        toast({ title: 'Error fetching data', description: 'Could not load classes or sessions.', variant: 'destructive' });
      }
      setIsLoadingData(false);
    };
    fetchData();
  }, [toast]);

  const availableSessions = selectedClassId ? sessions.filter(s => s.classId === selectedClassId) : [];

  const handleGenerateLink = () => {
    if (!selectedSessionId) {
      toast({
        title: 'Error',
        description: 'Please select a class and a session.',
        variant: 'destructive',
      });
      return;
    }
    // Generate link relative to current origin
    const link = `/attendance-log?session_id=${selectedSessionId}`;
    setGeneratedLink(link);
    toast({
      title: 'Link Generated',
      description: 'A simulated QR code link has been created.',
    });
  };

  const handleNavigateToLog = () => {
    if (generatedLink) {
      router.push(generatedLink);
    }
  };
  
  if (isLoadingData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="h-6 w-6 text-primary" />
            QR Code Session Login Setup
          </CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="ml-2">Loading data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <QrCode className="h-6 w-6 text-primary" />
          QR Code Session Login Setup
        </CardTitle>
        <CardDescription>
          Select a class and session to simulate generating a QR code link for attendance logging.
          In a real application, a QR code image would be generated for this link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="classSelect">Select Class</Label>
          <Select
            value={selectedClassId}
            onValueChange={(value) => {
              setSelectedClassId(value);
              setSelectedSessionId(''); 
              setGeneratedLink('');
            }}
          >
            <SelectTrigger id="classSelect">
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {classes.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedClassId && (
          <div className="space-y-2">
            <Label htmlFor="sessionSelect">Select Session</Label>
            <Select
              value={selectedSessionId}
              onValueChange={(value) => {
                setSelectedSessionId(value);
                setGeneratedLink('');
              }}
              disabled={!selectedClassId || availableSessions.length === 0}
            >
              <SelectTrigger id="sessionSelect">
                <SelectValue placeholder="Select a session" />
              </SelectTrigger>
              <SelectContent>
                {availableSessions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.date} - {s.time}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableSessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions available for this class.</p>}
          </div>
        )}

        <Button onClick={handleGenerateLink} disabled={!selectedSessionId || isLoadingData}>
          Generate Session Link
        </Button>

        {generatedLink && (
          <div className="space-y-2 pt-4 border-t">
            <Label>Generated Link (Simulated QR Code Content)</Label>
            <div className="p-2 border rounded-md bg-muted text-sm font-mono break-all">
              {typeof window !== 'undefined' ? `${window.location.origin}${generatedLink}` : generatedLink}
            </div>
            <Button onClick={handleNavigateToLog} variant="outline" className="mt-2">
              Simulate Scan & Log Attendance
            </Button>
            <p className="text-xs text-muted-foreground">
              In a real app, this link would be embedded in a QR code. Scanning it would take the user to the attendance log page with the session pre-filled.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
