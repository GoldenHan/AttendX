
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
import type { Group, Session } from '@/types'; // Changed ClassInfo to Group

export default function QrLoginSetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedGroupId, setSelectedGroupId] = useState<string>(''); // Renamed selectedClassId to selectedGroupId
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [generatedLink, setGeneratedLink] = useState<string>('');

  const [groups, setGroups] = useState<Group[]>([]); // Renamed classes to groups, ClassInfo to Group
  const [sessions, setSessions] = useState<Session[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoadingData(true);
      try {
        const groupsSnapshot = await getDocs(collection(db, 'groups')); // Fetch from 'groups' collection
        setGroups(groupsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group))); // Use Group type

        const sessionsSnapshot = await getDocs(collection(db, 'sessions'));
        setSessions(sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session)));
      } catch (error) {
        console.error("Error fetching data for QR setup:", error);
        toast({ title: 'Error fetching data', description: 'Could not load groups or sessions.', variant: 'destructive' });
      }
      setIsLoadingData(false);
    };
    fetchData();
  }, [toast]);

  // Session.classId now refers to a Group.id
  const availableSessions = selectedGroupId ? sessions.filter(s => s.classId === selectedGroupId) : [];

  const handleGenerateLink = () => {
    if (!selectedSessionId) {
      toast({
        title: 'Error',
        description: 'Please select a group and a session.', // Updated message
        variant: 'destructive',
      });
      return;
    }
    // Generate link relative to current origin
    // The attendance-log page should be able to handle a session_id parameter
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
          Select a group and session to simulate generating a QR code link for attendance logging.
          In a real application, a QR code image would be generated for this link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="groupSelect">Select Group</Label> {/* Renamed classSelect to groupSelect */}
          <Select
            value={selectedGroupId}
            onValueChange={(value) => {
              setSelectedGroupId(value);
              setSelectedSessionId(''); 
              setGeneratedLink('');
            }}
          >
            <SelectTrigger id="groupSelect">
              <SelectValue placeholder="Select a group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => ( // Iterate over groups
                <SelectItem key={g.id} value={g.id}>
                  {g.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedGroupId && (
          <div className="space-y-2">
            <Label htmlFor="sessionSelect">Select Session</Label>
            <Select
              value={selectedSessionId}
              onValueChange={(value) => {
                setSelectedSessionId(value);
                setGeneratedLink('');
              }}
              disabled={!selectedGroupId || availableSessions.length === 0}
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
            {availableSessions.length === 0 && <p className="text-sm text-muted-foreground">No sessions available for this group.</p>}
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
