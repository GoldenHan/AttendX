
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, User as UserIcon, Building, SheetIcon } from 'lucide-react';
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
import { auth } from '@/lib/firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription as DialogPrimitiveDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { useRouter } from 'next/navigation';

const loginFormSchema = z.object({
  identifier: z.string().min(1, { message: "Por favor, ingresa tu correo electrónico o nombre de usuario." }),
  password: z.string().min(1, { message: "La contraseña es requerida." }),
});

const newAdminSignupFormSchema = z.object({
  institutionName: z.string().min(2, { message: "El nombre de la institución debe tener al menos 2 caracteres." }),
  adminName: z.string().min(2, { message: "El nombre del administrador debe tener al menos 2 caracteres." }),
  adminUsername: z.string().min(3, { message: "El nombre de usuario debe tener al menos 3 caracteres."}).regex(/^[a-zA-Z0-9_.-]+$/, "El nombre de usuario solo puede contener letras, números, puntos, guiones bajos o guiones."),
  adminEmail: z.string().email({ message: "Dirección de correo electrónico inválida." }),
  adminPassword: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
  confirmAdminPassword: z.string().min(6, { message: "La contraseña debe tener al menos 6 caracteres." }),
}).refine(data => data.adminPassword === data.confirmAdminPassword, {
  message: "Las contraseñas no coinciden.",
  path: ["confirmAdminPassword"],
});

const forgotPasswordSchema = z.object({
  email: z.string().email({ message: "Por favor, ingresa un correo electrónico válido." }),
});


