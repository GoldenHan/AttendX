
'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { analyzeAttendance } from '@/ai/flows/attendance-analysis';
import { useToast } from '@/hooks/use-toast';
import { Brain, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import type { AttendanceRecord, User, Session } from '@/types';
import { generateAttendanceStringFromRecords } from '@/lib/mock-data'; // Adjusted import

export default function AiAnalysisPage() {
  const [attendanceDataString, setAttendanceDataString] = useState(''); // This will hold the string for AI
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const { toast } = useToast();

  // Fetches data from Firestore and prepares it for AI analysis
  const prepareDataForAI = async () => {
    setIsFetchingData(true);
    setAttendanceDataString(''); // Clear previous data
    try {
      const [recordsSnapshot, usersSnapshot, sessionsSnapshot] = await Promise.all([
        getDocs(collection(db, 'attendanceRecords')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'sessions')),
      ]);

      const fetchedRecords = recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      const fetchedUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      const fetchedSessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session));
      
      const aiInputString = generateAttendanceStringFromRecords(fetchedRecords, fetchedUsers, fetchedSessions);
      setAttendanceDataString(aiInputString);
      toast({
        title: 'Data Prepared',
        description: 'Attendance data fetched from Firestore and formatted for AI analysis.',
      });
    } catch (error) {
      console.error('Error fetching data for AI:', error);
      toast({
        title: 'Data Fetch Failed',
        description: 'Could not fetch attendance data from Firestore.',
        variant: 'destructive',
      });
    }
    setIsFetchingData(false);
  };


  const handleAnalyze = async () => {
    if (!attendanceDataString.trim()) {
      toast({
        title: 'Input Required',
        description: 'Please prepare data from Firestore first or provide attendance data for analysis.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);
    try {
      const result = await analyzeAttendance({ attendanceRecords: attendanceDataString });
      setAnalysisResult(result.atRiskStudents);
      toast({
        title: 'Analysis Complete',
        description: 'At-risk students identified successfully.',
      });
    } catch (error) {
      console.error('AI Analysis Error:', error);
      toast({
        title: 'Analysis Failed',
        description: 'An error occurred during the AI analysis. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          Attendance AI Analysis
        </CardTitle>
        <CardDescription>
          Identify students at risk based on their attendance patterns.
          Click "Prepare Data from Firestore" to load and format records for analysis.
          Alternatively, you can manually paste records.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="attendanceData">Attendance Records (for AI)</Label>
          <Textarea
            id="attendanceData"
            value={attendanceDataString}
            onChange={(e) => setAttendanceDataString(e.target.value)}
            placeholder="Click 'Prepare Data from Firestore' or paste records here in the format: Student Name: YYYY-MM-DD: status, ..."
            rows={10}
            className="font-code"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={prepareDataForAI} variant="outline" disabled={isFetchingData || isLoading}>
            {isFetchingData ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing Data...
              </>
            ) : (
              'Prepare Data from Firestore'
            )}
          </Button>
          <Button onClick={handleAnalyze} disabled={isLoading || isFetchingData || !attendanceDataString.trim()}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Attendance'
            )}
          </Button>
        </div>

        {analysisResult && (
          <Card className="mt-6 bg-secondary/50">
            <CardHeader>
              <CardTitle>Analysis Result</CardTitle>
              <CardDescription>Students identified as potentially at risk:</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md bg-background p-4 text-sm font-code">
                {analysisResult}
              </pre>
            </CardContent>
          </Card>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          Note: The AI analysis provides insights based on the data provided. Always cross-reference with other academic indicators.
        </p>
      </CardFooter>
    </Card>
  );
}
