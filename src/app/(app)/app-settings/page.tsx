
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Settings, Download, RefreshCw, Moon, Sun, Save, Loader2, AlertTriangle, Clock, Image as ImageIcon, Trash2 as RemoveIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import React, { useState, useEffect, useCallback, ChangeEvent } from 'react';
import { db } from '@/lib/firebase';
import { doc, getDoc, setDoc, collection, getDocs, query, where, updateDoc } from 'firebase/firestore';
import type { GradingConfiguration, User, ClassScheduleConfiguration } from '@/types';
import { DEFAULT_GRADING_CONFIG, DEFAULT_CLASS_SCHEDULE_CONFIG } from '@/types';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';

const MAX_LOGO_SIZE_MB = 1;

export default function AppSettingsPage() {
  const { toast } = useToast();
  const { firestoreUser, institution, refreshInstitutionData, fetchGradingConfigForInstitution } = useAuth();

  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  
  // Institution Branding States
  const [appName, setAppName] = useState('');
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [isSavingAppearance, setIsSavingAppearance] = useState(false);
  const [isProcessingLogo, setIsProcessingLogo] = useState(false);

  const [isSavingGradingConfig, setIsSavingGradingConfig] = useState(false);
  const [gradingConfig, setGradingConfig] = useState<GradingConfiguration>(DEFAULT_GRADING_CONFIG);
  const [isLoadingGradingConfig, setIsLoadingGradingConfig] = useState(true);

  const [isSavingScheduleConfig, setIsSavingScheduleConfig] = useState(false);
  const [classScheduleConfig, setClassScheduleConfig] = useState<ClassScheduleConfiguration>(DEFAULT_CLASS_SCHEDULE_CONFIG);
  const [isLoadingScheduleConfig, setIsLoadingScheduleConfig] = useState(true);

  // Effect to handle local theme preference
  useEffect(() => {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'dark') {
      document.documentElement.classList.add('dark');
      setIsDarkMode(true);
    } else {
      document.documentElement.classList.remove('dark');
      setIsDarkMode(false);
    }
  }, []);

  // Effect to load institution-specific settings from AuthContext
  useEffect(() => {
    if (institution) {
      setAppName(institution.appName || institution.name || '');
      setLogoPreviewUrl(institution.logoDataUrl || null);
    }
  }, [institution]);


  const loadGradingConfiguration = useCallback(async () => {
    if (!firestoreUser?.institutionId) {
      setIsLoadingGradingConfig(false);
      setGradingConfig(DEFAULT_GRADING_CONFIG);
      toast({ title: "Error", description: "Cannot load grading config without institution ID.", variant: "destructive" });
      return;
    }
    setIsLoadingGradingConfig(true);
    try {
      const config = await fetchGradingConfigForInstitution(firestoreUser.institutionId);
      setGradingConfig(config);
      const configDocRef = doc(db, 'institutionGradingConfigs', firestoreUser.institutionId);
      const docSnap = await getDoc(configDocRef);
      if (!docSnap.exists()) {
        toast({
          title: "Default Grading Config",
          description: "No specific grading configuration found for your institution. Loaded default values. Save to create one.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error fetching institution grading configuration:", error);
      setGradingConfig(DEFAULT_GRADING_CONFIG);
      toast({
        title: "Error Loading Grading Config",
        description: "Could not load. Using default values.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingGradingConfig(false);
    }
  }, [firestoreUser, toast, fetchGradingConfigForInstitution]);

  const loadClassScheduleConfiguration = useCallback(async () => {
    if (!firestoreUser?.institutionId) {
      setIsLoadingScheduleConfig(false);
      setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG);
      toast({ title: "Error", description: "Cannot load schedule config without institution ID.", variant: "destructive" });
      return;
    }
    setIsLoadingScheduleConfig(true);
    try {
      const configDocRef = doc(db, 'institutionScheduleConfigs', firestoreUser.institutionId);
      const docSnap = await getDoc(configDocRef);
      if (docSnap.exists()) {
        setClassScheduleConfig(docSnap.data() as ClassScheduleConfiguration);
      } else {
        setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG);
        toast({
          title: "Default Schedule Config",
          description: "No schedule configuration found for your institution. Loaded default values. Save to create one.",
          variant: "default",
        });
      }
    } catch (error) {
      console.error("Error fetching class schedule configuration:", error);
      setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG);
      toast({
        title: "Error Loading Schedule Config",
        description: "Could not load. Using default values.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingScheduleConfig(false);
    }
  }, [firestoreUser, toast]);

  useEffect(() => {
    if (firestoreUser?.institutionId) {
        loadGradingConfiguration();
        loadClassScheduleConfiguration();
    } else {
        setIsLoadingGradingConfig(false);
        setIsLoadingScheduleConfig(false);
        setGradingConfig(DEFAULT_GRADING_CONFIG);
        setClassScheduleConfig(DEFAULT_CLASS_SCHEDULE_CONFIG);
    }
  }, [firestoreUser, loadGradingConfiguration, loadClassScheduleConfiguration]);


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
  
  const handleSaveAppearance = async () => {
    if (!firestoreUser?.institutionId) {
      toast({ title: "Error", description: "No institution found to save settings to.", variant: 'destructive'});
      return;
    }
    setIsSavingAppearance(true);
    try {
      const institutionRef = doc(db, 'institutions', firestoreUser.institutionId);
      await updateDoc(institutionRef, {
        appName: appName,
        logoDataUrl: logoPreviewUrl,
      });
      await refreshInstitutionData(); 
      toast({ title: "Branding Saved", description: "Institution name and logo have been updated for all users." });
    } catch (error) {
      console.error("Error saving appearance settings:", error);
      toast({ title: "Save Failed", description: "Could not save appearance settings.", variant: 'destructive'});
    } finally {
      setIsSavingAppearance(false);
    }
  }


  const handleLogoFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.size > MAX_LOGO_SIZE_MB * 1024 * 1024) {
        toast({
          title: 'File Too Large',
          description: `Logo image must be smaller than ${MAX_LOGO_SIZE_MB}MB. Please choose a smaller file.`,
          variant: 'destructive',
        });
        event.target.value = '';
        return;
      }
      setIsProcessingLogo(true);
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        setLogoPreviewUrl(dataUrl);
        setIsProcessingLogo(false);
      };
      reader.onerror = () => {
        toast({ title: 'File Read Error', description: 'Could not read the selected logo file.', variant: 'destructive' });
        setIsProcessingLogo(false);
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    }
  };

  const handleRemoveLogo = () => {
    setLogoPreviewUrl(null);
  };


  const handleExportStudentData = async () => {
    if (!firestoreUser?.institutionId) {
      toast({ title: 'Error', description: 'No institution context for export.', variant: 'destructive'});
      return;
    }
    setIsExporting(true);
    toast({ title: 'Initiating Export', description: 'Preparing student data...' });
    try {
      const studentsSnapshot = await getDocs(query(collection(db, 'users'), 
        where('role', '==', 'student'),
        where('institutionId', '==', firestoreUser.institutionId)
      ));
      const studentsData = studentsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User));

      if (studentsData.length === 0) {
        toast({ title: 'No Data', description: 'No students to export from your institution.', variant: 'default' });
        setIsExporting(false);
        return;
      }

      const jsonString = JSON.stringify(studentsData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(appName || 'app').toLowerCase().replace(/\s+/g, '_')}_students_export_${firestoreUser.institutionId.substring(0,5)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: 'Export Complete', description: 'Student data downloaded as JSON.' });
    } catch (error) {
      console.error("Error exporting student data:", error);
      toast({ title: 'Export Failed', description: 'Could not export data.', variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleRefreshData = () => {
    toast({ title: 'Refreshing Data', description: 'The page will reload to fetch the latest data.' });
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
    if (!firestoreUser?.institutionId) {
      toast({ title: "Error", description: "Cannot save grading config without institution ID.", variant: "destructive" });
      return;
    }
    setIsSavingGradingConfig(true);
    try {
      const configDocRef = doc(db, 'institutionGradingConfigs', firestoreUser.institutionId);
      const { ...configToSave } = gradingConfig; 
      await setDoc(configDocRef, configToSave, { merge: true });
      toast({ title: 'Configuration Saved', description: 'Grading configuration for your institution has been saved.' });
       if (typeof fetchGradingConfigForInstitution === 'function') {
        await fetchGradingConfigForInstitution(firestoreUser.institutionId);
      }
    } catch (error) {
      console.error("Error saving grading configuration:", error);
      toast({ title: 'Save Error', description: 'Could not save grading configuration.', variant: 'destructive' });
    } finally {
      setIsSavingGradingConfig(false);
    }
  };

  const handleClassScheduleConfigChange = (field: keyof ClassScheduleConfiguration, value: string) => {
    setClassScheduleConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSaveClassScheduleConfiguration = async () => {
    if (!firestoreUser?.institutionId) {
      toast({ title: "Error", description: "Cannot save schedule config without institution ID.", variant: "destructive" });
      return;
    }
    setIsSavingScheduleConfig(true);
    try {
      const configDocRef = doc(db, 'institutionScheduleConfigs', firestoreUser.institutionId);
      const { ...configToSave } = classScheduleConfig;
      await setDoc(configDocRef, configToSave, { merge: true });
      toast({ title: 'Configuration Saved', description: 'Class schedule configuration for your institution has been saved.' });
    } catch (error) {
      console.error("Error saving class schedule configuration:", error);
      toast({ title: 'Save Error', description: 'Could not save schedule configuration.', variant: 'destructive' });
    } finally {
      setIsSavingScheduleConfig(false);
    }
  };

   if (!firestoreUser?.institutionId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings className="h-6 w-6 text-primary" /> Application Settings</CardTitle>
          <CardDescription>Loading institution details...</CardDescription>
        </CardHeader>
        <CardContent>
          <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Verifying institution...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Application Settings
          </CardTitle>
          <CardDescription>Configure general application settings, appearance, and data management for your institution.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">

          <div className="space-y-3">
            <h3 className="text-lg font-medium text-foreground">Branding de la Institución (Global)</h3>
            <Separator />
            <div className="space-y-4 pt-2">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="appName">Nombre de la Aplicación</Label>
                <Input id="appName" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Enter application name" />
                <p className="text-xs text-muted-foreground">Este nombre se mostrará a todos los usuarios de tu institución.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="logoFile">Logo de la Aplicación</Label>
                <Input 
                    id="logoFile" 
                    type="file" 
                    accept="image/png, image/jpeg, image/gif, image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                    disabled={isProcessingLogo}
                />
                <div className="flex items-center gap-2">
                    {logoPreviewUrl && (
                        <Button onClick={handleRemoveLogo} variant="outline" size="sm" className="text-destructive hover:text-destructive-foreground hover:bg-destructive/90" disabled={isProcessingLogo}>
                            <RemoveIcon className="mr-2 h-4 w-4" />
                            Remove Logo
                        </Button>
                    )}
                    {isProcessingLogo && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  Sube un logo (PNG, JPG, GIF, SVG, max {MAX_LOGO_SIZE_MB}MB). Se mostrará a todos los usuarios de tu institución.
                </p>
                {logoPreviewUrl && (
                  <div className="mt-2 p-2 border rounded-md inline-block bg-muted">
                    <Image src={logoPreviewUrl} alt="Logo Preview" width={100} height={40} className="object-contain h-auto max-h-[40px] w-auto max-w-[150px]" onError={() => {
                       toast({ title: 'Logo Error', description: 'Could not load image from the provided data.', variant: 'destructive'});
                       setLogoPreviewUrl(null);
                    }} />
                  </div>
                )}
              </div>
               <Button onClick={handleSaveAppearance} disabled={isSavingAppearance}>
                  {isSavingAppearance ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Guardar Branding
                </Button>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-medium text-foreground">Configuración Local del Navegador</h3>
            <Separator />
            <div className="space-y-4 pt-2">
               <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div className="space-y-0.5">
                  <Label htmlFor="darkModeToggle" className="text-base">Dark Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Alterna entre temas claro y oscuro. Esta preferencia es solo para este navegador.
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
              Class Schedule Configuration (Institution: {firestoreUser?.institutionId?.substring(0,6)}...)
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
                        <SelectItem value="Saturday">Saturday Only</SelectItem>
                        <SelectItem value="Sunday">Sunday Only</SelectItem>
                        <SelectItem value="SaturdayAndSunday">Both Weekends (Sat &amp; Sun)</SelectItem>
                        <SelectItem value="Daily">Daily (Weekdays)</SelectItem>
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
                        <p>This configuration sets default schedule types and times for your institution. Specific groups may override these if group-level scheduling is implemented.</p>
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
            <h3 className="text-lg font-medium text-foreground">Grading System Configuration (Institution: {firestoreUser?.institutionId?.substring(0,6)}...)</h3>
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
                        <p>Changing these settings will affect how new grades are entered and how existing grades are displayed and validated across your institution. Ensure these values are correct for your institution's policies.</p>
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
            <h3 className="text-lg font-medium text-foreground">Data Management (Institution: {firestoreUser?.institutionId?.substring(0,6)}...)</h3>
            <Separator />
            <div className="space-y-4 pt-2">
               <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                 <div>
                    <Label className="text-base">Export Student Data</Label>
                    <p className="text-xs text-muted-foreground">
                        Export all student records from your institution to a JSON file.
                    </p>
                 </div>
                <Button variant="outline" onClick={handleExportStudentData} disabled={isExporting}>
                  {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                  Exportar Estudiantes (JSON)
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div>
                    <Label className="text-base">Refrescar Datos de la Aplicación</Label>
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
        Note: Changes to grading or schedule configuration are specific to your institution.
      </p>
    </div>
  );
}
