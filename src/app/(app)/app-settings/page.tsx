
'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Settings, Download, ArchiveRestore, Moon, Sun } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import React, { useState, useEffect } from 'react';

export default function AppSettingsPage() {
  const { toast } = useToast();
  // For dark mode toggle - this is a simplified example.
  // Real dark mode toggle would involve context or theme provider.
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [appName, setAppName] = useState("SERVEX"); // Example app name

  useEffect(() => {
    // Simulate fetching app name or theme preference
    // In a real app, this would come from localStorage, context, or a backend.
    const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('theme') : null;
    if (storedTheme === 'dark') {
      setIsDarkMode(true);
    }
    // const storedAppName = ... fetch from somewhere
    // setAppName(storedAppName || "SERVEX");
  }, []);

  const handleThemeToggle = (checked: boolean) => {
    setIsDarkMode(checked);
    if (typeof window !== 'undefined') {
      document.documentElement.classList.toggle('dark', checked);
      localStorage.setItem('theme', checked ? 'dark' : 'light');
      toast({ title: 'Theme Changed', description: `Switched to ${checked ? 'Dark' : 'Light'} Mode.` });
    }
  };

  const handlePlaceholderAction = (actionName: string) => {
    toast({ title: 'Action Placeholder', description: `${actionName} functionality is not yet implemented.` });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-6 w-6 text-primary" />
            Application Settings
          </CardTitle>
          <CardDescription>Configure general application settings and preferences.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">General</h3>
            <Separator />
            <div className="space-y-4 pt-2">
              <div className="flex flex-col space-y-1.5">
                <Label htmlFor="appName">Application Name</Label>
                <Input id="appName" value={appName} onChange={(e) => setAppName(e.target.value)} placeholder="Enter application name" />
                <p className="text-xs text-muted-foreground">This name will be displayed throughout the application.</p>
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

          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">Data Management</h3>
            <Separator />
            <div className="space-y-4 pt-2">
               <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                 <div>
                    <Label className="text-base">Export Data</Label>
                    <p className="text-xs text-muted-foreground">
                        Export all application data (users, classes, attendance) to a CSV file.
                    </p>
                 </div>
                <Button variant="outline" onClick={() => handlePlaceholderAction('Export Data')}>
                  <Download className="mr-2 h-4 w-4" /> Export (Soon)
                </Button>
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3 shadow-sm">
                <div>
                    <Label className="text-base">Clear Cache</Label>
                    <p className="text-xs text-muted-foreground">
                        Clear locally cached application data. This might resolve some display issues.
                    </p>
                </div>
                <Button variant="outline" onClick={() => handlePlaceholderAction('Clear Cache')}>
                  <ArchiveRestore className="mr-2 h-4 w-4" /> Clear Cache (Soon)
                </Button>
              </div>
            </div>
          </div>
          
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground text-center">
        Note: Most settings on this page are illustrative and might not be fully functional yet.
      </p>
    </div>
  );
}
