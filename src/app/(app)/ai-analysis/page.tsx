'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { analyzeAttendance } from '@/ai/flows/attendance-analysis';
import { useToast } from '@/hooks/use-toast';
import { Brain, Loader2 } from 'lucide-react';
import { generateAttendanceStringForAI } from '@/lib/mock-data';

export default function AiAnalysisPage() {
  const [attendanceData, setAttendanceData] = useState('');
  const [analysisResult, setAnalysisResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleAnalyze = async () => {
    if (!attendanceData.trim()) {
      toast({
        title: 'Input Required',
        description: 'Please provide attendance data for analysis.',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    setAnalysisResult(null);
    try {
      const result = await analyzeAttendance({ attendanceRecords: attendanceData });
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

  const loadSampleData = () => {
    setAttendanceData(generateAttendanceStringForAI());
     toast({
        title: 'Sample Data Loaded',
        description: 'Sample attendance data has been loaded into the textarea.',
      });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-6 w-6 text-primary" />
          Attendance AI Analysis
        </CardTitle>
        <CardDescription>
          Identify students at risk based on their attendance patterns. Paste attendance records below.
          Example format: <br />
          <code>Student Name A: YYYY-MM-DD: present, YYYY-MM-DD: absent;</code><br />
          <code>Student Name B: YYYY-MM-DD: late, YYYY-MM-DD: present;</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="attendanceData">Attendance Records</Label>
          <Textarea
            id="attendanceData"
            value={attendanceData}
            onChange={(e) => setAttendanceData(e.target.value)}
            placeholder="Paste attendance records here..."
            rows={10}
            className="font-code"
          />
        </div>
        <div className="flex gap-2">
          <Button onClick={handleAnalyze} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Attendance'
            )}
          </Button>
          <Button onClick={loadSampleData} variant="outline" disabled={isLoading}>
            Load Sample Data
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
