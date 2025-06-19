
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Settings, Download, RefreshCw, Moon, Sun, Save, Loader2, AlertTriangle, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, where } from 'firebase/firestore';
import type { GradingConfiguration, User, ClassScheduleConfiguration } from '@/types';
import { DEFAULT_GRADING_CONFIG, DEFAULT_CLASS_SCHEDULE_CONFIG } from '@/types';

export default function AppSettingsPage() {
  const { toast } = useToast();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [appName, setAppName] = useState("SERVEX");
  const [isExporting, setIsExporting] = useState(false);
  
  const [isSavingGradingConfig, setIsSavingGradingConfig] = useState(false);
  const [gradingConfig, setGradingConfig] = useState<GradingConfiguration>(DEFAULT_GRADING_CONFIG);
  const [isLoadingGradingConfig, setIsLoadingGradingConfig] = useState(true);

  const [isSavingScheduleConfig, setIsSavingScheduleConfig] = useState(false);
  const [classScheduleConfig, setClassScheduleConfig] = useState<ClassScheduleConfiguration>(DEFAULT_CLASS_SCHEDULE_CONFIG);
  const [isLoadingScheduleConfig, setIsLoadingScheduleConfig] = useState(true);


  useEffect(() => {
    const currentThemeIsDark = document.documentElement.classList.contains('dark');
    setIsDarkMode(currentThemeIsDark);
    const storedAppName = localStorage.getItem('appName');
    if (storedAppName) {
      setAppName(storedAppName);
    }
  }, []);

  const fetchGradingConfiguration = useCallback(async () => {
    setIsLoadingGradingConfig(true);
    try {
      const configDocRef = doc(db, 'appConfiguration', 'currentGradingConfig');
      const docSnap = await getDoc(configDocRef);
      if (docSnap.exists()) {
        setGradingConfig(docSnap.data() as GradingConfiguration);
      } else {
        setGradingConfig(DEFAULT_GRADING_CONFIG);
        toast({
          title: "Configuración por Defecto (Calificación)",
          description: "No se encontró configuración de calificación. Se cargaron valores por defecto.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error fetching grading configuration:", error);
      setGradingConfig(DEFAULT_GRADING_CONFIG);
      toast({
        title: "Error al Cargar Configuración de Calificación",
        description: "No se pudo cargar. Se usan valores por defecto.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingGradingConfig(false);
    }
  }, [toast]);

  const fetchClassScheduleConfiguration = useCallback(async () => {
    setIsLoadingScheduleConfig(true);
    try {
      const configDocRef = doc(db, 'appConfiguration', 'currentClassScheduleConfig');
      const docSnap = await getDoc(configDocRef);
      if (docSnap.exists()) {
        setClassScheduleConfig(docSnap.data() as ClassScheduleConfiguration);
      } else {
        setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG);
        toast({
          title: "Configuración por Defecto (Horario)",
          description: "No se encontró configuración de horario. Se cargaron valores por defecto.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error fetching class schedule configuration:", error);
      setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG);
      toast({
        title: "Error al Cargar Configuración de Horario",
        description: "No se pudo cargar. Se usan valores por defecto.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingScheduleConfig(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchGradingConfiguration();
    fetchClassScheduleConfiguration();
  }, [fetchGradingConfiguration, fetchClassScheduleConfiguration]);


  const handleThemeToggle = (checked: boolean) => {
    setIsDarkMode(checked);
    if (checked) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
    toast({ title: 'Theme Changed', description: `Switched to ${checked ? 'Dark' : 'Light'} Mode.` });
  };

  const handleAppNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newName = e.target.value;
    setAppName(newName);
    localStorage.setItem('appName', newName);
  };

  const handleExportStudentData = async () => {
    setIsExporting(true);
    toast({ title: 'Iniciando Exportación', description: 'Preparando datos de estudiantes...' });
    try {
      const studentsSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
      const studentsData = studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));

      if (studentsData.length === 0) {
        toast({ title: 'Sin Datos', description: 'No hay estudiantes para exportar.', variant: 'default' });
        return;
      }

      const jsonString = JSON.stringify(studentsData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${appName.toLowerCase().replace(/\s+/g, '_')}_students_export.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: 'Exportación Completa', description: 'Datos de estudiantes descargados como JSON.' });
    } catch (error) {
      console.error("Error exporting student data:", error);
      toast({ title: 'Exportación Fallida', description: 'No se pudieron exportar los datos.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefreshData = () => {
    toast({ title: 'Refrescando Datos', description: 'La página se recargará para obtener los datos más recientes.' });
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const handleGradingConfigChange = (field: keyof GradingConfiguration, value: string | number | boolean) => {
    let processedValue = value;
    if (field === 'numberOfPartials' || field === 'passingGrade' || field === 'maxIndividualActivityScore' || field === 'maxTotalAccumulatedScore' || field === 'maxExamScore') {
        processedValue = Number(value);
        if (isNaN(processedValue as number)) processedValue = 0; 
         if (field === 'numberOfPartials') processedValue = Math.max(1, Math.min(4, processedValue as number));
         if (field === 'passingGrade') processedValue = Math.max(0, Math.min(100, processedValue as number));
         if (field === 'maxIndividualActivityScore') processedValue = Math.max(0, processedValue as number);
         if (field === 'maxTotalAccumulatedScore') processedValue = Math.max(0, processedValue as number);
         if (field === 'maxExamScore') processedValue = Math.max(0, processedValue as number);
    }
    setGradingConfig(prev => ({ ...prev, [field]: processedValue }));
  };

  const handleSaveGradingConfiguration = async () => {
    setIsSavingGradingConfig(true);
    try {
      const configDocRef = doc(db, 'appConfiguration', 'currentGradingConfig');
      await setDoc(configDocRef, gradingConfig, { merge: true });
      toast({ title: 'Configuración Guardada', description: 'La configuración de calificación ha sido guardada.' });
    } catch (error) {
      console.error("Error saving grading configuration:", error);
      toast({ title: 'Error al Guardar', description: 'No se pudo guardar la configuración de calificación.', variant: 'destructive' });
    } finally {
      setIsSavingGradingConfig(false);
    }
  };

  const handleClassScheduleConfigChange = (field: keyof ClassScheduleConfiguration, value: string) => {
    setClassScheduleConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveClassScheduleConfiguration = async () => {
    setIsSavingScheduleConfig(true);
    try {
      const configDocRef = doc(db, 'appConfiguration', 'currentClassScheduleConfig');
      await setDoc(configDocRef, classScheduleConfig, { merge: true });
      toast({ title: 'Configuración Guardada', description: 'La configuración de horario de clases ha sido guardada.' });
    } catch (error) {
      console.error("Error saving class schedule configuration:", error);
      toast({ title: 'Error al Guardar', description: 'No se pudo guardar la configuración de horario.', variant: 'destructive' });
    } finally {
      setIsSavingScheduleConfig(false);
    }
  };


  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Application Settings
          </CardTitle>
          <CardDescription>Configure general application settings, appearance, and data management.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">

          <div className="space-y-3">
            <h3 className="text-lg font-medium text-foreground">General Appearance</h3>
            <Separator />
            <div className="space-y-4 pt-2">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="appName">Application Name</Label>
                <Input id="appName" value={appName} onChange={handleAppNameChange} placeholder="Enter application name" />
                <p className="text-xs text-muted-foreground">This name will be displayed and used in exports.</p>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <Label htmlFor="darkModeToggle" className="text-base">Dark Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Toggle between light and dark themes for the application.
                  </p>
                </div>
                <Switch
                  id="darkModeToggle"
                  checked={isDarkMode}
                  onCheckedChange={handleThemeToggle}
                  aria-label="Toggle dark mode"
                />
                {isDarkMode ? <Moon className="ml-2 h-5 w-5" /> : <Sun className="ml-2 h-5 w-5" />}
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <h3 className="text-lg font-medium text-foreground flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Class Schedule Configuration
            </h3>
            <Separator />
            {isLoadingScheduleConfig ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading class schedule configuration...
              </div>
            ) : (
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="scheduleType">Schedule Type</Label>
                    <Select
                      value={classScheduleConfig.scheduleType}
                      onValueChange={(val) => handleClassScheduleConfigChange('scheduleType', val)}
                    >
                      <SelectTrigger id="scheduleType"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NotSet">Not Set / Varies</SelectItem>
                        <SelectItem value="Saturday">Sabatino (Saturday Only)</SelectItem>
                        <SelectItem value="Sunday">Dominical (Sunday Only)</SelectItem>
                        <SelectItem value="Daily">Diario (Weekdays)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="startTime">Default Start Time</Label>
                    <Input 
                      id="startTime" 
                      type="time" 
                      value={classScheduleConfig.startTime} 
                      onChange={(e) => handleClassScheduleConfigChange('startTime', e.target.value)} 
                    />
                  </div>
                  <div className="flex flex-col space-y-1.5">
                    <Label htmlFor="endTime">Default End Time</Label>
                    <Input 
                      id="endTime" 
                      type="time" 
                      value={classScheduleConfig.endTime} 
                      onChange={(e) => handleClassScheduleConfigChange('endTime', e.target.value)} 
                    />
                  </div>
                </div>
                <div className="mt-1 p-3 border border-blue-500/50 bg-blue-50 dark:bg-blue-900/30 rounded-md text-sm text-blue-700 dark:text-blue-300 flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0 text-blue-500"/>
                    <div>
                        <p className="font-medium">Informational Note:</p>
                        <p>This configuration sets default schedule types and times. Specific groups may override these if group-level scheduling is implemented.</p>
                    </div>
                </div>
                <Button onClick={handleSaveClassScheduleConfiguration} disabled={isSavingScheduleConfig || isLoadingScheduleConfig}>
                  {isSavingScheduleConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save Schedule Configuration
                </Button>
              </div>
            )}
          </div>


          <div className="space-y-3">
            <h3 className="text-lg font-medium text-foreground">Grading System Configuration</h3>
            <Separator />
            {isLoadingGradingConfig ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading grading configuration...
              </div>
            ) : (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="numberOfPartials">Number of Partials (1-4)</Label>
                  <Select
                    value={String(gradingConfig.numberOfPartials)}
                    onValueChange={(val) => handleGradingConfigChange('numberOfPartials', val)}
                  >
                    <SelectTrigger id="numberOfPartials"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map(num => (
                        <SelectItem key={num} value={String(num)}>{num}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="passingGrade">Passing Grade (0-100)</Label>
                  <Input id="passingGrade" type="number" min="0" max="100" value={gradingConfig.passingGrade} onChange={(e) => handleGradingConfigChange('passingGrade', e.target.value)} />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="maxIndividualActivityScore">Max Score per Individual Activity</Label>
                  <Input id="maxIndividualActivityScore" type="number" min="0" value={gradingConfig.maxIndividualActivityScore} onChange={(e) => handleGradingConfigChange('maxIndividualActivityScore', e.target.value)} />
                </div>
                 <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="maxTotalAccumulatedScore">Max Total Score for Accumulated Activities (per partial)</Label>
                  <Input id="maxTotalAccumulatedScore" type="number" min="0" value={gradingConfig.maxTotalAccumulatedScore} onChange={(e) => handleGradingConfigChange('maxTotalAccumulatedScore', e.target.value)} />
                </div>
                <div className="flex flex-col space-y-1.5">
                  <Label htmlFor="maxExamScore">Max Score for Exam (per partial)</Label>
                  <Input id="maxExamScore" type="number" min="0" value={gradingConfig.maxExamScore} onChange={(e) => handleGradingConfigChange('maxExamScore', e.target.value)} />
                </div>
              </div>
                <div className="mt-1 p-3 border border-amber-500/50 bg-amber-50 dark:bg-amber-900/30 rounded-md text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 mt-0.5 shrink-0"/>
                    <div>
                        <p className="font-medium">Important Note:</p>
                        <p>Changing these settings will affect how new grades are entered and how existing grades are displayed and validated across the application. Ensure these values are correct for your institution's policies.</p>
                        <p className="mt-1">The total score for a partial will be the sum of "Max Total Accumulated Score" and "Max Exam Score".</p>
                    </div>
                </div>
              <Button onClick={handleSaveGradingConfiguration} disabled={isSavingGradingConfig || isLoadingGradingConfig}>
                {isSavingGradingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Grading Configuration
              </Button>
            </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-medium text-foreground">Data Management</h3>
            <Separator />
            <div className="space-y-4 pt-2">
               <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                 <div>
                    <Label className="text-base">Export Student Data</Label>
                    <p className="text-xs text-muted-foreground">
                        Export all student records (from 'users' collection, role 'student') to a JSON file.
                    </p>
                 </div>
                <Button variant="outline" onClick={handleExportStudentData} disabled={isExporting}>
                  {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Export Students (JSON)
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div>
                    <Label className="text-base">Refresh Application Data</Label>
                    <p className="text-xs text-muted-foreground">
                        Reload the current page to fetch the latest data from the server.
                    </p>
                </div>
                <Button variant="outline" onClick={handleRefreshData}>
                  <RefreshCw className="mr-2 h-4 w-4" /> Refresh Data
                </Button>
              </div>
            </div>
          </div>

        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground text-center">
        Note: Changes to grading or schedule configuration are global. Ensure data consistency if modified after grades or schedules have been entered.
      </p>
    </div>
  );
}
