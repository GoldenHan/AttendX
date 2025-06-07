'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QrCode } from 'lucide-react';
import { mockClasses, mockSessions } from '@/lib/mock-data';
import { useToast } from '@/hooks/use-toast';

export default function QrLoginSetupPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [generatedLink, setGeneratedLink] = useState<string>('');

  const availableSessions = selectedClassId ? mockSessions.filter(s => s.classId === selectedClassId) : [];

  const handleGenerateLink = () => {
    if (!selectedSessionId) {
      toast({
        title: 'Error',
        description: 'Please select a class and a session.',
        variant: 'destructive',
      });
      return;
    }
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
              setSelectedSessionId(''); // Reset session when class changes
              setGeneratedLink('');
            }}
          >
            <SelectTrigger id="classSelect">
              <SelectValue placeholder="Select a class" />
            </SelectTrigger>
            <SelectContent>
              {mockClasses.map((c) => (
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

        <Button onClick={handleGenerateLink} disabled={!selectedSessionId}>
          Generate Session Link
        </Button>

        {generatedLink && (
          <div className="space-y-2 pt-4 border-t">
            <Label>Generated Link (Simulated QR Code Content)</Label>
            <div className="p-2 border rounded-md bg-muted text-sm font-mono break-all">
              {`${window.location.origin}${generatedLink}`}
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
