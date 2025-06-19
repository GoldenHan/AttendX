
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserCheck, BarChartBig, ClipboardEdit, Brain, BookUser, BarChart3, Loader2 } from 'lucide-react'; // QrCode import removed
import Image from 'next/image';
import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import type { User, ClassInfo, AttendanceRecord } from '@/types';

export default function DashboardPage() {
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalClasses, setTotalClasses] = useState(0);
  const [attendanceToday, setAttendanceToday] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const usersSnapshot = await getDocs(query(collection(db, 'users'), where('role', '==', 'student')));
        setTotalStudents(usersSnapshot.size);

        const classesSnapshot = await getDocs(collection(db, 'classes'));
        setTotalClasses(classesSnapshot.size);

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1); // Start of tomorrow

        // Firestore Timestamps should be used for querying if data is stored as Timestamp
        // For ISO strings, this query might need adjustment or client-side filtering
        // Assuming 'timestamp' is stored as an ISO string.
        const attendanceQuery = query(
          collection(db, 'attendanceRecords'),
          where('status', '==', 'present')
          // Firestore doesn't directly support date range queries on string timestamps effectively.
          // This will fetch all 'present' records and then filter client-side.
          // For large datasets, consider storing date parts or using a serverless function for aggregation.
        );
        const attendanceSnapshot = await getDocs(attendanceQuery);
        let presentTodayCount = 0;
        attendanceSnapshot.docs.forEach(doc => {
          const record = doc.data() as AttendanceRecord;
          const recordDate = new Date(record.timestamp);
          if (recordDate >= today && recordDate < tomorrow) {
            presentTodayCount++;
          }
        });
        setAttendanceToday(presentTodayCount);

      } catch (error) {
        console.error("Error fetching dashboard data:", error);
        // Optionally set error state and display message
      }
      setIsLoading(false);
    };

    fetchDashboardData();
  }, []);

  const renderStatCard = (title: string, value: number, Icon: React.ElementType, description: string) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : <div className="text-2xl font-bold">{value}</div>}
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold font-headline">Welcome to SERVEX</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {renderStatCard("Total Students", totalStudents, Users, "Currently enrolled")}
        {renderStatCard("Active Classes", totalClasses, UserCheck, "Across all programs")}
        {renderStatCard("Attendance Today", attendanceToday, BarChartBig, "Students marked present")}
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
             {/* QR Session Login Button removed */}
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
