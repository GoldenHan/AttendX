'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserCheck, BarChartBig, ClipboardEdit, Brain, QrCode, BookUser, BarChart3 } from 'lucide-react';
import Image from 'next/image';
import { mockUsers, mockClasses, mockAttendanceRecords } from '@/lib/mock-data';

export default function DashboardPage() {
  const totalStudents = mockUsers.filter(u => u.role === 'student').length;
  const totalClasses = mockClasses.length;
  const attendanceToday = mockAttendanceRecords.filter(ar => {
    // This is a simplified check for "today". In a real app, use date-fns or similar.
    const recordDate = new Date(ar.timestamp).toISOString().split('T')[0];
    const todayDate = new Date().toISOString().split('T')[0];
    return recordDate === todayDate && ar.status === 'present';
  }).length;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold font-headline">Welcome to AttendX</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalStudents}</div>
            <p className="text-xs text-muted-foreground">Currently enrolled</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Classes</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalClasses}</div>
            <p className="text-xs text-muted-foreground">Across all programs</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Attendance Today</CardTitle>
            <BarChartBig className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{attendanceToday}</div>
            <p className="text-xs text-muted-foreground">Students marked present</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Easily access common tasks.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Button asChild variant="outline" className="w-full">
              <Link href="/attendance-log">
                <ClipboardEdit className="mr-2 h-4 w-4" /> Log Attendance
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/attendance-records">
                <BookUser className="mr-2 h-4 w-4" /> View Records
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/reports">
                <BarChart3 className="mr-2 h-4 w-4" /> Generate Reports
              </Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/ai-analysis">
                <Brain className="mr-2 h-4 w-4" /> AI Analysis
              </Link>
            </Button>
             <Button asChild variant="outline" className="w-full">
              <Link href="/qr-login-setup">
                <QrCode className="mr-2 h-4 w-4" /> QR Session Login
              </Link>
            </Button>
          </CardContent>
        </Card>
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle>Academy Overview</CardTitle>
            <CardDescription>A glimpse into our learning environment.</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <div className="aspect-video w-full overflow-hidden rounded-md">
              <Image 
                src="https://placehold.co/600x400.png" 
                alt="Academy classroom" 
                width={600} 
                height={400} 
                className="object-cover w-full h-full"
                data-ai-hint="classroom students"
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
