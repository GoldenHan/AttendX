
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, BarChart3, ClipboardList, Receipt, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';

interface ReportCardProps {
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  roles?: string[];
}

const ReportCard: React.FC<ReportCardProps> = ({ title, description, href, icon: Icon, roles }) => {
  const { firestoreUser } = useAuth();

  if (roles && firestoreUser?.role && !roles.includes(firestoreUser.role)) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-4">
          <Icon className="h-8 w-8 text-primary" />
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Button asChild>
          <Link href={href}>
            Ver Reporte <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
};

export default function ReportsHubPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Centro de Reportes</h1>
        <p className="text-muted-foreground">
          Accede a todos los reportes y análisis de datos de tu institución desde un solo lugar.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ReportCard
          title="Reporte de Asistencia de Estudiantes"
          description="Analiza la asistencia, ausencias y tardanzas de los estudiantes por grupo o en general."
          href="/attendance-reports"
          icon={BarChart3}
          roles={['admin', 'teacher', 'caja', 'supervisor']}
        />
        <ReportCard
          title="Reporte de Calificaciones Parciales"
          description="Consulta un resumen detallado de las calificaciones de los estudiantes por parcial y nivel."
          href="/partial-grades-report"
          icon={ClipboardList}
          roles={['admin', 'teacher', 'supervisor']}
        />
        <ReportCard
          title="Reporte de Pagos"
          description="Visualiza y exporta todos los registros de pagos filtrados por grupo o rango de fechas."
          href="/payment-reports"
          icon={Receipt}
          roles={['admin', 'caja', 'supervisor']}
        />
        <ReportCard
          title="Reporte de Asistencia de Personal"
          description="Revisa los registros de llegada de maestros, administradores y supervisores."
          href="/staff-attendance-report"
          icon={ListChecks}
          roles={['admin', 'supervisor']}
        />
      </div>
    </div>
  );
}
