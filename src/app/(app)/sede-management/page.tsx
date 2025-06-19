
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription as DialogPrimitiveDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { Loader2, PlusCircle, Edit, Trash2, Building, UserCircle, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db } from '@/lib/firebase';
import { collection, addDoc, getDocs, doc, deleteDoc, updateDoc, query, where, writeBatch } from 'firebase/firestore';
import type { Sede, User, Institution } from '@/types';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';

const sedeFormSchema = z.object({
  name: z.string().min(2, { message: "Sede name must be at least 2 characters." }),
  supervisorId: z.string().optional().or(z.literal('')),
});

type SedeFormValues = z.infer<typeof sedeFormSchema>;

const UNASSIGN_SUPERVISOR_KEY = "##NO_SUPERVISOR##";

export default function SedeManagementPage() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [supervisors, setSupervisors] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSedeFormDialogOpen, setIsSedeFormDialogOpen] = useState(false);
  const [editingSede, setEditingSede] = useState<Sede | null>(null);

  const { toast } = useToast();
  const { firestoreUser } = useAuth();

  const form = useForm<SedeFormValues>({
    resolver: zodResolver(sedeFormSchema),
    defaultValues: { name: '', supervisorId: '' },
  });

  const fetchSedesAndSupervisors = useCallback(async () => {
    if (!firestoreUser || !firestoreUser.institutionId) {
      setIsLoading(false);
      if (firestoreUser?.role === 'admin' && !firestoreUser.institutionId) {
        toast({ title: "Configuración Incompleta", description: "El administrador no está asociado a una institución.", variant: "destructive"});
      }
      return;
    }
    setIsLoading(true);
    try {
      const sedesQuery = query(collection(db, 'sedes'), where('institutionId', '==', firestoreUser.institutionId));
      const sedesSnapshotPromise = getDocs(sedesQuery);
      
      // Fetch supervisors that belong to the admin's institution
      const supervisorsQuery = query(collection(db, 'users'), 
        where('role', '==', 'supervisor'), 
        where('institutionId', '==', firestoreUser.institutionId)
      );
      const supervisorsSnapshotPromise = getDocs(supervisorsQuery);

      const [sedesSnapshot, supervisorsSnapshot] = await Promise.all([
        sedesSnapshotPromise,
        supervisorsSnapshotPromise,
      ]);

      setSedes(sedesSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as Sede)));
      setSupervisors(supervisorsSnapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() } as User)));
    } catch (error) {
      console.error("Error fetching sedes or supervisors:", error);
      toast({ title: 'Error fetching data', description: 'Could not load sedes or supervisors for your institution.', variant: 'destructive' });
    }
    setIsLoading(false);
  }, [toast, firestoreUser]);

  useEffect(() => {
    fetchSedesAndSupervisors();
  }, [fetchSedesAndSupervisors]);

  if (firestoreUser?.role !== 'admin') {
    return (
      <Card>
        <CardHeader><CardTitle>Access Denied</CardTitle></CardHeader>
        <CardContent><p>You do not have permission to manage Sedes.</p></CardContent>
      </Card>
    );
  }
  
  if (!firestoreUser?.institutionId && firestoreUser?.role === 'admin' && !isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle>Institución no Asignada</CardTitle></CardHeader>
        <CardContent><p>Esta cuenta de administrador no está asignada a ninguna institución. Por favor, contacte al soporte de la plataforma.</p></CardContent>
      </Card>
    );
  }


  const handleSedeFormSubmit = async (data: SedeFormValues) => {
    if (!firestoreUser?.institutionId) {
        toast({ title: 'Error', description: 'No se pudo determinar la institución del administrador.', variant: 'destructive'});
        return;
    }
    setIsSubmitting(true);
    const supervisorIdToSave = data.supervisorId === UNASSIGN_SUPERVISOR_KEY ? null : data.supervisorId || null;

    try {
      const batch = writeBatch(db);
      const institutionId = firestoreUser.institutionId;

      if (supervisorIdToSave && (!editingSede || editingSede.supervisorId !== supervisorIdToSave)) {
        const currentSedeOfNewSupervisor = sedes.find(s => s.supervisorId === supervisorIdToSave && s.id !== editingSede?.id && s.institutionId === institutionId);
        if (currentSedeOfNewSupervisor) {
          const oldSedeRef = doc(db, 'sedes', currentSedeOfNewSupervisor.id);
          batch.update(oldSedeRef, { supervisorId: null });
        }
        const supervisorUserRef = doc(db, 'users', supervisorIdToSave);
        batch.update(supervisorUserRef, { sedeId: editingSede ? editingSede.id : null });
      }
      if (editingSede && editingSede.supervisorId && supervisorIdToSave === null && editingSede.supervisorId !== supervisorIdToSave) {
         const supervisorUserRef = doc(db, 'users', editingSede.supervisorId);
         batch.update(supervisorUserRef, { sedeId: null });
      }

      if (editingSede) {
        const sedeRef = doc(db, 'sedes', editingSede.id);
        batch.update(sedeRef, { name: data.name, supervisorId: supervisorIdToSave, institutionId });
        if (editingSede.supervisorId && editingSede.supervisorId !== supervisorIdToSave) {
            const oldSupervisorUserRef = doc(db, 'users', editingSede.supervisorId);
            const isOldSupervisorStillAssignedElsewhereInInstitution = sedes.some(s => s.supervisorId === editingSede.supervisorId && s.id !== editingSede.id && s.institutionId === institutionId);
            if (!isOldSupervisorStillAssignedElsewhereInInstitution) {
                 batch.update(oldSupervisorUserRef, { sedeId: null });
            }
        }
        if (supervisorIdToSave) {
            const newSupervisorUserRef = doc(db, 'users', supervisorIdToSave);
            batch.update(newSupervisorUserRef, { sedeId: editingSede.id });
        }
        await batch.commit();
        toast({ title: 'Sede Updated', description: `Sede "${data.name}" updated successfully.` });
      } else {
        const newSedeData: Omit<Sede, 'id'> = { name: data.name, supervisorId: supervisorIdToSave, institutionId };
        const newSedeRef = await addDoc(collection(db, 'sedes'), newSedeData);
        if (supervisorIdToSave) {
            const supervisorUserRef = doc(db, 'users', supervisorIdToSave);
            await updateDoc(supervisorUserRef, { sedeId: newSedeRef.id });
        }
        toast({ title: 'Sede Created', description: `Sede "${data.name}" created successfully.` });
      }

      form.reset({ name: '', supervisorId: '' });
      setEditingSede(null);
      setIsSedeFormDialogOpen(false);
      await fetchSedesAndSupervisors();
    } catch (error) {
      console.error("Error saving Sede:", error);
      toast({ title: editingSede ? 'Update Sede Failed' : 'Create Sede Failed', description: 'Could not save the Sede.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const openEditSedeDialog = (sede: Sede) => {
    if (sede.institutionId !== firestoreUser?.institutionId) {
        toast({title: "Acción no permitida", description: "No puedes editar una Sede de otra institución.", variant: "destructive"});
        return;
    }
    setEditingSede(sede);
    form.reset({
      name: sede.name,
      supervisorId: sede.supervisorId || '',
    });
    setIsSedeFormDialogOpen(true);
  };

  const openAddSedeDialog = () => {
    setEditingSede(null);
    form.reset({ name: '', supervisorId: '' });
    setIsSedeFormDialogOpen(true);
  };

  const handleDeleteSede = async (sedeId: string, sedeName: string) => {
     const sedeToDelete = sedes.find(s => s.id === sedeId);
     if (sedeToDelete?.institutionId !== firestoreUser?.institutionId) {
        toast({title: "Acción no permitida", description: "No puedes eliminar una Sede de otra institución.", variant: "destructive"});
        return;
    }
    if (!confirm(`Are you sure you want to delete Sede "${sedeName}"? This may affect assigned supervisors and teachers.`)) return;
    setIsSubmitting(true);
    try {
      const batch = writeBatch(db);
      const sedeRef = doc(db, 'sedes', sedeId);

      if (sedeToDelete?.supervisorId) {
        const supervisorUserRef = doc(db, 'users', sedeToDelete.supervisorId);
        batch.update(supervisorUserRef, { sedeId: null });
      }

      const teachersInSedeQuery = query(collection(db, "users"), where("sedeId", "==", sedeId), where("role", "==", "teacher"));
      const teachersSnapshot = await getDocs(teachersInSedeQuery);
      teachersSnapshot.forEach(teacherDoc => {
        batch.update(doc(db, "users", teacherDoc.id), { sedeId: null });
      });

      batch.delete(sedeRef);
      await batch.commit();

      toast({ title: 'Sede Deleted', description: `Sede "${sedeName}" removed successfully.` });
      await fetchSedesAndSupervisors();
    } catch (error) {
      console.error("Error deleting Sede:", error);
      toast({ title: 'Delete Failed', description: 'Could not delete the Sede.', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getSupervisorName = (supervisorId?: string | null) => {
    if (!supervisorId) return <span className="text-muted-foreground">Not Assigned</span>;
    // Supervisors are already filtered by the admin's institutionId
    const supervisor = supervisors.find(s => s.id === supervisorId);
    return supervisor ? supervisor.name : <span className="text-destructive">Unknown Supervisor</span>;
  };

  const availableSupervisorsForAssignment = useMemo(() => {
    // Filter supervisors who are not already assigned to another Sede within the same institution
    // (unless it's the Sede being edited)
    return supervisors.filter(sup => {
        const isAssignedToAnotherSedeInThisInstitution = sedes.some(s => 
            s.supervisorId === sup.id && 
            s.id !== editingSede?.id && 
            s.institutionId === firestoreUser?.institutionId
        );
        return !isAssignedToAnotherSedeInThisInstitution;
    });
  }, [supervisors, sedes, editingSede, firestoreUser?.institutionId]);


  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building className="h-6 w-6 text-primary" /> Sede Management</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-center py-10">
          <Loader2 className="h-8 w-8 animate-spin text-primary" /><p className="ml-2">Loading Sedes and Supervisors...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Building className="h-6 w-6 text-primary" /> Sede Management</CardTitle>
            <CardDescription>Create, manage, and assign supervisors to your institution's branches or locations (Sedes).</CardDescription>
          </div>
          <Dialog open={isSedeFormDialogOpen} onOpenChange={setIsSedeFormDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-sm" onClick={openAddSedeDialog}>
                <PlusCircle className="size-3.5" /> Add New Sede
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{editingSede ? 'Edit Sede' : 'Create New Sede'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(handleSedeFormSubmit)} className="space-y-4 py-4">
                  <FormField control={form.control} name="name" render={({ field }) => (
                    <FormItem><FormLabel>Sede Name*</FormLabel><FormControl><Input placeholder="E.g., Main Campus, Downtown Branch" {...field} /></FormControl><FormMessage /></FormItem>
                  )}/>
                  <FormField control={form.control} name="supervisorId" render={({ field }) => (
                    <FormItem><FormLabel>Assign Supervisor (Optional)</FormLabel>
                      <Select onValueChange={(value) => field.onChange(value === UNASSIGN_SUPERVISOR_KEY ? '' : value)} value={field.value || UNASSIGN_SUPERVISOR_KEY}>
                        <FormControl><SelectTrigger><SelectValue placeholder="Select a supervisor" /></SelectTrigger></FormControl>
                        <SelectContent>
                          <SelectItem value={UNASSIGN_SUPERVISOR_KEY}>No Supervisor Assigned</SelectItem>
                          {availableSupervisorsForAssignment.map(sup => (
                            <SelectItem key={sup.id} value={sup.id}>{sup.name} ({sup.username})</SelectItem>
                          ))}
                           {editingSede?.supervisorId && !availableSupervisorsForAssignment.find(s => s.id === editingSede.supervisorId) && supervisors.find(s => s.id === editingSede.supervisorId) && (
                             <SelectItem key={editingSede.supervisorId} value={editingSede.supervisorId}>
                                {supervisors.find(s => s.id === editingSede.supervisorId)?.name} (Currently Assigned)
                             </SelectItem>
                           )}
                        </SelectContent>
                      </Select>
                      {availableSupervisorsForAssignment.length === 0 && (!editingSede || !editingSede.supervisorId) && <p className="text-xs text-muted-foreground mt-1">No unassigned supervisors available in this institution. Create one in Staff Management.</p>}
                      <FormMessage />
                    </FormItem>
                  )}/>
                  <DialogFooter className="pt-4">
                    <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
                    <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editingSede ? 'Save Changes' : 'Create Sede'}</Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {sedes.length === 0 ? (
            <div className="text-center py-10"><p className="text-muted-foreground">No Sedes found for your institution. Get started by adding a new Sede.</p></div>
          ) : (
            <Table>
              <TableHeader><TableRow>
                  <TableHead>Sede Name</TableHead><TableHead>Assigned Supervisor</TableHead><TableHead>Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {sedes.map((sede) => (
                  <TableRow key={sede.id}>
                    <TableCell className="font-medium">{sede.name}</TableCell>
                    <TableCell>{getSupervisorName(sede.supervisorId)}</TableCell>
                    <TableCell className="space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEditSedeDialog(sede)}><Edit className="h-4 w-4" /><span className="sr-only">Edit Sede</span></Button>
                      <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => handleDeleteSede(sede.id, sede.name)} disabled={isSubmitting}><Trash2 className="h-4 w-4" /><span className="sr-only">Delete Sede</span></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
