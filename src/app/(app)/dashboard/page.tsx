
'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Users, 
  BarChartBig, 
  ClipboardEdit, 
  BookUser, 
  BarChart3, 
  Loader2, 
  FolderKanban,
  GraduationCap, // Added for Student Management
  ClipboardCheck // Added for Grades Management
} from 'lucide-react';
import Image from 'next/image';
import React, { useState, useEffect } from 'react';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import type { User, Group, AttendanceRecord } from '@/types';

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
  const [totalGroups, setTotalGroups] = useState(0);
  const [attendanceToday, setAttendanceToday] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      setIsLoading(true);
      try {
        const studentsSnapshot = await getDocs(collection(db, 'students'));
        setTotalStudents(studentsSnapshot.size);

        const groupsSnapshot = await getDocs(collection(db, 'groups'));
        setTotalGroups(groupsSnapshot.size);

        const today = new Date();
        today.setHours(0, 0, 0, 0); 
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

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
    { href: "/attendance-records", icon: BookUser, label: "View Records", bgColorClass: "bg-green-500", hoverBgColorClass: "hover:bg-green-600", textColorClass: "text-white" },
    { href: "/student-management", icon: GraduationCap, label: "Students", bgColorClass: "bg-purple-500", hoverBgColorClass: "hover:bg-purple-600", textColorClass: "text-white" },
    { href: "/group-management", icon: FolderKanban, label: "Groups", bgColorClass: "bg-yellow-400", hoverBgColorClass: "hover:bg-yellow-500", textColorClass: "text-yellow-900" },
    { href: "/grades-management", icon: ClipboardCheck, label: "Grades", bgColorClass: "bg-pink-500", hoverBgColorClass: "hover:bg-pink-600", textColorClass: "text-white" },
    { href: "/reports", icon: BarChart3, label: "Reports", bgColorClass: "bg-teal-500", hoverBgColorClass: "hover:bg-teal-600", textColorClass: "text-white" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold font-headline">Welcome to SERVEX</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {renderStatCard("Total Students", totalStudents, Users, "Currently enrolled")}
        {renderStatCard("Active Groups", totalGroups, FolderKanban, "Across all programs")}
        {renderStatCard("Attendance Today", attendanceToday, BarChartBig, "Students marked present")}
      </div>

      <div className="grid gap-4 md:grid-cols-1"> {/* Changed to 1 column for full width quick actions card */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Easily access common tasks.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-4"> {/* Adjusted grid for more items */}
            {quickActions.map(action => (
              <QuickActionButton key={action.href} {...action} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
