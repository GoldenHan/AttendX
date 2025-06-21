
'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { analyzeAttendance } from '@/ai/flows/attendance-analysis';
import { useToast } from '@/hooks/use-toast';
import { Brain, Loader2 } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { AttendanceRecord, User, Session } from '@/types';
import { generateAttendanceStringFromRecords } from '@/lib/mock-data';
import { useAuth } from '@/contexts/AuthContext';

export default function AiAnalysisPage() {
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth();

  const handleAnalyze = async () => {
    if (!firestoreUser?.institutionId) {
      toast({
        title: 'Institution Not Found',
        description: 'Cannot perform analysis without an institution context.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);

    try {
      // 1. Fetch all necessary data from Firestore for the institution
      toast({
        title: 'Fetching Data...',
        description: 'Gathering attendance records for your institution.',
      });

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
      
      if (fetchedRecords.length === 0) {
        toast({
          title: 'No Data Found',
          description: 'No attendance records found for your institution to analyze.',
          variant: 'default',
        });
        setIsLoading(false);
        return;
      }
      
      // 2. Format data for the AI
      const aiInputString = generateAttendanceStringFromRecords(fetchedRecords, fetchedUsers, fetchedSessions);

      if (!aiInputString.trim()) {
        toast({
          title: 'No Student Data',
          description: 'No relevant student attendance data could be formatted for analysis.',
          variant: 'default',
        });
        setIsLoading(false);
        return;
      }
      
      // 3. Call the AI analysis flow
      toast({
        title: 'Analyzing Data...',
        description: 'The AI is now processing the attendance patterns.',
      });
      
      const result = await analyzeAttendance({ attendanceRecords: aiInputString });
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
          Click the button below to automatically analyze all attendance records for your institution. The AI will identify students who may be at risk due to their attendance patterns.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Button onClick={handleAnalyze} disabled={isLoading || !firestoreUser?.institutionId}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Institution Attendance'
            )}
          </Button>
        </div>

        {isLoading && (
            <div className="flex items-center text-muted-foreground p-4 bg-muted/50 rounded-md">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Fetching records and running analysis... This may take a moment.
            </div>
        )}

        {analysisResult && (
          <Card className="mt-6 bg-secondary/50">
            <CardHeader>
              <CardTitle>Analysis Result</CardTitle>
              <CardDescription>Students identified as potentially at risk:</CardDescription>
            </CardHeader>
            <CardContent>
              <pre className="whitespace-pre-wrap rounded-md bg-background p-4 text-sm font-mono">
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
