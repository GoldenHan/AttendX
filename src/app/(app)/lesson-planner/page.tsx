
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { generateLessonPlanIdeas, type LessonPlannerOutput } from '@/ai/flows/lesson-planner';
import { useToast } from '@/hooks/use-toast';
import { Loader2, NotebookPen, Lightbulb, Clipboard } from 'lucide-react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';
import type { Group } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export default function LessonPlannerPage() {
  const [manageableGroups, setManageableGroups] = useState<Group[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(true);
  const [analysisResult, setAnalysisResult] = useState<LessonPlannerOutput | null>(null);
  const { toast } = useToast();
  const { firestoreUser, loading: authLoading } = useAuth();

  const fetchManageableGroups = useCallback(async () => {
    if (!firestoreUser || !firestoreUser.institutionId || authLoading) {
      setIsLoadingGroups(false);
      return;
    }
    setIsLoadingGroups(true);
    try {
      let groupsQuerySnapshot;
      if (firestoreUser.role === 'admin') {
        groupsQuerySnapshot = await getDocs(query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId)
        ));
      } else if (firestoreUser.role === 'supervisor') {
        if (!firestoreUser.sedeId) {
          setManageableGroups([]);
          setIsLoadingGroups(false);
          return;
        }
        groupsQuerySnapshot = await getDocs(query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId),
          where('sedeId', '==', firestoreUser.sedeId)
        ));
      } else if (firestoreUser.role === 'teacher') {
        groupsQuerySnapshot = await getDocs(query(
          collection(db, 'groups'),
          where('institutionId', '==', firestoreUser.institutionId),
          where('teacherId', '==', firestoreUser.id)
        ));
      } else {
        setManageableGroups([]);
        setIsLoadingGroups(false);
        return;
      }

      const groups = groupsQuerySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Group));
      setManageableGroups(groups);

    } catch (error) {
      console.error('Error fetching manageable groups:', error);
      toast({ title: 'Error', description: 'Could not load your groups.', variant: 'destructive' });
      setManageableGroups([]);
    }
    setIsLoadingGroups(false);
  }, [firestoreUser, toast, authLoading]);

  useEffect(() => {
    if (!authLoading && firestoreUser && firestoreUser.institutionId) {
      fetchManageableGroups();
    }
  }, [authLoading, firestoreUser, fetchManageableGroups]);

  const selectedGroup = useMemo(() => {
    return manageableGroups.find(g => g.id === selectedGroupId);
  }, [manageableGroups, selectedGroupId]);

  const getStudentLevelForGroup = useCallback((group: Group | undefined): string => {
    if (!group) return 'General';
    const name = group.name.toLowerCase();
    if (name.includes('beginner')) return 'Beginner';
    if (name.includes('intermediate')) return 'Intermediate';
    if (name.includes('advanced')) return 'Advanced';
    return 'General';
  }, []);

  const handleGenerate = async () => {
    if (!selectedGroup) {
      toast({
        title: 'No Group Selected',
        description: 'Please select a group to generate lesson ideas.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    setAnalysisResult(null);

    try {
      toast({
        title: 'Generating Ideas...',
        description: 'The AI is creating lesson plans for your group. This may take a moment.',
      });
      
      const groupLevel = getStudentLevelForGroup(selectedGroup);
      const result = await generateLessonPlanIdeas({
        groupName: selectedGroup.name,
        groupLevel: groupLevel,
      });

      setAnalysisResult(result);
      toast({
        title: 'Ideas Generated!',
        description: 'AI lesson plan ideas are ready for review.',
      });

    } catch (error) {
      console.error('AI Lesson Planner Error:', error);
      toast({
        title: 'Generation Failed',
        description: 'An error occurred while generating ideas. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied to Clipboard!', description: 'The lesson idea has been copied.' });
  };
  
  if (authLoading || isLoadingGroups) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><NotebookPen className="h-6 w-6 text-primary" /> AI Lesson Planner</CardTitle>
                <CardDescription>Loading user and group data...</CardDescription>
            </CardHeader>
            <CardContent className="flex items-center justify-center py-10">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </CardContent>
        </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="h-6 w-6 text-primary" />
          AI Lesson Planner
        </CardTitle>
        <CardDescription>
          Select a group to generate creative lesson plan ideas, including topics, objectives, and activities.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-grow w-full sm:w-auto">
            <Label htmlFor="group-select">Select a Group</Label>
            <Select value={selectedGroupId} onValueChange={setSelectedGroupId} disabled={manageableGroups.length === 0}>
                <SelectTrigger id="group-select">
                    <SelectValue placeholder={manageableGroups.length === 0 ? "No groups available" : "Select a group..."} />
                </SelectTrigger>
                <SelectContent>
                    {manageableGroups.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                            {group.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
          </div>
          <Button onClick={handleGenerate} disabled={isLoading || !selectedGroupId}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
                <>
                <Lightbulb className="mr-2 h-4 w-4" />
                Generate Ideas
                </>
            )}
          </Button>
        </div>
        
        {manageableGroups.length === 0 && !authLoading && !isLoadingGroups && (
             <Alert variant="default" className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 [&>svg]:text-yellow-600">
                <Lightbulb className="h-4 w-4"/>
                <AlertTitle>No Groups Found</AlertTitle>
                <AlertDescription>
                    You are not assigned to any groups, or no groups exist for your Sede/Institution. You need to manage or be assigned to a group to use this feature.
                </AlertDescription>
             </Alert>
        )}

        {isLoading && (
            <div className="flex items-center justify-center text-muted-foreground p-4 bg-muted/50 rounded-md">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                The AI is thinking... Please wait a few moments.
            </div>
        )}

        {analysisResult && (
          <div className="mt-6 space-y-4">
             <h3 className="text-xl font-semibold text-center">Lesson Ideas for: {selectedGroup?.name}</h3>
            {analysisResult.lessonIdeas.map((idea, index) => (
              <Card key={index} className="bg-secondary/20">
                <CardHeader>
                  <CardTitle className="flex justify-between items-start">
                    <div className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-500"/>
                      {idea.topic}
                    </div>
                     <Button variant="ghost" size="sm" onClick={() => copyToClipboard(`Topic: ${idea.topic}\nObjective: ${idea.objective}\nActivities:\n- ${idea.activities.join('\n- ')}`)}>
                        <Clipboard className="mr-2 h-4 w-4"/>
                        Copy
                    </Button>
                  </CardTitle>
                  <CardDescription>
                    <strong>Objective:</strong> {idea.objective}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <h4 className="font-semibold mb-2">Suggested Activities:</h4>
                  <ul className="space-y-1 list-disc pl-5 text-sm">
                    {idea.activities.map((activity, actIndex) => (
                      <li key={actIndex}>{activity}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
