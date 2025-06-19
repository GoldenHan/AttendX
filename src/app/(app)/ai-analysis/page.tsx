
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { analyzeAttendance } from '@/ai/flows/attendance-analysis';
import { useToast } from '@/hooks/use-toast';
import { Brain, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore'; // Added where
import type { AttendanceRecord, User, Session } from '@/types';
import { generateAttendanceStringFromRecords } from '@/lib/mock-data';
import { useAuth } from '@/contexts/AuthContext'; // Added useAuth

export default function AiAnalysisPage() {
  const [attendanceDataString, setAttendanceDataString] = useState('');
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false); // Renamed from isLoading
  const [isFetchingData, setIsFetchingData] = useState(false);
  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth(); // Get firestoreUser and authLoading

  // Fetches data from Firestore and prepares it for AI analysis
  const prepareDataForAI = useCallback(async () => {
    if (!firestoreUser?.institutionId) {
      toast({
        title: 'Institution Not Found',
        description: 'Cannot prepare data without institution context.',
        variant: 'destructive',
      });
      return;
    }
    setIsFetchingData(true);
    setAttendanceDataString('');
    try {
      const institutionId = firestoreUser.institutionId;

      const recordsQuery = query(collection(db, 'attendanceRecords'), where('institutionId', '==', institutionId));
      const usersQuery = query(collection(db, 'users'), where('institutionId', '==', institutionId));
      const sessionsQuery = query(collection(db, 'sessions'), where('institutionId', '==', institutionId));

      const [recordsSnapshot, usersSnapshot, sessionsSnapshot] = await Promise.all([
        getDocs(recordsQuery),
        getDocs(usersQuery),
        getDocs(sessionsQuery),
      ]);

      const fetchedRecords = recordsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AttendanceRecord));
      const fetchedUsers = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User));
      const fetchedSessions = sessionsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Session));
      
      if (fetchedRecords.length === 0 && fetchedUsers.length === 0 && fetchedSessions.length === 0) {
        toast({
          title: 'No Data Found',
          description: 'No attendance records, users, or sessions found for your institution to analyze.',
          variant: 'default',
        });
        setAttendanceDataString('');
        setIsFetchingData(false);
        return;
      }
      
      const aiInputString = generateAttendanceStringFromRecords(fetchedRecords, fetchedUsers, fetchedSessions);
      setAttendanceDataString(aiInputString);
      toast({
        title: 'Data Prepared',
        description: 'Attendance data fetched from Firestore for your institution and formatted for AI analysis.',
      });
    } catch (error) {
      console.error('Error fetching data for AI:', error);
      toast({
        title: 'Data Fetch Failed',
        description: 'Could not fetch attendance data from Firestore for your institution.',
        variant: 'destructive',
      });
    }
    setIsFetchingData(false);
  }, [firestoreUser, toast]);


  const handleAnalyze = async () => {
    if (!attendanceDataString.trim()) {
      toast({
        title: 'Input Required',
        description: 'Please prepare data from Firestore first or provide attendance data for analysis.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoadingAnalysis(true);
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
      setIsLoadingAnalysis(false);
    }
  };
  
  if (authLoading) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Brain className="h-6 w-6 text-primary" /> Attendance AI Analysis</CardTitle>
                <CardDescription>Loading user data...</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
        </Card>
    );
  }

  if (!firestoreUser?.institutionId && !authLoading) {
     return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Brain className="h-6 w-6 text-primary" /> Attendance AI Analysis</CardTitle>
                <CardDescription>Error: Institution context not found.</CardDescription>
            </CardHeader>
            <CardContent>
                <p className="text-destructive">Cannot perform AI Analysis without an assigned institution. Please contact support if this issue persists.</p>
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          Attendance AI Analysis
        </CardTitle>
        <CardDescription>
          Identify students at risk based on their attendance patterns within your institution.
          Click "Prepare Data from Firestore" to load and format records for analysis.
          Alternatively, you can manually paste records if needed.
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
            className="font-mono text-xs" // Changed from font-code for better built-in font support
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={prepareDataForAI} variant="outline" disabled={isFetchingData || isLoadingAnalysis || !firestoreUser?.institutionId}>
            {isFetchingData ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Preparing Data...
              </>
            ) : (
              'Prepare Data from Firestore'
            )}
          </Button>
          <Button onClick={handleAnalyze} disabled={isLoadingAnalysis || isFetchingData || !attendanceDataString.trim() || !firestoreUser?.institutionId}>
            {isLoadingAnalysis ? (
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
              <pre className="whitespace-pre-wrap rounded-md bg-background p-4 text-sm font-mono"> {/* Changed from font-code */}
                {analysisResult}
              </pre>
            </CardContent>
          </Card>
        )}
      </CardContent>
      <CardFooter>
        <p className="text-xs text-muted-foreground">
          Note: The AI analysis provides insights based on the data provided from your institution. Always cross-reference with other academic indicators.
        </p>
      </CardFooter>
    </Card>
  );
}
