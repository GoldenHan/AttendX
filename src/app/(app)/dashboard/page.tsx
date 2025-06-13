
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserCheck, BarChartBig, ClipboardEdit, Brain, QrCode, BookUser, BarChart3, Loader2, FolderKanban } from 'lucide-react'; // Added FolderKanban
import Image from 'next/image';
import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import type { User, Group, AttendanceRecord } from '@/types'; // Changed ClassInfo to Group

interface QuickActionProps {
  href: string;
  icon: React.ElementType;
  label: string;
  bgColorClass: string;
  hoverBgColorClass: string;
  textColorClass: string;
}

const QuickActionButton: React.FC<QuickActionProps> = ({ href, icon: Icon, label, bgColorClass, hoverBgColorClass, textColorClass }) => (
  <Button
    asChild
    className={`w-full h-auto flex flex-col items-center justify-center p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 ${bgColorClass} ${hoverBgColorClass} ${textColorClass}`}
  >
    <Link href={href} className="flex flex-col items-center justify-center text-center">
      <Icon className="h-8 w-8 mb-2" />
      <span className="font-semibold text-sm">{label}</span>
    </Link>
  </Button>
);

export default function DashboardPage() {
  const [totalStudents, setTotalStudents] = useState(0);
  const [totalGroups, setTotalGroups] = useState(0); // Renamed totalClasses to totalGroups
  const [attendanceToday, setAttendanceToday] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        // Fetch from 'students' collection directly for total students
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        setTotalStudents(studentsSnapshot.size);

        const groupsSnapshot = await getDocs(collection(db, 'groups')); // Fetch from 'groups' collection
        setTotalGroups(groupsSnapshot.size); // Set totalGroups

        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1); // Start of tomorrow

        const attendanceQuery = query(
          collection(db, 'attendanceRecords'),
          where('status', '==', 'present')
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
      }
      setIsLoading(false);
    };

    fetchDashboardData();
  }, []);

  const renderStatCard = (title: string, value: number | string, Icon: React.ElementType, description: string) => (
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

  const quickActions: QuickActionProps[] = [
    { href: "/attendance-log", icon: ClipboardEdit, label: "Log Attendance", bgColorClass: "bg-blue-500", hoverBgColorClass: "hover:bg-blue-600", textColorClass: "text-white" },
    { href: "/attendance-records", icon: BookUser, label: "View Records", bgColorClass: "bg-yellow-400", hoverBgColorClass: "hover:bg-yellow-500", textColorClass: "text-yellow-900" },
    { href: "/reports", icon: BarChart3, label: "Generate Reports", bgColorClass: "bg-teal-500", hoverBgColorClass: "hover:bg-teal-600", textColorClass: "text-white" },
    { href: "/ai-analysis", icon: Brain, label: "AI Analysis", bgColorClass: "bg-orange-500", hoverBgColorClass: "hover:bg-orange-600", textColorClass: "text-white" },
    { href: "/qr-login-setup", icon: QrCode, label: "QR Session Login", bgColorClass: "bg-indigo-500", hoverBgColorClass: "hover:bg-indigo-600", textColorClass: "text-white" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold font-headline">Welcome to SERVEX</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {renderStatCard("Total Students", totalStudents, Users, "Currently enrolled")}
        {renderStatCard("Active Groups", totalGroups, FolderKanban, "Across all programs")} {/* Changed from Active Classes, UserCheck to FolderKanban */}
        {renderStatCard("Attendance Today", attendanceToday, BarChartBig, "Students marked present")}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Easily access common tasks.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quickActions.map(action => (
              <QuickActionButton key={action.href} {...action} />
            ))}
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
