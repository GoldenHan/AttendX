
'use client';

import React, { useState, useEffect } from 'react'; 
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock, User as UserIcon, Building } from 'lucide-react'; 
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
import { cn } from '@/lib/utils';
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

const loginFormSchema = z.object({
  identifier: z.string().min(1, { message: "El nombre de usuario o email es requerido." }),
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

export default function AuthPage() {
  const [isSignUpActive, setIsSignUpActive] = useState(false);
  const { signIn, signUp, loading: authLoading } = useAuth();
  const { toast } = useToast();
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
    // Remove dark class on mount if present from other pages
    document.documentElement.classList.remove('dark');
  }, []);

  const handleLoginSubmit = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      await signIn(data.identifier, data.password);
      toast({ title: 'Ingreso Exitoso', description: '¡Bienvenido/a de nuevo!' });
    } catch (error: any) {
      let errorMessage = 'Fallo al ingresar. Verifica tus credenciales.';
      if (error.code === 'auth/user-not-found' ||
          error.code === 'auth/wrong-password' ||
          error.code === 'auth/invalid-credential' ||
          error.code === 'auth/invalid-email') {
        errorMessage = 'Correo electrónico o contraseña incorrectos.';
      } else if (error.message === 'El usuario no tiene un correo electrónico asociado. Contacta al administrador.' ||
                 error.message === 'El usuario (estudiante) no tiene un correo electrónico asociado. Contacta al administrador.' ||
                 error.message === 'Nombre de usuario no encontrado.') {
        errorMessage = error.message;
      }
      console.error("Login page error:", error);
      toast({ title: 'Fallo de Ingreso', description: errorMessage, variant: 'destructive' });
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
        'admin' // Explicitly role 'admin' for this signup form
      );
      toast({ title: 'Registro de Institución Exitoso', description: `Bienvenido/a, ${data.adminName}. Tu institución "${data.institutionName}" ha sido registrada. Serás redirigido/a para iniciar sesión.` });
      setIsSignUpActive(false); 
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
        description: `Si existe una cuenta con ${data.email}, se ha enviado un enlace para restablecer la contraseña.`,
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
    <div className={cn(
        "flex min-h-screen flex-col items-center justify-center p-4 font-body transition-colors duration-700",
        isSignUpActive ? 'bg-gradient-to-br from-signup-panel to-signup-panel/70' : 'bg-gradient-to-br from-primary to-primary/70'
      )}
    >
      <div
        className={cn(
          "relative h-[750px] sm:h-[700px] w-full max-w-4xl overflow-hidden rounded-2xl shadow-2xl", 
          "container"
        )}
      >
        {/* New Institution Admin Sign Up Form Container */}
        <div
          className={cn(
            "form-container sign-up-container absolute top-0 left-0 h-full w-1/2 z-10 transition-all duration-700 ease-in-out",
            isSignUpActive ? "translate-x-full opacity-100 z-20 animate-show" : "opacity-0 z-10"
          )}
        >
          <Form {...newAdminSignupForm}>
            <form
              onSubmit={newAdminSignupForm.handleSubmit(handleNewAdminSignupSubmit)}
              className="flex h-full flex-col items-center justify-center space-y-3 bg-card px-10 text-center text-card-foreground"
            >
              <h1 className="text-3xl font-bold mb-4 text-primary">Registrar Nueva Institución</h1>
              <p className="text-xs text-muted-foreground mb-3">Crea la cuenta principal de administrador para tu institución educativa.</p>
              
              <FormField control={newAdminSignupForm.control} name="institutionName" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Nombre de la Institución</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Building className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <FormControl><Input placeholder="Nombre de la Institución" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={newAdminSignupForm.control} name="adminName" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Nombre del Administrador</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <FormControl><Input placeholder="Nombre Completo del Administrador" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={newAdminSignupForm.control} name="adminUsername" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Nombre de Usuario del Admin</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <UserIcon className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <FormControl><Input placeholder="Nombre de Usuario para Admin" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={newAdminSignupForm.control} name="adminEmail" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Email del Administrador</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <FormControl><Input type="email" placeholder="Email del Administrador" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={newAdminSignupForm.control} name="adminPassword" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Contraseña del Administrador</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <FormControl><Input type="password" placeholder="Contraseña para Administrador" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <FormField control={newAdminSignupForm.control} name="confirmAdminPassword" render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel className="sr-only">Confirmar Contraseña del Admin</FormLabel>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <FormControl><Input type="password" placeholder="Confirmar Contraseña del Admin" {...field} disabled={currentLoadingState} className="bg-input pl-10" /></FormControl>
                  </div>
                  <FormMessage className="text-xs text-left" />
                </FormItem>
              )}/>
              <Button type="submit" variant="default" className="mt-3 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-wider bg-primary text-primary-foreground hover:bg-primary/90" disabled={currentLoadingState}>
                {currentLoadingState && isSignUpActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Registrar Institución'}
              </Button>
            </form>
          </Form>
        </div>

        {/* Sign In Form Container */}
        <div
          className={cn(
            "form-container sign-in-container absolute top-0 left-0 h-full w-1/2 z-20 transition-all duration-700 ease-in-out",
             isSignUpActive && "translate-x-full opacity-0 z-10"
          )}
        >
          <Form {...loginForm}>
            <form
              onSubmit={loginForm.handleSubmit(handleLoginSubmit)}
              className="flex h-full flex-col items-center justify-center space-y-4 bg-card px-10 text-center text-card-foreground"
            >
              <h1 className="text-3xl font-bold mb-6 text-primary">Iniciar Sesión</h1>
               <FormField
                control={loginForm.control}
                name="identifier"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel className="sr-only">Nombre de Usuario o Email</FormLabel>
                     <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <UserIcon className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <FormControl>
                          <Input placeholder="Nombre de Usuario o Email" {...field} disabled={currentLoadingState} className="bg-input pl-10" />
                        </FormControl>
                    </div>
                    <FormMessage className="text-xs text-left"/>
                  </FormItem>
                )}
              />
              <FormField
                control={loginForm.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel className="sr-only">Contraseña</FormLabel>
                    <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Lock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <FormControl>
                        <Input type="password" placeholder="Contraseña" {...field} disabled={currentLoadingState} className="bg-input pl-10" />
                        </FormControl>
                    </div>
                    <FormMessage className="text-xs text-left"/>
                  </FormItem>
                )}
              />
              <div className="w-full text-right mt-1">
                <Dialog open={isForgotPasswordDialogOpen} onOpenChange={setIsForgotPasswordDialogOpen}>
                  <DialogTrigger asChild>
                    <Button type="button" variant="link" className="text-xs text-primary hover:underline p-0 h-auto">
                      ¿Olvidaste tu contraseña?
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Restablecer Contraseña</DialogTitle>
                      <DialogPrimitiveDescription>
                        Ingresa tu correo electrónico y te enviaremos un enlace para restablecer tu contraseña.
                      </DialogPrimitiveDescription>
                    </DialogHeader>
                    <Form {...forgotPasswordForm}>
                      <form onSubmit={forgotPasswordForm.handleSubmit(handleForgotPasswordSubmit)} className="space-y-4">
                        <FormField
                          control={forgotPasswordForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel htmlFor="forgot-email">Correo Electrónico</FormLabel>
                              <FormControl>
                                <Input id="forgot-email" type="email" placeholder="tu@email.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <DialogFooter>
                          <DialogClose asChild>
                            <Button type="button" variant="outline">Cancelar</Button>
                          </DialogClose>
                          <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Enviar Email
                          </Button>
                        </DialogFooter>
                      </form>
                    </Form>
                  </DialogContent>
                </Dialog>
              </div>
              <Button type="submit" variant="default" className="mt-4 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-wider" disabled={currentLoadingState}>
                {currentLoadingState && !isSignUpActive ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Ingresar'}
              </Button>
            </form>
          </Form>
        </div>

        {/* Overlay Container */}
        <div
          className={cn(
            "overlay-container absolute top-0 left-1/2 h-full w-1/2 overflow-hidden z-50 transition-transform duration-700 ease-in-out",
            isSignUpActive ? "-translate-x-full" : "translate-x-0"
          )}
        >
          <div
            className={cn(
              "overlay relative -left-full h-full w-[200%] transform transition-transform duration-700 ease-in-out",
              isSignUpActive ? "translate-x-1/2" : "translate-x-0"
            )}
          >
            {/* Overlay Left Panel (Prompts to Sign In, visible when SignUp form is active) */}
            <div
              className={cn(
                "overlay-panel overlay-left absolute top-0 flex h-full w-1/2 flex-col items-center justify-center px-10 text-center transform clip-edge-right-gearish",
                "bg-primary" 
              )}
            >
              <h1 className="text-3xl font-bold text-primary-foreground">¡Bienvenido de Nuevo!</h1>
              <p className="mt-4 text-sm font-light leading-relaxed text-primary-foreground">
                Si ya tienes una cuenta de administrador para tu institución, por favor inicia sesión aquí.
              </p>
              <Button
                variant="outline"
                className={cn(
                    "mt-8 rounded-full px-8 py-3 text-sm font-semibold uppercase tracking-wider",
                    "bg-primary-foreground text-primary hover:bg-primary-foreground/90 focus:bg-primary-foreground/90"
                )}
                onClick={() => { loginForm.reset(); setIsSignUpActive(false); }}
                disabled={currentLoadingState}
              >
                Iniciar Sesión
              </Button>
            </div>

            {/* Overlay Right Panel (Prompts to Sign Up, visible when SignIn form is active) */}
            <div
              className={cn(
                "overlay-panel overlay-right absolute top-0 right-0 flex h-full w-1/2 flex-col items-center justify-center px-10 text-center transform clip-edge-left-gearish",
                "bg-signup-panel text-signup-panel-foreground" 
              )}
            >
              <h1 className="text-3xl font-bold">¿Nueva Institución?</h1>
              <p className="mt-4 text-sm font-light leading-relaxed">
                Registra tu institución educativa y configura la cuenta de administrador principal para comenzar.
              </p>
              <Button
                className="mt-8 rounded-full px-8 py-3 text-sm font-bold uppercase tracking-wider bg-signup-panel-foreground text-signup-panel hover:bg-signup-panel-foreground/90"
                onClick={() => { newAdminSignupForm.reset(); setIsSignUpActive(true); }}
                disabled={currentLoadingState}
              >
                Registrar mi Institución
              </Button>
            </div>
          </div>
        </div>
      </div>
      <style jsx global>{`
        .animate-show {
          animation: show 0.7s;
        }
        @keyframes show {
          0%, 49.99% {
            opacity: 0;
            z-index: 10;
          }
          50%, 100% {
            opacity: 1;
            z-index: 20;
          }
        }
      `}</style>
    </div>
  );
}