type LoginFormValues = z.infer<typeof loginFormSchema>;
type NewAdminSignupFormValues = z.infer<typeof newAdminSignupFormSchema>;
type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg role="img" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path
        d="M12.48 10.92v3.28h7.84c-.24 1.84-.85 3.18-1.73 4.1-1.02 1.02-2.3 1.62-3.99 1.62-3.33 0-6.03-2.71-6.03-6.03s2.7-6.03 6.03-6.03c1.9 0 3.13.79 3.84 1.48l2.84-2.78C18.44 2.14 15.47 1 12.48 1 7.02 1 3 5.02 3 10.48s4.02 9.48 9.48 9.48c2.82 0 5.12-1.07 6.84-2.73 1.79-1.7 2.6-4.15 2.6-6.74 0-.58-.05-1.15-.13-1.72H12.48z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function AuthPage() {
  const [isRegisterDialogOpen, setIsRegisterDialogOpen] = useState(false);
  const { signIn, signInWithGoogle, signUp, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForgotPasswordDialogOpen, setIsForgotPasswordDialogOpen] = useState(false);

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: { identifier: '', password: '' },
  });

  const newAdminSignupForm = useForm<NewAdminSignupFormValues>({
    resolver: zodResolver(newAdminSignupFormSchema),
    defaultValues: { institutionName: '', adminName: '', adminUsername: '', adminEmail: '', adminPassword: '', confirmAdminPassword: '' },
  });

  const forgotPasswordForm = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  
  const currentLoadingState = authLoading || isSubmitting;

   useEffect(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const handleLoginSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      await signIn(data.identifier, data.password);
      toast({ title: 'Ingreso Exitoso', description: '¡Bienvenido/a de nuevo!' });
      router.replace('/'); 
    } catch (error: any) {
      toast({ title: 'Fallo de Ingreso', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    try {
      await signInWithGoogle();
      toast({ title: 'Ingreso Exitoso', description: '¡Bienvenido/a de nuevo!' });
      router.replace('/');
    } catch (error: any) {
      console.error("Google Login page error:", error);
      toast({ title: 'Fallo de Ingreso con Google', description: error.message, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNewAdminSignupSubmit = async (data: NewAdminSignupFormValues) => {
    setIsSubmitting(true);
    try {
      await signUp(
        data.adminName,
        data.adminUsername,
        data.adminEmail,
        data.adminPassword,
        'admin',
        undefined, 
        undefined, 
        data.institutionName 
      );
      toast({ title: 'Registro de Institución Exitoso', description: `Bienvenido/a, ${data.adminName}. Tu institución "${data.institutionName}" ha sido registrada. Ahora puedes iniciar sesión.` });
      setIsRegisterDialogOpen(false);
      loginForm.setValue('identifier', data.adminEmail);
    } catch (error: any) {
      let errorMessage = 'Fallo al registrar la nueva institución. Por favor, inténtalo de nuevo.';
      if (error.code === 'auth/email-already-in-use') errorMessage = 'Este correo electrónico ya está en uso.';
      else if (error.code === 'auth/weak-password') errorMessage = 'La contraseña es demasiado débil.';
      else if (error.message?.includes("Username already exists")) errorMessage = "Este nombre de usuario ya está en uso.";
      else if (error.message) errorMessage = `Error: ${error.message}`;
      toast({ title: 'Fallo de Registro', description: errorMessage, variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPasswordSubmit = async (data: ForgotPasswordFormValues) => {
    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, data.email);
      toast({
        title: 'Email de Restablecimiento Enviado',
        description: `Si existe una cuenta con ${data.email}, se ha enviado un enlace para restablecer tu contraseña.`,
      });
      setIsForgotPasswordDialogOpen(false);
      forgotPasswordForm.reset();
    } catch (error: any) {
      console.error("Forgot password error:", error);
      let errorMessage = "No se pudo enviar el correo de restablecimiento.";
      if (error.code === 'auth/user-not-found') {
         toast({
            title: 'Email de Restablecimiento Enviado',
            description: `Si existe una cuenta con ${data.email}, se ha enviado un enlace para restablecer la contraseña.`,
          });
          setIsForgotPasswordDialogOpen(false);
          forgotPasswordForm.reset();
          setIsSubmitting(false);
          return;
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "La dirección de correo electrónico no es válida.";
      }
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 font-body bg-gradient-to-br from-primary to-secondary/70">
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="text-center space-y-2">
            <SheetIcon className="mx-auto h-12 w-12 text-primary" />
            <CardTitle className="text-3xl font-bold">Bienvenido a AttendX</CardTitle>
            <CardDescription>Inicia sesión para gestionar tu institución.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <Form {...loginForm}>
                <form onSubmit={loginForm.handleSubmit(handleLoginSubmit)} className="space-y-4">
                    <FormField control={loginForm.control} name="identifier" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="sr-only">Email o Nombre de Usuario</FormLabel>
                         <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><UserIcon className="h-5 w-5 text-muted-foreground" /></div>
                            <FormControl><Input placeholder="Email o Nombre de Usuario" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                        </div>
                        <FormMessage className="text-xs text-left"/>
                      </FormItem>
                    )}/>
                    <FormField control={loginForm.control} name="password" render={({ field }) => (
                        <FormItem>
                            <FormLabel className="sr-only">Contraseña</FormLabel>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><Lock className="h-5 w-5 text-muted-foreground" /></div>
                                <FormControl><Input type="password" placeholder="Contraseña" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                            </div>
                            <FormMessage className="text-xs text-left"/>
                        </FormItem>
                    )}/>
                    <div className="text-right">
                        <Dialog open={isForgotPasswordDialogOpen} onOpenChange={setIsForgotPasswordDialogOpen}>
                          <DialogTrigger asChild>
                            <Button type="button" variant="link" className="text-xs text-primary hover:underline p-0 h-auto">¿Olvidaste tu contraseña?</Button>
                          </DialogTrigger>
                          <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                              <DialogTitle>Restablecer Contraseña</DialogTitle>
                              <DialogPrimitiveDescription>Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.</DialogPrimitiveDescription>
                            </DialogHeader>
                            <Form {...forgotPasswordForm}>
                              <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPasswordSubmit)} className="space-y-4">
                                <FormField control={forgotPasswordForm.control} name="email" render={({ field }) => (
                                    <FormItem><FormLabel htmlFor="forgot-email">Correo Electrónico</FormLabel><FormControl><Input id="forgot-email" type="email" placeholder="tu@email.com" {...field} /></FormControl><FormMessage /></FormItem>
                                )}/>
                                <DialogFooter>
                                  <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                                  <Button type="submit" disabled={isSubmitting}>{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Enviar Email</Button>
                                </DialogFooter>
                              </form>
                            </Form>
                          </DialogContent>
                        </Dialog>
                    </div>
                     <Button type="submit" className="w-full" disabled={currentLoadingState}>
                        {currentLoadingState && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Iniciar Sesión
                      </Button>
                </form>
            </Form>
            <div className="relative my-4"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">O</span></div></div>
            <Button variant="outline" className="w-full" onClick={handleGoogleLogin} disabled={currentLoadingState}>
                {currentLoadingState ? (<Loader2 className="mr-2 h-4 w-4 animate-spin" />) : (<GoogleIcon className="mr-2 h-4 w-4" />)}
                Iniciar Sesión con Google
            </Button>
            <div className="mt-6 text-center text-sm">
                ¿Registrando una nueva institución?{" "}
                 <Dialog open={isRegisterDialogOpen} onOpenChange={setIsRegisterDialogOpen}>
                    <DialogTrigger asChild>
                       <Button variant="link" className="font-semibold p-0 h-auto">Crea una cuenta de administrador</Button>
                    </DialogTrigger>
                    <DialogContent>
                         <DialogHeader>
                            <DialogTitle>Registrar Nueva Institución</DialogTitle>
                             <DialogPrimitiveDescription>Crea la cuenta principal de administrador para tu institución educativa. El nombre de usuario será tu contraseña inicial.</DialogPrimitiveDescription>
                        </DialogHeader>
                         <Form {...newAdminSignupForm}>
                            <form onSubmit={newAdminSignupForm.handleSubmit(handleNewAdminSignupSubmit)} className="space-y-3 py-4 max-h-[70vh] overflow-y-auto pr-2">
                                <FormField control={newAdminSignupForm.control} name="institutionName" render={({ field }) => (<FormItem><FormLabel>Nombre de la Institución</FormLabel><FormControl><Input placeholder="Academia de Idiomas Global" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={newAdminSignupForm.control} name="adminName" render={({ field }) => (<FormItem><FormLabel>Nombre Completo del Administrador</FormLabel><FormControl><Input placeholder="John Doe" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={newAdminSignupForm.control} name="adminUsername" render={({ field }) => (<FormItem><FormLabel>Nombre de Usuario para Admin</FormLabel><FormControl><Input placeholder="johndoe_admin" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={newAdminSignupForm.control} name="adminEmail" render={({ field }) => (<FormItem><FormLabel>Email del Administrador</FormLabel><FormControl><Input type="email" placeholder="admin@globalacademy.com" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={newAdminSignupForm.control} name="adminPassword" render={({ field }) => (<FormItem><FormLabel>Contraseña para Admin</FormLabel><FormControl><Input type="password" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>)}/>
                                <FormField control={newAdminSignupForm.control} name="confirmAdminPassword" render={({ field }) => (<FormItem><FormLabel>Confirmar Contraseña</FormLabel><FormControl><Input type="password" {...field} disabled={currentLoadingState} /></FormControl><FormMessage /></FormItem>)}/>
                                <DialogFooter className="pt-4">
                                    <DialogClose asChild><Button type="button" variant="outline">Cancelar</Button></DialogClose>
                                    <Button type="submit" disabled={currentLoadingState}>
                                        {currentLoadingState ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Registrar'}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </Form>
                    </DialogContent>
                 </Dialog>
            </div>
        </CardContent>
      </Card>
    </div>
  );
}
